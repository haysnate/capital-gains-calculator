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

// ---- Net investment income tax ----
const NIIT_RATE = 0.038;
const NIIT_THRESHOLD = { single: 200000, married: 250000, hoh: 200000 };

// ---- Primary-home exclusion (§121) ----
const HOME_EXCLUSION = { single: 250000, married: 500000, hoh: 250000 };

// ---- State income tax (2026 estimates; gains taxed as ordinary income) ----
// flat: single rate. brackets: [upperBound, rate] pairs (single filer);
// married thresholds are doubled (common approximation). std: state standard deduction where included.
// pref: state gives long-term gains a break (exclusion / lower rate) not modeled here.
const STATES = {
  AL: { name: "Alabama", brackets: [[500,.02],[3000,.04],[Infinity,.05]] },
  AK: { name: "Alaska", none: true },
  AZ: { name: "Arizona", flat: .025 },
  AR: { name: "Arkansas", pref: true, brackets: [[4500,.02],[Infinity,.039]] },
  CA: { name: "California", std: 5540, brackets: [[10756,.01],[25499,.02],[40245,.04],[55866,.06],[70606,.08],[360659,.093],[432787,.103],[721314,.113],[Infinity,.123]] },
  CO: { name: "Colorado", flat: .044 },
  CT: { name: "Connecticut", brackets: [[10000,.02],[50000,.045],[100000,.055],[200000,.06],[250000,.065],[500000,.069],[Infinity,.0699]] },
  DE: { name: "Delaware", brackets: [[2000,0],[5000,.022],[10000,.039],[20000,.048],[25000,.052],[60000,.0555],[Infinity,.066]] },
  DC: { name: "District of Columbia", brackets: [[10000,.04],[40000,.06],[60000,.065],[250000,.085],[500000,.0925],[1000000,.0975],[Infinity,.1075]] },
  FL: { name: "Florida", none: true },
  GA: { name: "Georgia", flat: .0519 },
  HI: { name: "Hawaii", pref: true, brackets: [[9600,.014],[14400,.032],[19200,.055],[24000,.064],[36000,.068],[48000,.072],[125000,.076],[175000,.079],[225000,.0825],[275000,.09],[325000,.10],[Infinity,.11]] },
  ID: { name: "Idaho", flat: .053 },
  IL: { name: "Illinois", flat: .0495 },
  IN: { name: "Indiana", flat: .03 },
  IA: { name: "Iowa", flat: .038 },
  KS: { name: "Kansas", brackets: [[23000,.052],[Infinity,.0558]] },
  KY: { name: "Kentucky", flat: .035 },
  LA: { name: "Louisiana", flat: .03 },
  ME: { name: "Maine", brackets: [[26800,.058],[63450,.0675],[Infinity,.0715]] },
  MD: { name: "Maryland", local: true, brackets: [[1000,.02],[2000,.03],[3000,.04],[100000,.0475],[125000,.05],[150000,.0525],[250000,.055],[Infinity,.0575]] },
  MA: { name: "Massachusetts", stShort: .085, flat: .05 },
  MI: { name: "Michigan", flat: .0425 },
  MN: { name: "Minnesota", brackets: [[32570,.0535],[106990,.068],[198630,.0785],[Infinity,.0985]] },
  MS: { name: "Mississippi", flat: .044 },
  MO: { name: "Missouri", brackets: [[1313,0],[2626,.02],[3939,.025],[5252,.03],[6565,.035],[7878,.04],[9191,.045],[Infinity,.047]] },
  MT: { name: "Montana", pref: true, brackets: [[21100,.047],[Infinity,.059]] },
  NE: { name: "Nebraska", brackets: [[4030,.0246],[24120,.0351],[38870,.0501],[Infinity,.052]] },
  NV: { name: "Nevada", none: true },
  NH: { name: "New Hampshire", none: true },
  NJ: { name: "New Jersey", brackets: [[20000,.014],[35000,.0175],[40000,.035],[75000,.05525],[500000,.0637],[1000000,.0897],[Infinity,.1075]] },
  NM: { name: "New Mexico", pref: true, brackets: [[5500,.015],[16500,.032],[33500,.043],[66500,.047],[210000,.049],[Infinity,.059]] },
  NY: { name: "New York", std: 8000, brackets: [[8500,.04],[11700,.045],[13900,.0525],[80650,.055],[215400,.06],[1077550,.0685],[5000000,.0965],[Infinity,.109]] },
  NC: { name: "North Carolina", flat: .0399 },
  ND: { name: "North Dakota", pref: true, brackets: [[48475,0],[244825,.0195],[Infinity,.025]] },
  OH: { name: "Ohio", brackets: [[26050,0],[Infinity,.0275]] },
  OK: { name: "Oklahoma", brackets: [[1000,.0025],[2500,.0075],[3750,.0175],[4900,.0275],[7200,.0375],[Infinity,.0475]] },
  OR: { name: "Oregon", std: 2800, brackets: [[4400,.0475],[11050,.0675],[125000,.0875],[Infinity,.099]] },
  PA: { name: "Pennsylvania", local: true, flat: .0307 },
  RI: { name: "Rhode Island", brackets: [[79900,.0375],[181650,.0475],[Infinity,.0599]] },
  SC: { name: "South Carolina", pref: true, brackets: [[3560,0],[17830,.03],[Infinity,.062]] },
  SD: { name: "South Dakota", none: true },
  TN: { name: "Tennessee", none: true },
  TX: { name: "Texas", none: true },
  UT: { name: "Utah", flat: .045 },
  VT: { name: "Vermont", brackets: [[47900,.0335],[116000,.066],[242000,.076],[Infinity,.0875]] },
  VA: { name: "Virginia", brackets: [[3000,.02],[5000,.03],[17000,.05],[Infinity,.0575]] },
  WA: { name: "Washington", none: true, waCapGains: true },
  WV: { name: "West Virginia", brackets: [[10000,.0222],[25000,.0296],[40000,.0333],[60000,.0444],[Infinity,.0482]] },
  WI: { name: "Wisconsin", pref: true, brackets: [[14320,.035],[28640,.044],[315310,.053],[Infinity,.0765]] },
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
  const v = String(node.value).replace(/[^0-9.]/g, "");
  const n = parseFloat(v);
  return isFinite(n) && n >= 0 ? n : 0;
}
function money(n, dp = 0) {
  if (!isFinite(n)) n = 0;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: dp, maximumFractionDigits: dp }).format(n);
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
  const magi = ordinary + gain; // approximation: MAGI ≈ taxable income + gain
  return NIIT_RATE * Math.max(0, Math.min(gain, magi - NIIT_THRESHOLD[filing]));
}

// State tax on the gain: marginal stacking on state ordinary-income rates.
function stateGainTax(code, ordinary, gain, filing, isLong, isHome) {
  const s = STATES[code];
  if (!s) return 0;
  if (s.waCapGains) {
    if (!isLong || isHome) return 0; // WA taxes only long-term gains; real estate exempt
    const base = Math.max(0, gain - WA_DEDUCTION);
    return base * WA_RATE + Math.max(0, base - WA_SURTAX_ABOVE) * WA_SURTAX;
  }
  if (s.none) return 0;
  if (s.stShort && !isLong) return gain * s.stShort; // MA 8.5% short-term rate
  const mult = filing === "married" ? 2 : 1;
  const lo = Math.max(0, ordinary - (s.std || 0) * mult);
  const hi = Math.max(0, ordinary + gain - (s.std || 0) * mult);
  if (s.flat) return (hi - lo) * s.flat;
  return bracketTax(hi, s.brackets, mult) - bracketTax(lo, s.brackets, mult);
}

function taxOnGain(taxableGain, ordinary, filing, stateCode, isLong, isHome) {
  const fed = isLong ? fedLongTax(ordinary, taxableGain, filing) : fedShortTax(ordinary, taxableGain, filing);
  const niit = niitTax(ordinary, taxableGain, filing);
  const state = stateGainTax(stateCode, ordinary, taxableGain, filing, isLong, isHome);
  return { fed, niit, state, total: fed + niit + state };
}

function calc() {
  const purchase = num(el.purchase), sale = num(el.sale);
  const ordinary = num(el.income);
  const filing = el.filing.value, stateCode = el.state.value;
  const isHome = el.homeSale.checked;
  const isLong = term === "long";
  const s = STATES[stateCode];

  el.homeHint.hidden = !isHome;

  const gain = sale - purchase;
  const exclusion = isHome ? Math.min(Math.max(0, gain), HOME_EXCLUSION[filing]) : 0;
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

  const t = taxOnGain(taxableGain, ordinary, filing, stateCode, isLong, isHome);
  const kept = gain - t.total;
  const effRate = gain > 0 ? t.total / gain : 0;

  // ---- short vs long comparison ----
  const alt = taxOnGain(taxableGain, ordinary, filing, stateCode, !isLong, isHome);
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

  let note = "Estimates use 2026 federal rates (Rev. Proc. 2025-32) and treat state tax at ordinary income rates stacked on your other income. ";
  if (s?.waCapGains) note += isHome
    ? "Washington's capital gains tax exempts real estate. "
    : "Washington has no ordinary income tax but taxes long-term gains above ~$278,000 at 7% (9.9% over $1M); real estate is exempt. ";
  else if (s?.none) note += s.name + " has no state income tax. ";
  if (s?.pref && isLong) note += s.name + " taxes long-term gains at reduced rates or with exclusions not modeled here, so your actual state tax may be lower. ";
  if (s?.local) note += s.name + " also has local income taxes not included. ";
  if (isHome && !isLong) note += "Note: the home-sale exclusion requires 2+ years of ownership and use, so qualifying sales are long-term. ";
  if (t.niit > 0) note += "NIIT uses taxable income as a stand-in for MAGI. ";
  note += "Assumes no other capital gains or losses. Estimates only. Not tax, legal, or financial advice.";
  el.taxNote.textContent = note;
}

// ---- init state dropdown ----
Object.keys(STATES).sort((a, b) => STATES[a].name.localeCompare(STATES[b].name)).forEach((code) => {
  const o = document.createElement("option");
  o.value = code; o.textContent = STATES[code].name;
  el.state.appendChild(o);
});
el.state.value = "TX";

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

calc();
