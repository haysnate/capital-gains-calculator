"use strict";

// ============================================================
//  Capital Gains Tax Calculator: all math runs locally.
//  Tax year 2026 estimates (Rev. Proc. 2025-32). Not tax advice.
// ============================================================

// ---- 2026 long-term capital gains breakpoints (taxable income) ----
// 0% up to `zero`, 15% up to `fifteen`, 20% above.
const LTCG = {
  single:  { zero: 49450, fifteen: 545500 },
  married: { zero: 98900, fifteen: 613700 },
  hoh:     { zero: 66200, fifteen: 579600 },
};

// ---- 2026 federal ordinary brackets (for short-term gains) ----
const FED = {
  single:  [[12400,.10],[50400,.12],[105700,.22],[201775,.24],[256225,.32],[640600,.35],[Infinity,.37]],
  married: [[24800,.10],[100800,.12],[211400,.22],[403550,.24],[512450,.32],[768700,.35],[Infinity,.37]],
  hoh:     [[17700,.10],[67450,.12],[105700,.22],[201800,.24],[256250,.32],[640600,.35],[Infinity,.37]],
};

// ---- 2026 federal standard deductions (for stdFed states) ----
const FED_STD = { single: 16100, married: 32200, hoh: 24150 };

// ---- Net investment income tax ----
const NIIT_RATE = 0.038;
const NIIT_THRESHOLD = { single: 200000, married: 250000, hoh: 200000 };

// ---- Primary-home exclusion (§121) ----
const HOME_EXCLUSION = { single: 250000, married: 500000, hoh: 250000 };

// ---- State income tax (2026, Tax Foundation "State Individual Income Tax
// Rates and Brackets, 2026", verified 2026-07-21; gains taxed as ordinary income) ----
// flat: single rate. brackets: [upperBound, rate] pairs (single filer);
// married thresholds are doubled (common approximation) unless noMult
// (noMult: same brackets for joint filers) or an explicit bracketsM schedule.
// bracketsH: explicit head-of-household schedule where published for 2026.
// std: state standard deduction (single); stdM/stdH: married/HOH amounts when
// not simply double/equal; stdFed: state uses the federal standard deduction.
// exclLong: fraction of a long-term gain the state excludes (modeled).
// hiAlt: Hawaii's elective alternative rate cap on long-term gains (modeled).
// mtLtcg: Montana's own long-term rate table thresholds (modeled).
// sciad: South Carolina's Income Adjusted Deduction [base, phaseStart, span];
//   the reduction rounds DOWN to the nearest $10 per the statute.
// dedLong: flat-dollar deduction against long-term gains (NM: up to $2,500).
// stdSlide: WI sliding-scale deduction [base, phaseStart, rate] per status
// (2025 DOR table; HOH converges onto the single line).
// local: state has local income taxes in some areas (not modeled; disclosed).
const STATES = {
  AL: { name: "Alabama", local: true, std: 3000, stdM: 8500, brackets: [[500,.02],[3000,.04],[Infinity,.05]] },
  AK: { name: "Alaska", none: true },
  AZ: { name: "Arizona", std: 8350, flat: .025 },
  AR: { name: "Arkansas", exclLong: .50, std: 2470, brackets: [[4600,.02],[Infinity,.039]] },
  CA: { name: "California", std: 5540, brackets: [[11079,.01],[26264,.02],[41452,.04],[57542,.06],[72724,.08],[371479,.093],[445771,.103],[742953,.113],[1000000,.123],[Infinity,.133]] },
  CO: { name: "Colorado", stdFed: true, flat: .044 },
  CT: { name: "Connecticut", brackets: [[10000,.02],[50000,.045],[100000,.055],[200000,.06],[250000,.065],[500000,.069],[Infinity,.0699]] },
  DE: { name: "Delaware", local: true, std: 3250, brackets: [[2000,0],[5000,.022],[10000,.039],[20000,.048],[25000,.052],[60000,.0555],[Infinity,.066]] },
  DC: { name: "District of Columbia", stdFed: true, brackets: [[10000,.04],[40000,.06],[60000,.065],[250000,.085],[500000,.0925],[1000000,.0975],[Infinity,.1075]] },
  FL: { name: "Florida", none: true },
  GA: { name: "Georgia", std: 15000, stdM: 30000, flat: .0499 },
  HI: { name: "Hawaii", hiAlt: .0725, std: 4400, brackets: [[9600,.014],[14400,.032],[19200,.055],[24000,.064],[36000,.068],[48000,.072],[125000,.076],[175000,.079],[225000,.0825],[275000,.09],[325000,.10],[Infinity,.11]] },
  ID: { name: "Idaho", stdFed: true, flat: .053 },
  IL: { name: "Illinois", flat: .0495 },
  IN: { name: "Indiana", local: true, flat: .0295 },
  IA: { name: "Iowa", stdFed: true, flat: .038 },
  KS: { name: "Kansas", std: 3605, stdM: 8240, brackets: [[23000,.052],[Infinity,.0558]] },
  KY: { name: "Kentucky", local: true, std: 3360, stdM: 3360, flat: .035 },
  LA: { name: "Louisiana", std: 12875, flat: .03 },
  ME: { name: "Maine", std: 8350, brackets: [[27400,.058],[64850,.0675],[Infinity,.0715]] },
  MD: { name: "Maryland", local: true, std: 3350, brackets: [[1000,.02],[2000,.03],[3000,.04],[100000,.0475],[125000,.05],[150000,.0525],[250000,.055],[500000,.0575],[1000000,.0625],[Infinity,.065]] },
  MA: { name: "Massachusetts", stShort: .085, noMult: true, brackets: [[1107750,.05],[Infinity,.09]] },
  MI: { name: "Michigan", local: true, flat: .0425 },
  MN: { name: "Minnesota", std: 15300, stdM: 30600, stdH: 23000, stdPhase: { t1: 244400, t2: 337800 }, brackets: [[33310,.0535],[109430,.068],[203150,.0785],[Infinity,.0985]], bracketsM: [[48700,.0535],[193480,.068],[337930,.0785],[Infinity,.0985]], bracketsH: [[41010,.0535],[164800,.068],[270060,.0785],[Infinity,.0985]] },
  MS: { name: "Mississippi", std: 2300, flat: .04 },
  MO: { name: "Missouri", local: true, stdFed: true, brackets: [[1348,0],[2696,.02],[4044,.025],[5392,.03],[6740,.035],[8088,.04],[9436,.045],[Infinity,.047]] },
  MT: { name: "Montana", mtLtcg: { single: 20500, married: 41000, hoh: 30750 }, stdFed: true, brackets: [[47500,.047],[Infinity,.0565]] },
  NE: { name: "Nebraska", std: 8850, brackets: [[4130,.0246],[24760,.0351],[Infinity,.0455]] },
  NV: { name: "Nevada", none: true },
  NH: { name: "New Hampshire", none: true },
  NJ: { name: "New Jersey", brackets: [[20000,.014],[35000,.0175],[40000,.035],[75000,.05525],[500000,.0637],[1000000,.0897],[Infinity,.1075]] },
  NM: { name: "New Mexico", dedLong: 2500, stdFed: true, brackets: [[5500,.015],[16500,.032],[33500,.043],[66500,.047],[210000,.049],[Infinity,.059]] },
  NY: { name: "New York", local: true, std: 8000, stdM: 16050, brackets: [[8500,.039],[11700,.044],[13900,.0515],[80650,.054],[215400,.059],[1077550,.0685],[5000000,.0965],[25000000,.103],[Infinity,.109]] },
  NC: { name: "North Carolina", std: 12750, flat: .0399 },
  ND: { name: "North Dakota", exclLong: .40, stdFed: true, brackets: [[48475,0],[244825,.0195],[Infinity,.025]] },
  OH: { name: "Ohio", local: true, brackets: [[26050,0],[Infinity,.0275]] },
  OK: { name: "Oklahoma", std: 6350, brackets: [[3750,0],[4900,.025],[7200,.035],[Infinity,.045]] },
  OR: { name: "Oregon", local: true, std: 2910, brackets: [[4550,.0475],[11400,.0675],[125000,.0875],[Infinity,.099]] },
  PA: { name: "Pennsylvania", local: true, flat: .0307 },
  RI: { name: "Rhode Island", std: 11200, brackets: [[82050,.0375],[186450,.0475],[Infinity,.0599]] },
  SC: { name: "South Carolina", exclLong: .44, noMult: true, sciad: { single: [15000,40000,55000], married: [30000,80000,110000], hoh: [22500,60000,82500] }, brackets: [[30000,.0199],[Infinity,.0521]] },
  SD: { name: "South Dakota", none: true },
  TN: { name: "Tennessee", none: true },
  TX: { name: "Texas", none: true },
  UT: { name: "Utah", flat: .045 },
  VT: { name: "Vermont", std: 7650, brackets: [[49400,.0335],[119700,.066],[249700,.076],[Infinity,.0875]] },
  VA: { name: "Virginia", std: 8750, brackets: [[3000,.02],[5000,.03],[17000,.05],[Infinity,.0575]] },
  WA: { name: "Washington", none: true, waCapGains: true },
  WV: { name: "West Virginia", local: true, noMult: true, brackets: [[10000,.0211],[25000,.0281],[40000,.0316],[60000,.0422],[Infinity,.0458]] },
  WI: { name: "Wisconsin", exclLong: .30, stdSlide: { single: [13560,19550,.12], married: [25110,28210,.19778], hoh: [17520,19550,.22515] }, brackets: [[15110,.035],[51950,.044],[332720,.053],[Infinity,.0765]] },
  WY: { name: "Wyoming", none: true },
};

// Washington's capital gains excise tax (long-term gains only; real estate exempt).
const WA_DEDUCTION = 278000;   // 2025 indexed standard deduction (estimate)
const WA_RATE = 0.07, WA_SURTAX = 0.029, WA_SURTAX_ABOVE = 1000000;

// ---- helpers ----
const $ = (id) => document.getElementById(id);
const el = {
  purchase: $("purchase"), sale: $("sale"), income: $("income"),
  termShort: $("termShort"), termLong: $("termLong"),
  filing: $("filing"), state: $("state"),
  homeSale: $("homeSale"), homeHint: $("homeHint"),
  waEstate: $("waEstate"), waEstateRow: $("waEstateRow"),
  taxLabel: $("taxLabel"), totalTax: $("totalTax"), savingsBox: $("savingsBox"),
  donut: $("donut"),
  legKept: $("legKept"), legFed: $("legFed"), legNiit: $("legNiit"), legState: $("legState"),
  legNiitRow: $("legNiitRow"), legStateRow: $("legStateRow"),
  rGainLabel: $("rGainLabel"), rGain: $("rGain"),
  rExclRow: $("rExclRow"), rExcl: $("rExcl"), rTaxableRow: $("rTaxableRow"), rTaxable: $("rTaxable"),
  rProceeds: $("rProceeds"), rKept: $("rKept"), rEffRate: $("rEffRate"),
  taxNote: $("taxNote"),
};
let term = "long";

function num(node) {
  // strip currency formatting, then require the remainder to be one plain
  // number; malformed input ("1e6", "1.2.3") reads as 0, never reinterpreted
  const v = String(node.value).replace(/[$,\s]/g, "");
  if (!/^\d*\.?\d*$/.test(v)) return 0;
  const n = parseFloat(v);
  return isFinite(n) && n >= 0 ? n : 0;
}
const _fmtCache = {};
function money(n, dp = 0) {
  if (!isFinite(n)) n = 0;
  if (!_fmtCache[dp]) _fmtCache[dp] = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: dp, maximumFractionDigits: dp });
  return _fmtCache[dp].format(n);
}

const COLORS = {};
["fed", "niit", "state", "kept"].forEach((k) => {
  COLORS[k] = getComputedStyle(document.documentElement).getPropertyValue("--c-" + k).trim();
});

// progressive bracket tax on `taxable`; thresholds scaled by `mult` (2 for married)
function bracketTax(taxable, brackets, mult) {
  let tax = 0, prev = 0;
  for (const [bound, rate] of brackets) {
    const upper = bound === Infinity ? Infinity : bound * mult;
    if (taxable <= prev) break;
    tax += (Math.min(taxable, upper) - prev) * rate;
    prev = upper;
  }
  return tax;
}

// Federal tax on a long-term gain stacked on top of `ordinary` taxable income.
function fedLongTax(ordinary, gain, filing) {
  const { zero, fifteen } = LTCG[filing];
  const lo = ordinary, hi = ordinary + gain;
  const at15 = Math.max(0, Math.min(hi, fifteen) - Math.max(lo, zero));
  const at20 = Math.max(0, hi - Math.max(lo, fifteen));
  return at15 * .15 + at20 * .20;
}

// Federal tax on a short-term gain: ordinary brackets, marginal stacking.
function fedShortTax(ordinary, gain, filing) {
  const b = FED[filing];
  return bracketTax(ordinary + gain, b, 1) - bracketTax(ordinary, b, 1);
}

function niitTax(ordinary, gain, filing) {
  // MAGI approximation: the taxable-income input plus the standard deduction
  // (MAGI sits above taxable income by at least the deduction), plus the gain
  const magi = ordinary + FED_STD[filing] + gain;
  return NIIT_RATE * Math.max(0, Math.min(gain, magi - NIIT_THRESHOLD[filing]));
}

// State tax on the gain: marginal stacking on state ordinary-income rates,
// with modeled long-term preferences (exclusions, HI alternative rate,
// MT rate table, SC SCIAD) where the state publishes one.
function stateGainTax(code, ordinary, gain, filing, isLong, isHome, isRealEstate) {
  const s = STATES[code];
  if (!s) return 0;
  if (s.waCapGains) {
    // WA taxes only long-term gains; ALL real estate is exempt, not just homes
    if (!isLong || isHome || isRealEstate) return 0;
    const base = Math.max(0, gain - WA_DEDUCTION);
    return base * WA_RATE + Math.max(0, base - WA_SURTAX_ABOVE) * WA_SURTAX;
  }
  if (s.none) return 0;
  if (s.stShort && !isLong) {
    // MA short-term rate, plus the 4% surtax on taxable income above the
    // threshold (the surtax applies to short-term gains too)
    const T = s.brackets[0][0];
    return gain * s.stShort + .04 * (Math.max(0, ordinary + gain - T) - Math.max(0, ordinary - T));
  }
  // Montana: long-term gains get their own 3.0%/4.1% table, the lower
  // bracket consumed by other taxable income first
  if (s.mtLtcg && isLong) {
    const B = s.mtLtcg[filing];
    const at3 = Math.max(0, Math.min(ordinary + gain, B) - Math.min(ordinary, B));
    return at3 * .03 + (gain - at3) * .041;
  }
  let gEff = (isLong && s.exclLong) ? gain * (1 - s.exclLong) : gain;
  // NM: up to $2,500 of net capital gain is deductible for any asset (the 40%
  // New-Mexico-business alternative is not modeled)
  if (isLong && s.dedLong) gEff = Math.max(0, gEff - s.dedLong);
  let brackets = s.brackets, mult = 1;
  if (filing === "married") {
    if (s.bracketsM) brackets = s.bracketsM;
    else if (!s.noMult) mult = 2;
  } else if (filing === "hoh" && s.bracketsH) {
    brackets = s.bracketsH;
  }
  // Deductions that depend on AGI (SC SCIAD, MN phase-out) are evaluated at
  // each stacking point: without the gain, then with it, so the gain-driven
  // loss of deduction is part of the marginal tax on the gain.
  const stdAt = (agi) => {
    let d = 0;
    if (s.sciad) {
      const [base, start, span] = s.sciad[filing];
      const frac = Math.max(0, agi - start) / span;
      // statutory rounding: the reduction rounds down to the nearest $10
      d = frac >= 1 ? 0 : base - Math.floor(base * frac / 10) * 10;
    } else if (s.stdSlide) {
      // WI sliding-scale deduction (2025 DOR table; 2026 not yet published)
      const slide = (p2) => Math.max(0, p2[0] - p2[2] * Math.max(0, agi - p2[1]));
      d = slide(s.stdSlide[filing]);
      if (filing === "hoh") d = Math.max(d, slide(s.stdSlide.single));
    } else if (s.stdFed) {
      d = FED_STD[filing];
    } else if (s.std) {
      d = filing === "married" ? (s.stdM || s.std * 2)
        : filing === "hoh" ? (s.stdH || s.std) : s.std;
    }
    if (s.stdPhase && d) {
      const r = .03 * Math.min(Math.max(agi - s.stdPhase.t1, 0), s.stdPhase.t2 - s.stdPhase.t1)
              + .10 * Math.max(agi - s.stdPhase.t2, 0);
      d = Math.max(d * .2, d - r);
    }
    return d;
  };
  const lo = Math.max(0, ordinary - stdAt(ordinary));
  const hi = Math.max(0, ordinary + gEff - stdAt(ordinary + gain));
  if (s.flat) return (hi - lo) * s.flat;
  const marginal = bracketTax(hi, brackets, mult) - bracketTax(lo, brackets, mult);
  // Hawaii: elective alternative computation caps the long-term gain rate
  if (s.hiAlt && isLong) return Math.min(marginal, gain * s.hiAlt);
  return marginal;
}

function taxOnGain(taxableGain, ordinary, filing, stateCode, isLong, isHome, isRealEstate) {
  const fed = isLong ? fedLongTax(ordinary, taxableGain, filing) : fedShortTax(ordinary, taxableGain, filing);
  const niit = niitTax(ordinary, taxableGain, filing);
  const state = stateGainTax(stateCode, ordinary, taxableGain, filing, isLong, isHome, isRealEstate);
  return { fed, niit, state, total: fed + niit + state };
}

function calc() {
  const purchase = num(el.purchase), sale = num(el.sale);
  const ordinary = num(el.income);
  const filing = el.filing.value, stateCode = el.state.value;
  const isHome = el.homeSale.checked;
  const isLong = term === "long";
  const s = STATES[stateCode];
  const isRealEstate = !!(el.waEstate && el.waEstate.checked);
  if (el.waEstateRow) el.waEstateRow.hidden = stateCode !== "WA";

  el.homeHint.hidden = !isHome;

  const gain = sale - purchase;
  // §121 requires 2+ years of ownership and use, so a short-term sale can
  // never qualify: the exclusion is only applied to long-term sales
  const exclusion = (isHome && isLong) ? Math.min(Math.max(0, gain), HOME_EXCLUSION[filing]) : 0;
  const taxableGain = Math.max(0, gain - exclusion);

  // ---- loss case ----
  if (gain <= 0) {
    const loss = -gain;
    el.taxLabel.textContent = "Estimated tax on this sale";
    el.totalTax.textContent = money(0);
    el.savingsBox.hidden = loss <= 0;
    el.savingsBox.className = "savings savings--warn";
    el.savingsBox.innerHTML = loss > 0
      ? `This sale is a <b>capital loss of ${money(loss)}</b>, so no tax is due. Losses first offset other capital gains; up to $3,000 per year can offset ordinary income, and the rest carries forward.`
      : "";
    el.donut.style.background = "conic-gradient(rgba(148,163,184,.25) 0 100%)";
    el.legKept.textContent = money(0); el.legFed.textContent = money(0);
    el.legNiit.textContent = money(0); el.legState.textContent = money(0);
    el.legNiitRow.hidden = true; el.legStateRow.hidden = true;
    el.rGainLabel.textContent = loss > 0 ? "Capital loss" : "Capital gain";
    el.rGain.textContent = loss > 0 ? "−" + money(loss) : money(0);
    el.rExclRow.hidden = true; el.rTaxableRow.hidden = true;
    el.rProceeds.textContent = money(sale);
    el.rKept.textContent = money(0);
    el.rEffRate.textContent = "0%";
    el.taxNote.textContent = "Estimates only. Not tax, legal, or financial advice.";
    return;
  }

  const t = taxOnGain(taxableGain, ordinary, filing, stateCode, isLong, isHome, isRealEstate);
  const kept = gain - t.total;
  const effRate = gain > 0 ? t.total / gain : 0;

  // ---- short vs long comparison (the §121 exclusion only exists on the
  // long-term side, so the alternative's taxable gain is recomputed) ----
  const altExclusion = (isHome && !isLong) ? Math.min(Math.max(0, gain), HOME_EXCLUSION[filing]) : 0;
  const altTaxable = !isLong ? Math.max(0, gain - altExclusion) : gain;
  const alt = taxOnGain(altTaxable, ordinary, filing, stateCode, !isLong, isHome, isRealEstate);
  const saveByHolding = isLong ? alt.total - t.total : t.total - alt.total;

  // ---- render ----
  el.taxLabel.textContent = "Estimated tax on this sale";
  el.totalTax.textContent = money(t.total);

  if (saveByHolding > 0.5) {
    el.savingsBox.hidden = false;
    if (isLong) {
      el.savingsBox.className = "savings savings--good";
      el.savingsBox.innerHTML = `Long-term status is saving you <b>${money(saveByHolding)}</b> vs. selling within a year.`;
    } else {
      el.savingsBox.className = "savings savings--warn";
      el.savingsBox.innerHTML = `Hold it for more than 1 year and this tax drops to <b>${money(alt.total)}</b>, a saving of <b>${money(saveByHolding)}</b>.`;
    }
  } else {
    el.savingsBox.hidden = true;
  }

  el.legKept.textContent = money(kept);
  el.legFed.textContent = money(t.fed);
  el.legNiit.textContent = money(t.niit);
  el.legState.textContent = money(t.state);
  el.legNiitRow.hidden = t.niit <= 0;
  el.legStateRow.hidden = t.state <= 0 && !!s?.none;

  const segs = [
    { color: COLORS.kept, v: Math.max(0, kept) },
    { color: COLORS.fed, v: t.fed },
    { color: COLORS.niit, v: t.niit },
    { color: COLORS.state, v: t.state },
  ];
  const total = segs.reduce((a, x) => a + x.v, 0);
  let acc = 0; const stops = [];
  for (const x of segs) {
    const pct = total > 0 ? (x.v / total) * 100 : 0;
    if (pct <= 0.01) continue;
    stops.push(`${x.color} ${acc.toFixed(2)}% ${(acc + pct).toFixed(2)}%`);
    acc += pct;
  }
  el.donut.style.background = acc > 0 ? `conic-gradient(${stops.join(", ")})` : "conic-gradient(rgba(148,163,184,.25) 0 100%)";

  el.rGainLabel.textContent = "Capital gain (" + (isLong ? "long-term" : "short-term") + ")";
  el.rGain.textContent = money(gain);
  el.rExclRow.hidden = exclusion <= 0;
  el.rExcl.textContent = "−" + money(exclusion);
  el.rTaxableRow.hidden = exclusion <= 0;
  el.rTaxable.textContent = money(taxableGain);
  el.rProceeds.textContent = money(sale - t.total);
  el.rKept.textContent = money(kept);
  el.rEffRate.textContent = (effRate * 100).toFixed(1) + "%";

  let note = "Estimates use 2026 federal rates (Rev. Proc. 2025-32) and stack state tax on your other income. ";
  if (s?.waCapGains) note += (isHome || isRealEstate)
    ? "Washington's capital gains tax exempts all real estate, so no state tax applies to this sale. "
    : "Washington has no ordinary income tax but taxes long-term gains above ~$278,000 at 7% (9.9% over $1M); all real estate is exempt. ";
  else if (s?.none) note += s.name + " has no state income tax. ";
  if (s?.exclLong && isLong) note += s.name + " excludes " + (s.exclLong * 100) + "% of long-term gains, which is included in this estimate. ";
  if (s?.hiAlt && isLong) note += "Hawaii's elective 7.25% alternative rate on long-term gains is included where it is lower. ";
  if (s?.mtLtcg && isLong) note += "Montana's separate 3.0%/4.1% long-term rates are included. ";
  if (s?.sciad) note += "South Carolina's Income Adjusted Deduction and its income phase-out are included, using your entries as a stand-in for federal AGI. ";
  if (stateCode === "NM" && isLong) note += "New Mexico's deduction of up to $2,500 of net capital gains is included; the larger 40% alternative for New Mexico business sales is not modeled. ";
  if (s?.local) note += s.name + " also has local income taxes not included. ";
  if (s?.stdSlide) note += s.name + "'s sliding-scale standard deduction (it shrinks as income rises) is included, using the latest published table. ";
  if (s?.stdPhase) note += s.name + "'s standard-deduction phase-out at higher incomes is included. ";
  if (isHome && !isLong) note += "The home-sale exclusion requires 2+ years of ownership and use, so it cannot apply to a short-term sale and is NOT applied here. ";
  if (isHome && isLong) note += "The home-sale exclusion assumes you owned and used the home 2 of the last 5 years and have not used the exclusion in the last 2 years. ";
  note += "NIIT is estimated from taxable income plus the standard deduction as a stand-in for MAGI. Collectibles, depreciation recapture (25%/28% federal classes), and married-filing-separately are not modeled. Assumes no other capital gains or losses. Estimates only. Not tax, legal, or financial advice.";
  el.taxNote.textContent = note;
}

// ---- init state dropdown ----
Object.keys(STATES).sort((a, b) => STATES[a].name.localeCompare(STATES[b].name)).forEach((code) => {
  const o = document.createElement("option");
  o.value = code; o.textContent = STATES[code].name;
  el.state.appendChild(o);
});
const _qsState = (new URLSearchParams(location.search).get("state") || "").toUpperCase();
el.state.value = (typeof window.PRESET_STATE === "string" && Object.hasOwn(STATES, window.PRESET_STATE)) ? window.PRESET_STATE
  : Object.hasOwn(STATES, _qsState) ? _qsState : "TX";
if (window.PRESET_HOME) el.homeSale.checked = true;

// ---- events ----
el.termShort.addEventListener("click", () => {
  term = "short";
  el.termShort.classList.add("active"); el.termLong.classList.remove("active");
  calc();
});
el.termLong.addEventListener("click", () => {
  term = "long";
  el.termLong.classList.add("active"); el.termShort.classList.remove("active");
  calc();
});
[el.purchase, el.sale, el.income].forEach((n) => {
  n.addEventListener("input", calc);
  n.addEventListener("focus", () => n.select());
});
[el.filing, el.state].forEach((n) => n.addEventListener("change", calc));
el.homeSale.addEventListener("change", calc);
if (el.waEstate) el.waEstate.addEventListener("change", calc);

calc();
