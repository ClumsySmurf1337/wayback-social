"""Production licence keys (DP2) — Ed25519-signed, offline-verifiable.

Key format: ``DP2-<TIER>-<16 random base32>-<86 base64url signature>``
e.g. ``DP2-PRO-ABCDEFGHIJKLMNOP-<86 chars>``.

(64-byte Ed25519 signature is 88 base64 chars *with* padding; the
DP2 format is unpadded base64url, so the signature field is 86 chars.
Track K 2026-11-27 proved minted keys measure 86 — the old "88" here
contradicted the example on the next line.)

The signature is Ed25519 over the bytes ``DP2:<TIER>:<RANDOM>``,
made by the Cloudflare Pages Function on the Paddle webhook
(see functions/api/paddle-webhook.js). Verification needs only the
baked-in PUBLIC key below — no secret on the client, nobody can forge
a key. Revocation is a server-side D1 lookup
(``/api/licence-check``); offline verification cannot know about
refunds, and the CLI says so when it reports a DP2 key as valid.

The public key below is the production keypair generated 2026-11-26
(``scripts/gen_licence_keys.mjs``). The private key lives ONLY as a
Cloudflare Pages secret (``LICENCE_ED25519_PRIVATE_KEY``) — never in
the repo. Rotate with the script + docs/paddle-webhook.md.

DP1 (HMAC, ``licence.py``) still works for dev/demo and is untouched.
``resolve_plan`` in licence.py tries DP2 first, then DP1.
"""
from __future__ import annotations

import base64
import binascii
import hashlib
import secrets

from . import ed25519
from .plans import PLAN_IDS

KEY_PREFIX = "DP2"

# Production Ed25519 public key (SPKI DER, base64). Safe to commit:
# a public key verifies, it cannot mint. Generated 2026-11-26.
PUBLIC_KEY_B64 = "MCowBQYDK2VwAyEARKv2d0s14DXxgqIm4SbtMN1uUmK/+4CHVF5SaCe89Vs="


def public_key_bytes(b64: str | None = None) -> bytes:
    """SPKI DER (base64) -> raw 32-byte Ed25519 public key."""
    # NOTE: b64 defaults to None, not PUBLIC_KEY_B64 — a default
    # argument would bind the module constant at import time and
    # ignore rotation / test monkeypatching.
    der = base64.b64decode(b64 if b64 is not None else PUBLIC_KEY_B64)
    if len(der) < 32:
        raise ValueError("public key DER is too short")
    return der[-32:]


def _payload(tier: str, random: str) -> bytes:
    return f"{KEY_PREFIX}:{tier.upper()}:{random}".encode("utf-8")


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _b64url_decode(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def make_key(tier: str, seed: bytes) -> str:
    """Mint a DP2 key from a 32-byte Ed25519 seed.

    Test/dev use only — production mints in the Pages Function
    (Node crypto). Raises ValueError for an unknown tier / bad seed.
    """
    tier = tier.lower()
    if tier not in PLAN_IDS:
        raise ValueError(f"Unknown tier {tier!r}; use one of {PLAN_IDS}.")
    if len(seed) != 32:
        raise ValueError("seed must be 32 bytes")
    public_key = ed25519.publickey_from_seed(seed)
    random = base64.b32encode(secrets.token_bytes(10)).decode().rstrip("=")
    sig = ed25519.sign(_payload(tier, random), seed, public_key)
    return f"{KEY_PREFIX}-{tier.upper()}-{random}-{_b64url(sig)}"


def parse_key(key: str) -> dict | None:
    """Parse the DP2 format only (no crypto). None if malformed.

    NOTE: the base64url signature alphabet includes ``-``, so the key
    is split with maxsplit=3 — the signature is always the last part
    and may itself contain dashes. Splitting on every ``-`` breaks
    (the first version of this bug produced 7 parts).
    """
    parts = (key or "").strip().split("-", 3)
    if len(parts) != 4 or parts[0] != KEY_PREFIX:
        return None
    tier = parts[1].lower()
    if tier not in PLAN_IDS or len(parts[2]) != 16:
        return None
    if not parts[2].isalnum():
        return None
    try:
        sig = _b64url_decode(parts[3])
    except (binascii.Error, ValueError):
        return None
    if len(sig) != 64:
        return None
    return {"tier": tier, "random": parts[2], "signature": sig}


def verify_key(key: str, public_key: bytes | None = None) -> tuple[bool, str | None, str]:
    """Verify a DP2 key against the baked-in production public key.

    Returns (valid, tier-or-None, reason). Fails closed on a bad
    signature, a malformed key, or a missing/placeholder public key.
    """
    parsed = parse_key(key)
    if not parsed:
        return False, None, ("malformed key — expected "
                             "DP2-<TIER>-<16 chars>-<86-char signature>")
    if public_key is None:
        try:
            public_key = public_key_bytes()
        except ValueError as exc:
            return False, None, f"production public key not configured: {exc}"
    ok = ed25519.verify(_payload(parsed["tier"], parsed["random"]),
                        parsed["signature"], public_key)
    if not ok:
        return False, None, "signature mismatch — not minted with the production key"
    return True, parsed["tier"], "valid"


def key_hash(key: str) -> str:
    """SHA-256 of the full key — what D1 stores (never the key itself)."""
    return hashlib.sha256(key.strip().encode("utf-8")).hexdigest()


def key_prefix(key: str) -> str:
    """First 24 chars (DP2-TIER-RANDOM) — support lookup, not a secret."""
    return (key or "").strip()[:24]
