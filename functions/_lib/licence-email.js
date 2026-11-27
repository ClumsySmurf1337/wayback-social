// Shared licence-key email — used by functions/api/paddle-webhook.js
// and functions/api/stripe-webhook.js. One copy: the subject, body,
// caps lines and sandbox sender must never drift between providers
// (a buyer cannot tell which checkout they used from the email).
//
// Email NEVER blocks the purchase: the caller mints + stores the
// licence first and only then calls sendLicenceEmail. A missing
// RESEND_API_KEY or a Resend 4xx/5xx returns {sent:false} and the
// caller answers 200 with email_sent:false + a logged warning —
// the licence row stays active, and a failed send needs a manual
// re-issue (new key; only the key hash is stored, so a retry cannot
// re-send the original — see docs/email-setup.md §5).
//
// Env: RESEND_API_KEY, RESEND_FROM
// (e.g. "ArchiveCheck <licences@deletedproof.northforgelabs.dev>"),
// APP_URL (e.g. https://app.deletedproof.northforgelabs.dev —
// the "verify it" link).

// What each pack unlocks, in one line for the licence email.
// Keep in sync with pricing.yaml / wayback_social/plans.py
// (PLAN_CAPS) — this is display copy, not enforcement.
export const TIER_CAPS_LINE = {
  starter: "250 captures per search, 7 networks in find, 10 batch targets, text for 100 posts.",
  pro: "2,500 captures per search, all 14 networks, 50 batch targets, text for 1,000 posts.",
  studio: "25,000 captures per search, all 14 networks, 200 batch targets, text for 10,000 posts, 10 evidence-pack reports, 5 seats.",
};

// Resend's shared sandbox sender. It delivers ONLY to the email
// address of the Resend account owner — anything else fails with
// 403 ("You can only send testing emails to your own email
// address"). Production MUST set RESEND_FROM to an address on a
// domain verified in Resend (see docs/email-setup.md). This default
// exists so a sandbox purchase still sends to the owner, never so
// it can reach real buyers.
export const SANDBOX_FROM = "ArchiveCheck <onboarding@resend.dev>";

export async function sendLicenceEmail(env, { email, tier, key, appUrl }) {
  if (!env.RESEND_API_KEY) return { sent: false, reason: "RESEND_API_KEY not configured — licence minted, email skipped (set the secret to deliver keys)" };
  const from = env.RESEND_FROM || SANDBOX_FROM;
  const verifyUrl = `${(appUrl || "https://app.deletedproof.northforgelabs.dev").replace(/\/$/, "")}/dashboard.html`;
  const tierLabel = { starter: "Starter", pro: "Pro Pack", studio: "Studio" }[tier] || tier;
  const capsLine = TIER_CAPS_LINE[tier] || "";
  const subject = `Your ArchiveCheck ${tierLabel} licence key`;
  const text = [
    `Thanks for buying ArchiveCheck ${tierLabel}.`,
    ``,
    `Your licence key:`,
    key,
    ``,
    `What it unlocks: ${capsLine}`,
    ``,
    `Paste it into the licence box at ${verifyUrl} to unlock your pack.`,
    `Keep it safe — it is the only copy we send. If you lose it, reply to this email.`,
    ``,
    `A key proves a purchase, not an identity: it unlocks the caps, nothing else.`,
    `Public archived posts only. Found ≠ guilty. Not found ≠ not real.`,
  ].join("\n");
  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;color:#0F1E33;max-width:560px;margin:0 auto;padding:24px">
<h1 style="font-size:20px">Your ArchiveCheck ${tierLabel} licence key</h1>
<p>Thanks for buying ArchiveCheck ${tierLabel}. Paste this key into the licence box to unlock your pack:</p>
<p style="font-family:monospace;font-size:15px;background:#F7F4EC;border:1px solid #E8A13D;border-radius:8px;padding:12px;word-break:break-all">${key}</p>
<p><strong>What it unlocks:</strong> ${capsLine}</p>
<p><a href="${verifyUrl}" style="background:#1F9D63;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Verify my key</a></p>
<p style="color:#5A6B7F;font-size:13px">Keep it safe — this is the only copy we send. If you lose it, reply to this email.<br>
Public archived posts only. Found &ne; guilty. Not found &ne; not real.</p>
</body></html>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [email], subject, html, text }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return { sent: false, reason: `Resend ${res.status}: ${detail.slice(0, 200)}` };
  }
  const body = await res.json().catch(() => ({}));
  return { sent: true, reason: "sent", id: body?.id || null };
}
