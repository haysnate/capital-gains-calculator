# Capital Gains Tax Calculator

Free 2026 capital gains tax calculator — live at [capitalgainscalculatorhq.com](https://capitalgainscalculatorhq.com).

- Short-term vs long-term federal treatment (2026 brackets, Rev. Proc. 2025-32) with a hold-longer savings comparison
- 3.8% net investment income tax (NIIT)
- Section 121 primary-home exclusion ($250k/$500k)
- State tax estimates for all 50 states + DC, including Washington's capital gains excise tax and Massachusetts' 8.5% short-term rate
- 100% client-side — nothing you enter leaves your browser

## Structure

Static site, no build step. Everything deployable lives in `public/`:
`index.html` (tool) · `script.js` (tax engine) · `styles.css` · `guide.html` · `about.html` · `privacy.html` · `404.html` · SEO files (`robots.txt`, `sitemap.xml`, `ads.txt`) · `favicon.ico`

## Deploy

Cloudflare Pages, build output directory `public`, custom domain apex + www.
