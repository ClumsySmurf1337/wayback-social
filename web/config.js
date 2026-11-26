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
      paddle:  { pro: "https://checkout.paddle.com/REPLACE_PADDLE_PRO",
                 studio: "https://checkout.paddle.com/REPLACE_PADDLE_STUDIO" },
      stripe:  { pro: "https://buy.stripe.com/REPLACE_STRIPE_PRO",
                 studio: "https://buy.stripe.com/REPLACE_STRIPE_STUDIO" },
      gumroad: { pro: "https://gumroad.com/l/REPLACE_GUMROAD_PRO",
                 studio: "https://gumroad.com/l/REPLACE_GUMROAD_STUDIO" },
      email:   { pro: "mailto:sales@example.com?subject=wayback-social%20Pro%20Pack%20(%2429)",
                 studio: "mailto:sales@example.com?subject=wayback-social%20Studio%20(%2499)" },
      // Lemon Squeezy is closed (see header) — no links here on purpose.
      lemon:   { pro: "", studio: "" },
    },
  },
  PRICING: [
    {
      id: "free", name: "Free", price: "$0", cadence: "forever",
      blurb: "Try it. One account at a time, from the CLI or this page.",
      features: ["1 search at a time", "Up to 100 results per search",
        "CSV + JSON export", "14 networks", "Community support"],
      cta: "Start free", checkout: null, featured: false,
    },
    {
      id: "pro", name: "Pro Pack", price: "$29", cadence: "one-time",
      blurb: "The whole watchlist. Buy once, keep it forever.",
      features: ["Unlimited searches", "Batch mode — whole watchlists at once",
        "HTML reports + JSONL", "Date-range + resumption-key paging",
        "Priority support", "Free updates for v1.x"],
      cta: "Buy Pro Pack — $29", checkout: "pro", featured: true,
    },
    {
      id: "studio", name: "Studio", price: "$99", cadence: "one-time",
      blurb: "For teams, researchers and newsrooms.",
      features: ["Everything in Pro", "5 seats", "Shared watchlists",
        "Commercial use licence", "Invoice billing"],
      cta: "Buy Studio — $99", checkout: "studio", featured: false,
    },
  ],
  FREE_LIMIT: 100,
  CDX_BASE: "https://web.archive.org/cdx/search/cdx",
};
