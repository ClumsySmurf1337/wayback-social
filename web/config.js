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
 *                   tax + delivery are yours to build)
 *   Gumroad:        Product > Share URL (easiest storefront, priciest)
 *   email:          mailto: link — buyer emails you, you send the pack
 * DO NOT USE Lemon Squeezy: it closed to new sign-ups 16 Nov 2026 and
 * stops processing 31 Mar 2027 (verified 26 Nov 2026). Its links are
 * kept in the config only as a warning — the page refuses them.
 * Until a link is real, its Buy button explains checkout isn't
 * connected yet instead of taking money — never a dead link, never a
 * fake sale.
 *
 * DRAFT PRICING (John: change the numbers here; the page and the README
 * pricing table follow this file — see CONTRIBUTING.md).
 */
window.WAYBACK_SOCIAL_CONFIG = {
  CHECKOUT: {
    provider: "paddle", // default — merchant of record, tax + licences handled
    links: {
      paddle:  { starter: "https://checkout.paddle.com/REPLACE_PADDLE_STARTER",
                 pro: "https://checkout.paddle.com/REPLACE_PADDLE_PRO",
                 studio: "https://checkout.paddle.com/REPLACE_PADDLE_STUDIO",
                 bundle: "https://checkout.paddle.com/REPLACE_PADDLE_BUNDLE",
                 topup: "https://checkout.paddle.com/REPLACE_PADDLE_TOPUP" },
      stripe:  { starter: "https://buy.stripe.com/REPLACE_STRIPE_STARTER",
                 pro: "https://buy.stripe.com/REPLACE_STRIPE_PRO",
                 studio: "https://buy.stripe.com/REPLACE_STRIPE_STUDIO",
                 bundle: "https://buy.stripe.com/REPLACE_STRIPE_BUNDLE",
                 topup: "https://buy.stripe.com/REPLACE_STRIPE_TOPUP" },
      gumroad: { starter: "https://gumroad.com/l/REPLACE_GUMROAD_STARTER",
                 pro: "https://gumroad.com/l/REPLACE_GUMROAD_PRO",
                 studio: "https://gumroad.com/l/REPLACE_GUMROAD_STUDIO",
                 bundle: "https://gumroad.com/l/REPLACE_GUMROAD_BUNDLE",
                 topup: "https://gumroad.com/l/REPLACE_GUMROAD_TOPUP" },
      email:   { starter: "mailto:sales@example.com?subject=wayback-social%20Starter%20(%249)",
                 pro: "mailto:sales@example.com?subject=wayback-social%20Pro%20Pack%20(%2419)",
                 studio: "mailto:sales@example.com?subject=wayback-social%20Studio%20(%2449)",
                 bundle: "mailto:sales@example.com?subject=wayback-social%20All-in%20Bundle%20(%2459)",
                 topup: "mailto:sales@example.com?subject=wayback-social%20Text-fetch%20top-up%20(%2415)" },
      // Lemon Squeezy is closed (see header) — no links here on purpose.
      lemon:   { starter: "", pro: "", studio: "", bundle: "", topup: "" },
    },
  },
  // __PRICING_BEGIN__ — generated from pricing.yaml by scripts/sync_pricing.py. DO NOT EDIT BY HAND.
  LAUNCH_NOTE: "Launch pricing — first 90 days or 500 buyers, then regular prices apply.",
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
};
