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
                 bundle: "https://checkout.paddle.com/REPLACE_PADDLE_BUNDLE" },
      stripe:  { starter: "https://buy.stripe.com/REPLACE_STRIPE_STARTER",
                 pro: "https://buy.stripe.com/REPLACE_STRIPE_PRO",
                 studio: "https://buy.stripe.com/REPLACE_STRIPE_STUDIO",
                 bundle: "https://buy.stripe.com/REPLACE_STRIPE_BUNDLE" },
      gumroad: { starter: "https://gumroad.com/l/REPLACE_GUMROAD_STARTER",
                 pro: "https://gumroad.com/l/REPLACE_GUMROAD_PRO",
                 studio: "https://gumroad.com/l/REPLACE_GUMROAD_STUDIO",
                 bundle: "https://gumroad.com/l/REPLACE_GUMROAD_BUNDLE" },
      email:   { starter: "mailto:sales@example.com?subject=wayback-social%20Starter%20(%249)",
                 pro: "mailto:sales@example.com?subject=wayback-social%20Pro%20Pack%20(%2419)",
                 studio: "mailto:sales@example.com?subject=wayback-social%20Studio%20(%2449)",
                 bundle: "mailto:sales@example.com?subject=wayback-social%20All-in%20Bundle%20(%2459)" },
      // Lemon Squeezy is closed (see header) — no links here on purpose.
      lemon:   { starter: "", pro: "", studio: "", bundle: "" },
    },
  },
  // PRICING v1.2 — options-based, cheaper than the subscription rivals.
  // Social Catfish charges $27.48/mo AFTER a $5.73 trial; Spokeo $19.95/mo;
  // Hunchly $169/yr; Pagefreezer from $1,500/yr. Every pack below is a
  // ONE-TIME payment — Pro launch ($19) costs less than one month of
  // Social Catfish, and it never bills again.
  // Net kept (fee math, verified 2026-11-26):
  //   Paddle 5%+50c:   $9 -> $8.05 | $19 -> $17.55 | $49 -> $46.05 | $59 -> $55.55
  //   Stripe 2.9%+30c: $9 -> $8.44 | $19 -> $18.15 | $49 -> $47.28 | $59 -> $56.99
  //   Gumroad 12.9%+80c: $9 -> $7.04 | $19 -> $15.75 | $49 -> $41.88 | $59 -> $50.59
  // Bundle math (honest): regular total = Starter $9 + Pro $29 + Studio $99
  // = $137; launch bundle $59 = 57% off. (An earlier draft said $118 —
  // that does not add up with these regular prices; $137 is the real sum.)
  PRICING: [
    {
      id: "free", name: "Free", price: "$0", cadence: "forever",
      blurb: "Try it. Capped, but genuinely useful.",
      features: ["25 captures per search", "3 networks per broad search",
        "CSV export", "14 networks", "Community support"],
      cta: "Start free", checkout: null, featured: false,
    },
    {
      id: "starter", name: "Starter", price: "$9", cadence: "one-time",
      blurb: "The cheap pack. One deleted post is worth $9.",
      features: ["250 captures per search", "7 networks per broad search",
        "10 targets per batch", "Text fetch for 100 posts",
        "CSV + JSON + JSONL + HTML export"],
      cta: "Buy Starter — $9", checkout: "starter", featured: false,
    },
    {
      id: "pro", name: "Pro Pack", price: "$19", regular: "$29", cadence: "one-time",
      blurb: "Launch price — less than one month of Social Catfish ($27.48/mo).",
      features: ["2,500 captures per search", "All 14 networks",
        "50 targets per batch", "Deleted-only diff + live check",
        "Text fetch for 1,000 posts", "Priority support"],
      cta: "Buy Pro Pack — $19", checkout: "pro", featured: true,
    },
    {
      id: "studio", name: "Studio", price: "$49", regular: "$99", cadence: "one-time",
      blurb: "For teams, researchers and newsrooms.",
      features: ["25,000 captures per search", "All 14 networks",
        "200 targets per batch", "Evidence pack (diff + HTML reports)",
        "Text fetch for 10,000 posts", "5 seats", "Commercial use licence"],
      cta: "Buy Studio — $49", checkout: "studio", featured: false,
    },
    {
      id: "bundle", name: "All-in Bundle", price: "$59", regular: "$137", cadence: "one-time",
      blurb: "Every pack, one price. 57% off the $137 regular total.",
      features: ["Everything in Starter + Pro + Studio",
        "All caps at Studio level", "All future v1.x updates",
        "Best value — buy once, keep it forever"],
      cta: "Buy All-in Bundle — $59", checkout: "bundle", featured: false,
    },
  ],
  FREE_LIMIT: 25,
  CDX_BASE: "https://web.archive.org/cdx/search/cdx",
};
