"""Generate the 51 state capital-gains pages, the by-state hub, the
home-sale calculator variant, and sitemap.xml for capitalgainscalculatorhq.com.

Engine-exact: all constants are parsed straight out of public/script.js and
every worked figure is computed with a line-for-line Python port of the JS
engine, never typed. FAQPage schema is built from the same data as the
visible FAQ, so they cannot drift. Rerun after any engine or template change:
  python gen_state_pages.py
"""
import datetime
import json
import re
from pathlib import Path

PUB = Path(__file__).parent / "public"
D = "https://capitalgainscalculatorhq.com"
TODAY = datetime.date.today().isoformat()
_d = datetime.date.today()
UPDATED_HUMAN = f"{_d.strftime('%B')} {_d.day}, {_d.year}"

RP = "https://www.irs.gov/pub/irs-drop/rp-25-32.pdf"
TF = "https://taxfoundation.org/data/all/state/state-income-tax-rates-2026/"

js = (PUB / "script.js").read_text(encoding="utf-8")

def eval_js_object(src):
    s = re.sub(r"//[^\n]*", "", src)
    s = re.sub(r"(\w+):", r'"\1":', s)
    s = s.replace("true", "True").replace("false", "False")
    s = re.sub(r"([\[,:\s])\.(\d)", r"\g<1>0.\2", s)
    s = s.replace("Infinity", 'float("inf")')
    return eval(s)

STATES = eval_js_object(js.split("const STATES = ")[1].split("\n};")[0] + "\n}")
LTCG = eval_js_object(js.split("const LTCG = ")[1].split("};")[0] + "}")
FED = eval_js_object(js.split("const FED = ")[1].split("\n};")[0] + "\n}")
FED_STD = eval_js_object(js.split("const FED_STD = ")[1].split(";")[0])
NIIT_RATE = float(re.search(r"NIIT_RATE = ([\d.]+)", js).group(1))
NIIT_THRESHOLD = eval_js_object(js.split("const NIIT_THRESHOLD = ")[1].split(";")[0])
WA_DEDUCTION = int(re.search(r"WA_DEDUCTION = (\d+)", js).group(1))
WA_RATE = float(re.search(r"WA_RATE = ([\d.]+)", js).group(1))
WA_SURTAX = float(re.search(r"WA_SURTAX = ([\d.]+)", js).group(1))
WA_SURTAX_ABOVE = int(re.search(r"WA_SURTAX_ABOVE = (\d+)", js).group(1))

INF = float("inf")

# ---- engine port (mirrors script.js exactly) ----
def bracket_tax(taxable, brackets, mult):
    tax, prev = 0.0, 0.0
    for bound, rate in brackets:
        upper = bound if bound == INF else bound * mult
        if taxable <= prev:
            break
        tax += (min(taxable, upper) - prev) * rate
        prev = upper
    return tax

def fed_long_tax(ordinary, gain, filing):
    zero, fifteen = LTCG[filing]["zero"], LTCG[filing]["fifteen"]
    lo, hi = ordinary, ordinary + gain
    at15 = max(0, min(hi, fifteen) - max(lo, zero))
    at20 = max(0, hi - max(lo, fifteen))
    return at15 * .15 + at20 * .20

def fed_short_tax(ordinary, gain, filing):
    b = FED[filing]
    return bracket_tax(ordinary + gain, b, 1) - bracket_tax(ordinary, b, 1)

def niit_tax(ordinary, gain, filing):
    magi = ordinary + gain
    return NIIT_RATE * max(0, min(gain, magi - NIIT_THRESHOLD[filing]))

def state_gain_tax(code, ordinary, gain, filing, is_long, is_home):
    s = STATES[code]
    if s.get("waCapGains"):
        if not is_long or is_home:
            return 0.0
        base = max(0, gain - WA_DEDUCTION)
        return base * WA_RATE + max(0, base - WA_SURTAX_ABOVE) * WA_SURTAX
    if s.get("none"):
        return 0.0
    if s.get("stShort") and not is_long:
        return gain * s["stShort"]
    mult = 2 if (not s.get("noMult") and filing == "married") else 1
    std = 0
    if s.get("stdFed"):
        std = FED_STD[filing]
    elif s.get("std"):
        std = s.get("stdM", s["std"] * 2) if filing == "married" else s["std"]
    lo = max(0, ordinary - std)
    hi = max(0, ordinary + gain - std)
    if s.get("flat"):
        return (hi - lo) * s["flat"]
    return bracket_tax(hi, s["brackets"], mult) - bracket_tax(lo, s["brackets"], mult)

def money(n):
    return "${:,.0f}".format(round(n))

def pct(r):
    s = f"{r*100:.4f}".rstrip("0").rstrip(".")
    return s + "%"

# ---- standard worked scenario (engine-exact) ----
EX_INC, EX_GAIN = 60000, 25000
EX_FED = fed_long_tax(EX_INC, EX_GAIN, "single")   # all at 15% at this income
assert abs(EX_FED - 3750) < 0.01, EX_FED
assert niit_tax(EX_INC, EX_GAIN, "single") == 0

def slugify(name):
    return name.lower().replace(" ", "-")

ORDER = sorted(STATES, key=lambda c: STATES[c]["name"])

FOOTER = '''<footer class="site-footer">
    <span class="copy">© <span id="year">2026</span> Capital Gains Calculator</span>
    <a href="/">Home</a>
    <a href="guide">Guide</a>
    <a href="state-capital-gains-tax">By State</a>
    <a href="home-sale-exclusion">Home Sale Exclusion</a>
    <a href="faq">FAQ</a>
    <a href="about">About</a>
    <a href="privacy">Privacy</a>
  </footer>'''

BRAND = '''<a class="doc__brand" href="/" aria-label="Capital Gains Tax Calculator home">
      <span class="logo" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
      </span>
      <span>Capital Gains Calculator</span>
    </a>'''

BYLINE = f'<p class="byline">By <a href="about">Nathan Hays</a> &middot; Updated {UPDATED_HUMAN}</p>'
DISCLAIMER = '<p class="fineprint" style="color:var(--text-muted);font-size:0.85rem;">This page is general information, not tax, legal, or financial advice. Rates and rules can change and depend on your situation. Confirm details with a tax professional, the IRS, or your state\'s revenue department.</p>'

def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

def head(title, desc, path, ld):
    return f'''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>{esc(title)}</title>
  <meta name="description" content="{esc(desc)}" />
  <link rel="canonical" href="{D}/{path}" />
  <meta name="robots" content="index, follow, max-image-preview:large" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="Capital Gains Calculator HQ" />
  <meta property="og:title" content="{esc(title)}" />
  <meta property="og:url" content="{D}/{path}" />
  <meta property="og:image" content="{D}/og-image.jpg" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="Capital Gains Calculator: 2026 federal and state tax on your sale" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content="{D}/og-image.jpg" />
  <link rel="preload" href="/fonts/inter-var-latin.woff2" as="font" type="font/woff2" crossorigin />
  <link rel="stylesheet" href="styles.css" />
  <!-- Google AdSense -->
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-5812381332044887" crossorigin="anonymous"></script>
  <meta name="google-adsense-account" content="ca-pub-5812381332044887" />
  <script type="application/ld+json">
{json.dumps(ld, indent=2, ensure_ascii=False)}
  </script>
</head>
<body>
'''

def article_ld(title, path, published):
    return {
        "@type": "Article", "headline": title,
        "author": {"@type": "Person", "name": "Nathan Hays", "url": f"{D}/about"},
        "publisher": {"@type": "Organization", "name": "Capital Gains Calculator HQ"},
        "mainEntityOfPage": f"{D}/{path}",
        "datePublished": published, "dateModified": TODAY,
    }

def crumbs(items):
    return {"@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": i + 1, "name": n, "item": u}
        for i, (n, u) in enumerate(items)]}

def faq_ld(pairs):
    return {"@type": "FAQPage", "mainEntity": [
        {"@type": "Question", "name": q,
         "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in pairs]}

def faq_html(pairs):
    inner = "\n".join(f"      <h3>{esc(q)}</h3>\n      <p>{esc(a)}</p>" for q, a in pairs)
    return f'    <h2>Frequently asked questions</h2>\n    <div class="faq">\n{inner}\n    </div>'

# ---- per-state derived facts ----
def top_rate(code):
    s = STATES[code]
    if s.get("waCapGains"): return WA_RATE + WA_SURTAX
    if s.get("none"): return 0.0
    if s.get("flat"): return s["flat"]
    return s["brackets"][-1][1]

def treatment_sentence(code):
    """One accurate sentence on how the state treats capital gains."""
    s, name = STATES[code], STATES[code]["name"]
    if s.get("waCapGains"):
        return (f"{name} has no personal income tax, but it levies a {pct(WA_RATE)} excise tax on long-term capital gains above "
                f"{money(WA_DEDUCTION)} a year (an extra {pct(WA_SURTAX)} applies above {money(WA_SURTAX_ABOVE)}). "
                "Real estate is exempt, and short-term gains are not taxed by the state.")
    if s.get("none"):
        return f"{name} has no personal income tax, so it does not tax capital gains at the state level. You still owe federal capital gains tax."
    if s.get("stShort"):
        return (f"{name} taxes most long-term capital gains at {pct(s['brackets'][0][1])} "
                f"(rising to {pct(s['brackets'][-1][1])} on taxable income above {money(s['brackets'][0][0])}), "
                f"and taxes short-term capital gains at a higher {pct(s['stShort'])} rate.")
    if s.get("flat"):
        return f"{name} taxes capital gains as ordinary income at a flat {pct(s['flat'])} rate."
    return (f"{name} taxes capital gains as ordinary income on a graduated scale from {pct(s['brackets'][0][1])} "
            f"up to a top rate of {pct(s['brackets'][-1][1])}.")

def std_sentence(code, name):
    s = STATES[code]
    if s.get("stdFed"):
        return f" {name} uses the federal standard deduction ({money(FED_STD['single'])} single / {money(FED_STD['married'])} married in 2026), which the estimate subtracts first."
    if s.get("std"):
        m = s.get("stdM", s["std"] * 2)
        return f" The estimate subtracts {name}'s standard deduction ({money(s['std'])} single / {money(m)} married)."
    return ""

def bracket_table(code):
    s = STATES[code]
    if not s.get("brackets") or s.get("waCapGains"):
        return ""
    rows, prev = [], 0
    for bound, rate in s["brackets"]:
        if bound == INF:
            rows.append(f"          <tr><td>Over {money(prev)}</td><td>{pct(rate)}</td></tr>")
        else:
            rows.append(f"          <tr><td>{money(prev)} &ndash; {money(bound)}</td><td>{pct(rate)}</td></tr>")
            prev = bound
    note = ("Single-filer taxable income. Married thresholds are doubled." if not s.get("noMult")
            else "Thresholds apply to all filing statuses.")
    return f'''    <h2>2026 {s["name"]} income tax brackets</h2>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Taxable income</th><th>Rate</th></tr></thead>
        <tbody>
{chr(10).join(rows)}
        </tbody>
      </table>
    </div>
    <p class="fineprint" style="color:var(--text-muted);font-size:0.85rem;">{note}</p>
'''

def state_page(code):
    s, name = STATES[code], STATES[code]["name"]
    slug = slugify(name) + "-capital-gains-tax"
    path = slugify(name) + "-capital-gains-tax"
    ex_state = state_gain_tax(code, EX_INC, EX_GAIN, "single", True, False)
    ex_total = EX_FED + ex_state
    eff = ex_total / EX_GAIN

    title = f"{name} Capital Gains Tax 2026: Rates and Calculator"
    desc_frag = {
        True: "no state income tax",
    }
    if s.get("waCapGains"):
        desc = f"2026 {name} capital gains tax: the 7% excise on long-term gains above {money(WA_DEDUCTION)}, what's exempt, plus federal 0/15/20% rates and a worked example."
    elif s.get("none"):
        desc = f"2026 {name} capital gains tax: no state income tax on gains. What you still owe federally (0/15/20% plus NIIT), with a worked example and free calculator."
    elif s.get("stShort"):
        desc = f"2026 {name} capital gains tax: {pct(s['brackets'][0][1])} on most long-term gains, {pct(s['stShort'])} on short-term, plus federal rates, with a worked example."
    elif s.get("flat"):
        desc = f"2026 {name} capital gains tax: flat {pct(s['flat'])} on gains as ordinary income, plus federal 0/15/20% rates and NIIT, with a worked example and free calculator."
    else:
        desc = f"2026 {name} capital gains tax: graduated {pct(s['brackets'][0][1])} to {pct(s['brackets'][-1][1])} on gains as ordinary income, plus federal rates, with a worked example."

    # example paragraph
    ex_bits = [
        f"Say you are a single filer in {name} with {money(EX_INC)} of taxable income who sells stock held over a year for a {money(EX_GAIN)} long-term gain.",
        f"Federal tax on the gain is {money(EX_FED)} (all of it lands in the 15% bracket at this income; no NIIT applies below {money(NIIT_THRESHOLD['single'])} MAGI).",
    ]
    if s.get("waCapGains"):
        ex_bits.append(f"{name} adds nothing here: the excise tax only starts above {money(WA_DEDUCTION)} of annual long-term gains.")
        big = state_gain_tax(code, EX_INC, 500000, "single", True, False)
        ex_bits.append(f"Scale the sale up to a {money(500000)} long-term gain, though, and {name}'s excise adds {money(big)} ({pct(WA_RATE)} of the amount above the deduction).")
    elif s.get("none"):
        ex_bits.append(f"{name} adds nothing, so the total stays {money(ex_total)}, an effective {eff*100:.1f}% on the gain.")
    else:
        ex_bits.append(f"{name} adds an estimated {money(ex_state)}, for a combined {money(ex_total)}, an effective {eff*100:.1f}% on the gain.")
    example = " ".join(ex_bits)

    # extra branch content
    extra = []
    if s.get("stShort"):
        st_state = state_gain_tax(code, EX_INC, EX_GAIN, "single", False, False)
        extra.append(f"<p>Sell within a year instead and {name} taxes the same {money(EX_GAIN)} gain at {pct(s['stShort'])} ({money(st_state)} of state tax), on top of federal ordinary rates. The one-year line matters twice here.</p>")
    if s.get("pref"):
        extra.append(f"<p><strong>Good news if you hold long.</strong> {name} gives long-term gains a partial exclusion or reduced rate that this site's flat estimate does not model, so your actual {name} tax on a long-term gain may be lower than the ordinary-income estimate shown by the calculator.</p>")
    if s.get("local"):
        extra.append(f"<p>Parts of {name} also levy local income taxes that are not included in these estimates.</p>")

    # FAQ pairs (plain text; schema derives from the same list)
    if s.get("waCapGains"):
        q1a = (f"Not in the usual way. {name} has no personal income tax, but it charges a {pct(WA_RATE)} excise tax on long-term capital gains above "
               f"{money(WA_DEDUCTION)} per year, with an extra {pct(WA_SURTAX)} above {money(WA_SURTAX_ABOVE)}. Real estate sales are exempt, and short-term gains are not taxed by the state.")
    elif s.get("none"):
        q1a = f"No. {name} has no personal income tax, so capital gains are not taxed at the state level. Federal capital gains tax still applies."
    else:
        q1a = f"Yes. {name} taxes capital gains as ordinary income. {treatment_sentence(code)}"
    if s.get("none") or s.get("waCapGains"):
        q2a = (f"Federally, a long-term gain is taxed at 0%, 15%, or 20% depending on your taxable income, plus the 3.8% NIIT above "
               f"{money(NIIT_THRESHOLD['single'])} MAGI (single). " +
               (f"{name} adds state tax only when annual long-term gains top {money(WA_DEDUCTION)}." if s.get("waCapGains")
                else f"In {name} that federal bill is the whole bill."))
    else:
        q2a = (f"Combined, our worked example ({money(EX_GAIN)} long-term gain on {money(EX_INC)} of income, single) comes to "
               f"{money(ex_total)}: {money(EX_FED)} federal plus {money(ex_state)} {name} tax, an effective {eff*100:.1f}%.")
    q3a = ("Yes. Federal capital gains tax (0%, 15%, or 20% long-term, ordinary rates short-term, plus the 3.8% NIIT for high earners) applies no matter your state. "
           f"The free calculator estimates federal, NIIT, and {name} tax together.")
    pairs = [
        (f"Does {name} tax capital gains?", q1a),
        (f"What will I pay on a long-term gain in {name}?", q2a),
        (f"Do I still owe federal capital gains tax in {name}?", q3a),
    ]

    ld = {"@context": "https://schema.org", "@graph": [
        article_ld(title, path, TODAY),
        crumbs([("Capital Gains Calculator", f"{D}/"),
                ("State Capital Gains Tax", f"{D}/state-capital-gains-tax"),
                (name, f"{D}/{path}")]),
        faq_ld(pairs),
    ]}

    i = ORDER.index(code)
    sib_prev = ORDER[i - 1] if i > 0 else None
    sib_next = ORDER[i + 1] if i < len(ORDER) - 1 else None
    sibs = []
    if sib_prev:
        sibs.append(f'<a href="{slugify(STATES[sib_prev]["name"])}-capital-gains-tax">{STATES[sib_prev]["name"]}</a>')
    if sib_next:
        sibs.append(f'<a href="{slugify(STATES[sib_next]["name"])}-capital-gains-tax">{STATES[sib_next]["name"]}</a>')
    sib_line = " &middot; ".join(sibs)

    body = f'''  <article class="doc">
    {BRAND}

    <h1>{name} Capital Gains Tax (2026)</h1>
    {BYLINE}
    <p class="lead">{treatment_sentence(code)} Run your own numbers with the free <a href="/?state={code}">capital gains tax calculator</a>, which estimates federal, NIIT, and {name} tax together.</p>

    <div class="callout">
      <p><strong>In short:</strong> federal long-term rates of 0%, 15%, or 20% apply everywhere. {("At the state level, " + name + " adds nothing for most sales." ) if (s.get("none") or s.get("waCapGains")) else (name + " adds state tax on top, at up to " + pct(top_rate(code)) + ".")}</p>
    </div>

    <h2>How {name} treats capital gains</h2>
    <p>{treatment_sentence(code)}{std_sentence(code, name)}</p>
{"".join("    " + e + chr(10) for e in extra)}
{bracket_table(code)}
    <h2>A worked example</h2>
    <p>{example} These figures use the same math as the <a href="/?state={code}">calculator</a>, 2026 federal brackets per <a href="{RP}" rel="noopener">IRS Rev. Proc. 2025-32</a>, and state figures from the Tax Foundation's <a href="{TF}" rel="noopener">State Individual Income Tax Rates and Brackets, 2026</a>.</p>

{faq_html(pairs)}

    <h2>More</h2>
    <ul>
      <li><a href="state-capital-gains-tax">Every state's capital gains treatment</a></li>
      <li><a href="guide">Capital gains tax explained: short-term vs long-term</a></li>
      <li>Neighbors alphabetically: {sib_line}</li>
    </ul>

    {DISCLAIMER}
    <a class="back" href="/">← Back to the calculator</a>
  </article>

  {FOOTER}
  <script>{{const y=document.getElementById("year");if(y)y.textContent=new Date().getFullYear();}}</script>
</body>
</html>
'''
    return path, head(title, desc, path, ld) + body

# ---- hub page ----
def hub_page():
    path = "state-capital-gains-tax"
    title = "State Capital Gains Tax Rates by State (2026)"
    desc = "How all 50 states and DC tax capital gains in 2026: which states charge nothing, flat and graduated rates, Washington's excise, and Massachusetts' short-term rate."
    rows = []
    for code in ORDER:
        s, name = STATES[code], STATES[code]["name"]
        slug = slugify(name) + "-capital-gains-tax"
        if s.get("waCapGains"):
            treat = f"7% excise on LT gains over {money(WA_DEDUCTION)}"
        elif s.get("none"):
            treat = "No state tax on gains"
        elif s.get("stShort"):
            treat = f"{pct(s['brackets'][0][1])} LT (most) / {pct(s['stShort'])} short-term"
        elif s.get("flat"):
            treat = f"Flat {pct(s['flat'])} as ordinary income"
        else:
            treat = f"Graduated to {pct(s['brackets'][-1][1])}"
        ex = state_gain_tax(code, EX_INC, EX_GAIN, "single", True, False)
        rows.append(f'          <tr><td><a href="{slug}">{name}</a></td><td>{treat}</td><td>{money(ex)}</td></tr>')
    pairs = [
        ("Which states have no capital gains tax?",
         "Eight states have no personal income tax and no ordinary tax on capital gains: Alaska, Florida, Nevada, New Hampshire, South Dakota, Tennessee, Texas, and Wyoming. Washington also has no income tax but levies a 7% excise tax on long-term gains above " + money(WA_DEDUCTION) + " a year, with real estate exempt."),
        ("Which state has the highest capital gains tax?",
         "California, where gains are ordinary income taxed at up to 13.3%. Combined with the top federal rate (20% plus the 3.8% NIIT), a high earner in California can face over 37% on a long-term gain."),
        ("Do states give long-term gains a lower rate?",
         "Mostly no: most states tax short-term and long-term gains identically as ordinary income. Exceptions include Massachusetts (higher 8.5% short-term rate), Washington (excise on long-term only), and several states such as Arkansas, Hawaii, Montana, New Mexico, North Dakota, South Carolina, and Wisconsin that give long-term gains a partial exclusion or reduced rate."),
    ]
    ld = {"@context": "https://schema.org", "@graph": [
        article_ld(title, path, TODAY),
        crumbs([("Capital Gains Calculator", f"{D}/"), ("State Capital Gains Tax", f"{D}/{path}")]),
        faq_ld(pairs),
    ]}
    body = f'''  <article class="doc">
    {BRAND}

    <h1>State Capital Gains Tax Rates by State (2026)</h1>
    {BYLINE}
    <p class="lead">Federal capital gains rates are the same everywhere: 0%, 15%, or 20% on long-term gains, ordinary rates on short-term, plus the 3.8% NIIT for high earners. What changes with your address is the state layer. Most states tax gains as ordinary income, eight states tax nothing, and two (Washington and Massachusetts) have special rules. Pick your state below, or run your numbers in the free <a href="/">capital gains tax calculator</a>.</p>

    <h2>Every state at a glance</h2>
    <p>The example column shows the estimated state tax on our standard scenario: a single filer with {money(EX_INC)} of taxable income and a {money(EX_GAIN)} long-term gain (federal tax on that gain is {money(EX_FED)} everywhere). Figures are computed with the same engine as the calculator, from the Tax Foundation's <a href="{TF}" rel="noopener">2026 state tables</a>.</p>
    <div class="table-wrap">
      <table>
        <thead><tr><th>State</th><th>2026 treatment</th><th>State tax in example</th></tr></thead>
        <tbody>
{chr(10).join(rows)}
        </tbody>
      </table>
    </div>

{faq_html(pairs)}

    <h2>More</h2>
    <ul>
      <li><a href="guide">Capital gains tax explained: short-term vs long-term</a></li>
      <li><a href="home-sale-exclusion">The home sale tax exclusion</a></li>
      <li><a href="faq">Capital gains tax FAQ</a></li>
    </ul>

    {DISCLAIMER}
    <a class="back" href="/">← Back to the calculator</a>
  </article>

  {FOOTER}
  <script>{{const y=document.getElementById("year");if(y)y.textContent=new Date().getFullYear();}}</script>
</body>
</html>
'''
    return path, head(title, desc, path, ld) + body

# ---- home-sale calculator variant (index.html as template) ----
def home_sale_variant():
    path = "home-sale-calculator"
    src = (PUB / "index.html").read_text(encoding="utf-8")
    title = "Home Sale Capital Gains Calculator 2026 - With $250k/$500k Exclusion"
    desc = "Free 2026 home sale capital gains calculator. Applies the $250k/$500k Section 121 exclusion, then estimates federal tax, NIIT, and state tax on the rest."
    ex_gain = 650000
    excl = 500000
    taxable = ex_gain - excl
    fed = fed_long_tax(80000, taxable, "married")
    s = src
    s = re.sub(r"<title>.*?</title>", f"<title>{esc(title)}</title>", s)
    s = re.sub(r'(<meta name="description" content=")[^"]*(")', lambda m: m.group(1) + esc(desc) + m.group(2), s)
    s = s.replace(f'<link rel="canonical" href="{D}/" />', f'<link rel="canonical" href="{D}/{path}" />')
    s = s.replace(f'<meta property="og:url" content="{D}/" />', f'<meta property="og:url" content="{D}/{path}" />')
    s = re.sub(r'(<meta property="og:title" content=")[^"]*(")', lambda m: m.group(1) + esc(title) + m.group(2), s)
    s = re.sub(r'(<meta property="og:description" content=")[^"]*(")', lambda m: m.group(1) + "Applies the Section 121 exclusion first, then estimates federal, NIIT, and state tax on the remaining gain." + m.group(2), s)
    # swap the LD graph for a variant-specific one
    ld = {"@context": "https://schema.org", "@graph": [
        {"@type": "WebApplication", "@id": f"{D}/{path}#webapp", "url": f"{D}/{path}",
         "name": "Home Sale Capital Gains Calculator",
         "applicationCategory": "FinanceApplication", "operatingSystem": "Any",
         "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"},
         "description": desc, "isPartOf": {"@id": f"{D}/#website"}},
        {"@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Capital Gains Calculator", "item": f"{D}/"},
            {"@type": "ListItem", "position": 2, "name": "Home Sale Calculator", "item": f"{D}/{path}"}]},
    ]}
    m = re.search(r'<script type="application/ld\+json">\s*(\{.*?\})\s*</script>', s, re.S)
    s = s[:m.start(1)] + json.dumps(ld, indent=2, ensure_ascii=False) + s[m.end(1):]
    s = s.replace("<h1>Capital Gains Tax Calculator</h1>", "<h1>Home Sale Capital Gains Calculator</h1>")
    s = s.replace('<p class="subtitle">2026 federal &amp; state tax on your sale, in seconds.</p>',
                  '<p class="subtitle">2026 tax on your home sale, with the $250k/$500k exclusion applied.</p>')
    # preset: home checkbox on
    s = s.replace('<script src="script.js?v=3"></script>',
                  '<script>window.PRESET_HOME = true;</script>\n  <script src="script.js?v=3"></script>')
    # variant intro copy
    intro_old = re.search(r'<section class="doc" style="max-width:760px;padding:20px 24px">.*?</section>', s, re.S).group(0)
    intro_new = f'''<section class="doc" style="max-width:760px;padding:20px 24px">
      <p style="font-size:0.94rem;margin:0 0 8px">Selling your primary home? Enter what you paid and what you're selling for, and this calculator applies the IRS Section 121 exclusion first ({money(250000)} of gain tax-free if single, {money(500000)} married filing jointly, with the 2-of-5-year tests), then estimates federal capital gains tax, the 3.8% NIIT, and your state's tax on whatever is left. Example: a married couple with {money(80000)} of taxable income and a {money(ex_gain)} gain excludes {money(excl)}, leaving {money(taxable)} taxable and roughly {money(fed)} of federal tax. Nothing you type is uploaded, and there is no sign-up.</p>
      <p style="font-size:0.92rem;margin:0">The details: <a href="home-sale-exclusion">how the home-sale exclusion works</a> &middot; <a href="guide">capital gains tax explained</a> &middot; <a href="faq">FAQ</a></p>
    </section>'''
    s = s.replace(intro_old, intro_new)
    return path, s, fed, taxable

# ---- write pages ----
written, unchanged = [], []
def write_if_changed(path, content):
    f = PUB / (path + ".html")
    if f.exists() and f.read_text(encoding="utf-8") == content:
        unchanged.append(path)
    else:
        f.write_text(content, encoding="utf-8")
        written.append(path)

for code in ORDER:
    p, html = state_page(code)
    write_if_changed(p, html)
p, html = hub_page()
write_if_changed(p, html)
p, html, hs_fed, hs_taxable = home_sale_variant()
write_if_changed(p, html)
print(f"pages: {len(written)} written, {len(unchanged)} unchanged")
print(f"home-sale example: taxable {money(hs_taxable)}, fed {money(hs_fed)}")

# ---- sitemap (owns all URLs) ----
STATIC = ["", "guide", "home-sale-exclusion", "faq", "about", "privacy"]
GENERATED = [slugify(STATES[c]["name"]) + "-capital-gains-tax" for c in ORDER]
EXTRA = ["state-capital-gains-tax", "home-sale-calculator",
         "inherited-property-capital-gains", "crypto-capital-gains-tax"]
entries = []
for u in STATIC + EXTRA + GENERATED:
    f = PUB / ((u or "index") + ".html")
    if not f.exists():
        print(f"  sitemap skip (missing): {u}")
        continue
    lastmod = datetime.date.fromtimestamp(f.stat().st_mtime).isoformat()
    entries.append(f"  <url>\n    <loc>{D}/{u}</loc>\n    <lastmod>{lastmod}</lastmod>\n  </url>")
sm = ('<?xml version="1.0" encoding="UTF-8"?>\n'
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
      + "\n".join(entries) + "\n</urlset>\n")
old = (PUB / "sitemap.xml").read_text(encoding="utf-8") if (PUB / "sitemap.xml").exists() else ""
if old != sm:
    (PUB / "sitemap.xml").write_text(sm, encoding="utf-8")
    print(f"sitemap: {len(entries)} URLs written")
else:
    print(f"sitemap: unchanged ({len(entries)} URLs)")
print("done")
