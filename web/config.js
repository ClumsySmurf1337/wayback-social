/* wayback-social web app — single place for pricing + checkout.
 *
 * CHECKOUT — swappable, testable. One switch changes every Buy button:
 *   CHECKOUT.provider: "paddle" | "stripe" | "gumroad" | "email"
 *   ?checkout=paddle|stripe|gumroad|email   (URL param, for testing / A-B)
 *   ?ab=paddle-stripe   (splits visitors 50/50, stored in sessionStorage
 *                       so one visitor stays on one)
 * Each provider has one link per pack. Replace REPLACE_* with real links:
 *   Paddle:         Products > Checkout link (merchant of record — tax/VAT
 *                   handled, licence delivery included; 5% + 50c)
 *   Stripe:         Products > Payment Links (cheapest, 2.9% + 30c, but
 *                   tax + delivery are yours to build) — LIVE 2026-11-27:
 *                   live links below (launch prices, no tax set — see
 *                   docs/stripe-vs-clerk.md §5/§7; sales-tax decision
 *                   still open with John). Paddle stays the alternative.
 *   Gumroad:        Product > Share URL (easiest storefront, priciest)
 *   email:          mailto: link — buyer emails you, you send the pack
 * DO NOT USE Lemon Squeezy: it closed to new sign-ups 16 Nov 2026 and
 * stops processing 31 Mar 2027 (verified 26 Nov 2026). Its links are
 * kept in the config only as a warning — the page refuses them.
 * Until a link is real, its Buy button explains checkout isn't
 * connected yet instead of taking money — never a dead link, never a
 * fake sale.
 *
 * PRICING — the numbers here are generated from pricing.yaml (the single source of truth) by scripts/sync_pricing.py; change pricing.yaml and re-run the sync, never hand-edit the prices in this file.
 */
window.WAYBACK_SOCIAL_CONFIG = {
  CHECKOUT: {
    provider: "stripe", // default — LIVE checkout since 2026-11-27 (launch prices, no tax set); Paddle stays as the ?checkout=paddle alternative
    links: {
      paddle:  { starter: "https://checkout.paddle.com/REPLACE_PADDLE_STARTER",
                 pro: "https://checkout.paddle.com/REPLACE_PADDLE_PRO",
                 studio: "https://checkout.paddle.com/REPLACE_PADDLE_STUDIO",
                 bundle: "https://checkout.paddle.com/REPLACE_PADDLE_BUNDLE",
                 topup: "https://checkout.paddle.com/REPLACE_PADDLE_TOPUP" },
      stripe:  { starter: "https://buy.stripe.com/6oUaEX3Xm3NB16E8Ik3sI04",
                 pro: "https://buy.stripe.com/eVq6oHdxWck7dTqf6I3sI00",
                 studio: "https://buy.stripe.com/28EeVd79ydobeXu2jW3sI01",
                 bundle: "https://buy.stripe.com/4gM9AT3XmdobbLie2E3sI03",
                 topup: "https://buy.stripe.com/bJe7sLdxW4RF02Ae2E3sI02" },
      gumroad: { starter: "https://gumroad.com/l/REPLACE_GUMROAD_STARTER",
                 pro: "https://gumroad.com/l/REPLACE_GUMROAD_PRO",
                 studio: "https://gumroad.com/l/REPLACE_GUMROAD_STUDIO",
                 bundle: "https://gumroad.com/l/REPLACE_GUMROAD_BUNDLE",
                 topup: "https://gumroad.com/l/REPLACE_GUMROAD_TOPUP" },
      email:   { starter: "mailto:sales@example.com?subject=ArchiveCheck%20Starter%20(%249)",
                 pro: "mailto:sales@example.com?subject=ArchiveCheck%20Pro%20Pack%20(%2419)",
                 studio: "mailto:sales@example.com?subject=ArchiveCheck%20Studio%20(%2449)",
                 bundle: "mailto:sales@example.com?subject=ArchiveCheck%20All-in%20Bundle%20(%2459)",
                 topup: "mailto:sales@example.com?subject=ArchiveCheck%20Text-fetch%20top-up%20(%2415)" },
      // Lemon Squeezy is closed (see header) — no links here on purpose.
      lemon:   { starter: "", pro: "", studio: "", bundle: "", topup: "" },
    },
  },
  // __PRICING_BEGIN__ — generated from pricing.yaml by scripts/sync_pricing.py. DO NOT EDIT BY HAND.
  LAUNCH_NOTE: "Launch pricing — early-bird offer for our first buyers: launch prices end after the first 90 days or the first 500 buyers, whichever comes first — then regular prices apply.",
  TOPUP: { price: 15, credits: 500 },
  // Net kept (fee math — generated; Paddle 5%+50c, Stripe 2.9%+30c):
  //   Starter $9 launch: Paddle keeps $8.05 | Stripe keeps $8.44
  //   Starter $19 regular: Paddle keeps $17.55 | Stripe keeps $18.15
  //   Pro Pack $19 launch: Paddle keeps $17.55 | Stripe keeps $18.15
  //   Pro Pack $29 regular: Paddle keeps $27.05 | Stripe keeps $27.86
  //   Studio $49 launch: Paddle keeps $46.05 | Stripe keeps $47.28
  //   Studio $99 regular: Paddle keeps $93.55 | Stripe keeps $95.83
  //   All-in Bundle $59 launch: Paddle keeps $55.55 | Stripe keeps $56.99
  //   All-in Bundle $147 regular: Paddle keeps $139.15 | Stripe keeps $142.44
  //   Top-up $15: Paddle keeps $13.75 | Stripe keeps $14.27
  // Bundle math: regular total = Starter $19 + Pro $29 + Studio $99 = $147; launch bundle $59 is 60% off.
  PRICING: [
    {
      id: "free", name: "Free", price: "$0", cadence: "forever",
      blurb: "Try it. Capped, but genuinely useful.",
      features: ["25 captures per search", "3 networks per broad search", "3 targets per batch", "Text fetch for 5 posts", "CSV export"],
      cta: "Start free", checkout: null, featured: false,
    },
    {
      id: "starter", name: "Starter", price: "$9", regular: "$19", cadence: "one-time",
      blurb: "The cheap pack. One deleted post is worth $9.",
      features: ["250 captures per search", "7 networks per broad search", "10 targets per batch", "Text fetch for 100 posts", "CSV + JSON export", "Deleted-only diff + live check"],
      cta: "Buy Starter — $9", checkout: "starter", featured: false,
    },
    {
      id: "pro", name: "Pro Pack", price: "$19", regular: "$29", cadence: "one-time",
      blurb: "Launch price — less than one month of Social Catfish ($27.48/mo).",
      features: ["2,500 captures per search", "All 14 networks", "50 targets per batch", "Text fetch for 1,000 posts", "CSV + JSON + JSONL + HTML export", "Deleted-only diff + live check", "Keyword search over fetched text"],
      cta: "Buy Pro Pack — $19", checkout: "pro", featured: true,
    },
    {
      id: "studio", name: "Studio", price: "$49", regular: "$99", cadence: "one-time",
      blurb: "A pack for teams, researchers and newsrooms — 10 evidence-pack reports included.",
      features: ["25,000 captures per search", "All 14 networks", "200 targets per batch", "Text fetch for 10,000 posts", "CSV + JSON + JSONL + HTML export", "Deleted-only diff + live check", "Keyword search over fetched text", "10 evidence-pack reports included", "5 seats", "Commercial use licence"],
      cta: "Buy Studio — $49", checkout: "studio", featured: false,
    },
    {
      id: "bundle", name: "All-in Bundle", price: "$59", regular: "$147", cadence: "one-time",
      blurb: "Every pack, one price. 60% off the $147 regular total.",
      features: ["Everything in Starter + Pro + Studio", "25,000 captures per search", "All 14 networks", "200 targets per batch", "Text fetch for 10,000 posts", "CSV + JSON + JSONL + HTML export", "Deleted-only diff + live check", "Keyword search over fetched text", "10 evidence-pack reports included", "5 seats", "Commercial use licence", "Best value — 60% off the $147 regular total"],
      cta: "Buy All-in Bundle — $59", checkout: "bundle", featured: false,
    },
    {
      id: "topup", name: "Text-fetch top-up", price: "$15", cadence: "500 credits",
      blurb: "Add 500 replay-text fetches to any paid pack. Credits never expire.",
      features: ["500 text-fetch credits", "Works with Starter, Pro and Studio", "Never expires"],
      cta: "Buy 500 credits — $15", checkout: "topup", featured: false,
    },
  ],
  FEATURE_CHART: [
    {label: "Captures per search", values: {free: "25", starter: "250", pro: "2,500", studio: "25,000", bundle: "25,000"}},
    {label: "Networks per broad search (find)", values: {free: "3", starter: "7", pro: "All 14", studio: "All 14", bundle: "All 14"}},
    {label: "Batch targets per run", values: {free: "3", starter: "10", pro: "50", studio: "200", bundle: "200"}},
    {label: "Replay-text fetches per search", values: {free: "5", starter: "100", pro: "1,000", studio: "10,000", bundle: "10,000"}},
    {label: "Exports", values: {free: "CSV", starter: "CSV + JSON", pro: "CSV + JSON + JSONL + HTML", studio: "CSV + JSON + JSONL + HTML", bundle: "CSV + JSON + JSONL + HTML"}},
    {label: "Deleted-only diff", values: {free: "—", starter: "✓", pro: "✓", studio: "✓", bundle: "✓"}},
    {label: "Replay text fetch", values: {free: "✓", starter: "✓", pro: "✓", studio: "✓", bundle: "✓"}},
    {label: "archive.today / Ghostarchive fallback links", values: {free: "✓", starter: "✓", pro: "✓", studio: "✓", bundle: "✓"}},
    {label: "Keyword search (over fetched text)", values: {free: "—", starter: "—", pro: "✓", studio: "✓", bundle: "✓"}},
    {label: "Evidence-pack reports included", values: {free: "—", starter: "—", pro: "—", studio: "10", bundle: "10"}},
    {label: "Seats", values: {free: "1", starter: "1", pro: "1", studio: "5", bundle: "5"}},
    {label: "Commercial use", values: {free: "—", starter: "—", pro: "—", studio: "✓", bundle: "✓"}},
    {label: "Support", values: {free: "Community", starter: "Community", pro: "Community", studio: "Priority (human inbox, 48h)", bundle: "Priority (human inbox, 48h)"}},
  ],
  // __PRICING_END__
  FREE_LIMIT: 25,
  CDX_BASE: "https://web.archive.org/cdx/search/cdx",
  // Same-origin CDX proxy (functions/api/cdx.js, a Pages Function).
  // archive.org sends no CORS headers, so a live search from the
  // deployed site fails without it (verified 2026-11-26). The page
  // uses the proxy on any non-localhost host and talks to CDX
  // directly on localhost (where the Function does not run).
  CDX_PROXY: "/api/cdx",
  // Arquivo.pt — the second archive source (functions/api/arquivo.js).
  // Same pattern as CDX: same-origin proxy on the deployed site,
  // direct arquivo.pt calls on localhost (arquivo.pt sends
  // Access-Control-Allow-Origin: *, verified 2026-11-27, so direct
  // calls work from a browser). CDX mode uses wayback/cdx; keyword
  // mode uses textsearch (full-text, Pro feature).
  ARQUIVO_CDX_BASE: "https://arquivo.pt/wayback/cdx",
  ARQUIVO_TEXTSEARCH_BASE: "https://arquivo.pt/textsearch",
  ARQUIVO_PROXY: "/api/arquivo",
  // Ghostarchive (functions/api/ghostarchive.js) and Common Crawl
  // (functions/api/commoncrawl.js) — proxy-only: neither sends
  // CORS headers a browser can use, so there is no direct mode.
  // When a proxy key is absent, that source is unavailable.
  GHOSTARCHIVE_PROXY: "/api/ghostarchive",
  COMMONCRAWL_PROXY: "/api/commoncrawl",
  // The Common Crawl index the console queries by default. Must
  // match the /api/commoncrawl default and the CLI's
  // DEFAULT_CC_CRAWL (wayback_social/archives.py) — the sync
  // script (scripts/sync_config.py) checks the three agree.
  CC_CRAWL: "CC-MAIN-2026-47",
  // LICENCE — demo verification only (see web/licence.js). The demo
  // secret is public by design: keys minted with it unlock the tier
  // UI locally so it can be tried end to end, but they are NOT
  // purchases. Production keys are minted server-side (Paddle webhook
  // -> Ed25519-signed key -> D1 -> Resend) and verified against the
  // baked-in public key — docs/storage-auth-plan.md. A key is never
  // sent anywhere by the page; it lives in localStorage on the device.
  LICENCE: { demo_secret: "deletedproof-demo-secret", storage_key: "ws_licence" },
  // ANALYTICS — Cloudflare Web Analytics (free, cookieless, page views
  // only). Off by default: set enabled true + token (from the
  // Cloudflare dashboard, Web Analytics > Add a site) to turn it on.
  // We never track searched handles, results, or licence keys —
  // see docs/analytics.md.
  ANALYTICS: { provider: "cloudflare-web-analytics", token: "", enabled: false },
  // AUTH — Clerk (Phase 2, issue #6; see docs/clerk-auth.md and
  // docs/clerk-env-swap.md §10). Publishable key only: it is safe
  // to ship in this file (Clerk's own docs put it in frontend
  // code). The value here is the DEV / LOCAL FALLBACK (the Socialz
  // dev app, pk_test_…). On a deployed host the page first asks
  // /api/config, which returns the key from that environment's
  // Pages env var CLERK_PUBLISHABLE_KEY (pk_test_… on Preview,
  // pk_live_… on Production once the prod instance exists) — the
  // endpoint wins when it has a real key, this value is the
  // fallback. Until a real key is configured anywhere, auth.js
  // shows "Sign-in coming soon" and the free search + licence keys
  // work exactly as before. The SECRET key never goes here — it
  // lives in Pages env vars (CLERK_SECRET_KEY, per environment)
  // for functions/api/link-licence.js. Clerk's own sign-up bot
  // protection (Turnstile-based) is enabled in the Clerk Dashboard,
  // not in code.
  CLERK: { publishable_key: "pk_test_YmVsb3ZlZC1nYXplbGxlLTQ2NzguY2xlcmsuYWNjb3VudHMuZGV2JA", enabled: true },
  // TURNSTILE — Cloudflare bot check for the SEARCH form (free,
  // see web/turnstile.js + docs/clerk-auth.md §6 and
  // docs/clerk-env-swap.md §10). The site key is public by design.
  // Same dev/prod swap as Clerk: the deployed host's key comes
  // from /api/config (TURNSTILE_SITE_KEY env var per environment);
  // the value here is the static fallback. Until a real key is
  // configured anywhere, the search runs with no bot check,
  // exactly as before. The SECRET key never goes here — it lives
  // in Pages env vars (TURNSTILE_SECRET_KEY, per environment) and
  // only functions/api/cdx.js sees it.
  // Official test site keys (Cloudflare docs): always-pass
  // 1x00000000000000000000AA, always-block 2x00000000000000000000AB,
  // force-challenge 3x00000000000000000000FF.
  TURNSTILE: { site_key: "0x4AAAAAAGV8UGE-2rGL9e1L", enabled: true },
};
