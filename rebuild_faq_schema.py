"""Rebuild FAQPage JSON-LD from the VISIBLE .faq markup on each page.

The schema is derived from the copy, so it can never drift from what a
visitor reads (audit 2026-07-26: guide.html's hand-written FAQPage had
4 of 5 questions that appeared nowhere on the page). Rerun after any
edit to a .faq block:  python rebuild_faq_schema.py
"""
import json
import re
import sys
from pathlib import Path

PUB = Path(__file__).parent / "public"
PAGES = ["guide.html", "faq.html", "home-sale-exclusion.html",
         "inherited-property-capital-gains.html", "crypto-capital-gains-tax.html"]

TAG_RE = re.compile(r"<[^>]+>")
WS_RE = re.compile(r"\s+")
LD_RE = re.compile(
    r'(<script type="application/ld\+json">)(.*?)(</script>)', re.S
)


def strip_tags(html):
    return WS_RE.sub(" ", TAG_RE.sub("", html)).strip()


def visible_faq_pairs(html):
    """All h3/p pairs inside <div class="faq"> blocks, in page order."""
    pairs = []
    for block in re.findall(r'<div class="faq">(.*?)</div>', html, re.S):
        items = re.findall(r"<h3>(.*?)</h3>\s*<p>(.*?)</p>", block, re.S)
        pairs.extend((strip_tags(q), strip_tags(a)) for q, a in items)
    return pairs


def faq_node(pairs):
    return {
        "@type": "FAQPage",
        "mainEntity": [
            {
                "@type": "Question",
                "name": q,
                "acceptedAnswer": {"@type": "Answer", "text": a},
            }
            for q, a in pairs
        ],
    }


def rebuild(path):
    html = path.read_text(encoding="utf-8")
    pairs = visible_faq_pairs(html)
    if not pairs:
        print(f"{path.name}: no visible .faq block, skipped")
        return
    m = LD_RE.search(html)
    assert m, f"{path.name}: no JSON-LD block found"
    data = json.loads(m.group(2))
    graph = data.get("@graph")
    assert graph is not None, f"{path.name}: JSON-LD has no @graph"
    graph = [n for n in graph if n.get("@type") != "FAQPage"]
    graph.append(faq_node(pairs))
    data["@graph"] = graph
    new_ld = "\n" + json.dumps(data, indent=2, ensure_ascii=False) + "\n  "
    html = html[: m.start(2)] + new_ld + html[m.end(2) :]
    path.write_text(html, encoding="utf-8")
    print(f"{path.name}: FAQPage rebuilt from {len(pairs)} visible Q&A pairs")


if __name__ == "__main__":
    for name in PAGES:
        rebuild(PUB / name)
    print("done")
