// Stripe tier resolution for functions/api/stripe-webhook.js —
// which pack a Checkout Session bought, and how many seats it gets.
//
// Resolution order (never a guessed tier):
//   1. session.metadata.tier — the Payment Link's metadata is
//      copied onto the Checkout Session by Stripe, and all five
//      live links carry it (docs/stripe-vs-clerk.md §7).
//      "bundle" maps to "studio" (a bundle purchase mints a Studio
//      key, same as Paddle); "topup" is a text-fetch top-up, NOT a
//      licence — the caller answers it 200 + ignored (credits have
//      no ledger yet; see docs/stripe-webhook.md).
//   2. Line items via the Stripe API (GET /v1/checkout/sessions/
//      {id}/line_items, STRIPE_SECRET_KEY) -> price id ->
//      STRIPE_PRICE_IDS env map. Only used when the metadata tier
//      is missing or unknown.
//   3. Neither yields a tier -> the caller answers 400 with the
//      price id in the log, never a minted key for the wrong pack.
//
// Price IDs live in the STRIPE_PRICE_IDS env var (JSON:
// {"price_...": "starter", ...}), never in code — the fallback
// map below is empty by design, same as the Paddle webhook.
const PRICE_TO_TIER_FALLBACK = {};

/** Seats for a tier: Studio is the 5-seat pack, the rest are 1. */
export function tierSeats(tier) {
  return tier === "studio" ? 5 : 1;
}

function priceMap(env) {
  try {
    return { ...PRICE_TO_TIER_FALLBACK, ...JSON.parse(env.STRIPE_PRICE_IDS || "{}") };
  } catch {
    return { ...PRICE_TO_TIER_FALLBACK };
  }
}

/** Normalise a tier value from Stripe metadata or the price map. */
export function normalizeTier(value) {
  const t = String(value || "").toLowerCase().trim();
  if (t === "starter" || t === "pro" || t === "studio") return t;
  if (t === "bundle") return "studio";
  if (t === "topup" || t === "top-up" || t === "top_up" || t === "text") return "topup";
  return null;
}

async function fetchLineItems(sessionId, secret) {
  const res = await fetch(
    `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}/line_items?limit=5`,
    { headers: { Authorization: "Basic " + btoa(secret + ":") } },
  );
  if (!res.ok) throw new Error(`Stripe line_items ${res.status}`);
  const body = await res.json().catch(() => ({}));
  return Array.isArray(body?.data) ? body.data : [];
}

/** Tier for a Checkout Session: metadata first, line items second. */
export async function resolveTier(session, env) {
  const metaTier = normalizeTier(session?.metadata?.tier);
  if (metaTier) return { tier: metaTier, priceId: null, source: "session.metadata.tier" };
  const secret = env.STRIPE_SECRET_KEY || "";
  if (!secret) {
    return { tier: null, priceId: null, source: null, error: "cannot determine tier: no session.metadata.tier and no STRIPE_SECRET_KEY to fetch line items" };
  }
  let items;
  try {
    items = await fetchLineItems(session.id, secret);
  } catch (e) {
    return { tier: null, priceId: null, source: null, error: `could not fetch line items from Stripe: ${e?.message || e}` };
  }
  const priceId = items?.[0]?.price?.id || null;
  if (!priceId) return { tier: null, priceId: null, source: null, error: "cannot determine tier: line items returned no price id" };
  const mapped = normalizeTier(priceMap(env)[priceId]);
  if (!mapped) return { tier: null, priceId, source: "line_items", error: `unmapped price_id: ${priceId} — set STRIPE_PRICE_IDS` };
  return { tier: mapped, priceId, source: "line_items" };
}
