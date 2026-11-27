"""Licence keys for wayback-social (v1, offline-verifiable, DEV scheme).

Key format: ``DP1-<TIER>-<16 random base32 chars>-<8 hex HMAC checksum>``
e.g. ``DP1-PRO-ABCDEFGHIJKLMNOP-1a2b3c4d``.

The checksum is HMAC-SHA256 over ``DP1:<TIER>:<random>`` with a shared
secret. The secret comes from the ``WAYBACK_SOCIAL_LICENCE_SECRET``
environment variable, or from ``~/.config/wayback-social/licence.key``
(a file containing the secret and nothing else). ``licence make`` is
dev-only: it refuses to run without the env var, so no key can be
minted by accident and no secret ever lands in the repo.

This is the DEV / OFFLINE equivalent of the production design, not
the production design itself: a symmetric HMAC means anyone holding
the secret can mint keys, so the secret must never ship to buyers.
Production mints Ed25519-signed keys in a Cloudflare Pages Function
(Paddle webhook -> D1 -> Resend email) and the CLI/web verify with
the baked-in PUBLIC key — see docs/storage-auth-plan.md (addendum).
Here, ``check`` / ``--licence`` need the secret because HMAC
verification is symmetric; treat that as the dev limitation it is.

A Bundle purchase mints a Studio key (the bundle buys all packs, so
its caps are Studio-level — see plans.BUNDLE_CAPS).
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets
from pathlib import Path

from . import licence2
from .plans import PLAN_IDS

KEY_PREFIX = "DP1"
SECRET_ENV = "WAYBACK_SOCIAL_LICENCE_SECRET"
SECRET_FILE = Path.home() / ".config" / "wayback-social" / "licence.key"


def load_secret(env: dict | None = None) -> str | None:
    """Secret from env var, else the licence.key file. None if neither."""
    env = os.environ if env is None else env
    secret = (env.get(SECRET_ENV) or "").strip()
    if secret:
        return secret
    try:
        text = SECRET_FILE.read_text(encoding="utf-8").strip()
    except OSError:
        return None
    return text or None


def _checksum(tier: str, random: str, secret: str) -> str:
    payload = f"{KEY_PREFIX}:{tier.upper()}:{random}".encode("utf-8")
    return hmac.new(secret.encode("utf-8"), payload,
                    hashlib.sha256).hexdigest()[:8]


def make_key(tier: str, secret: str) -> str:
    """Mint a key for a tier. Raises ValueError for an unknown tier."""
    tier = tier.lower()
    if tier not in PLAN_IDS:
        raise ValueError(f"Unknown tier {tier!r}; use one of {PLAN_IDS}.")
    random = base64.b32encode(secrets.token_bytes(10)).decode().rstrip("=")
    return (f"{KEY_PREFIX}-{tier.upper()}-{random}-"
            f"{_checksum(tier, random, secret)}")


def parse_key(key: str) -> dict | None:
    """Parse the key format only (no secret needed). None if malformed."""
    parts = (key or "").strip().split("-")
    if len(parts) != 4 or parts[0] != KEY_PREFIX:
        return None
    tier = parts[1].lower()
    if tier not in PLAN_IDS or len(parts[2]) != 16 or len(parts[3]) != 8:
        return None
    if not parts[2].isalnum() or not all(c in "0123456789abcdef"
                                         for c in parts[3].lower()):
        return None
    return {"tier": tier, "random": parts[2], "checksum": parts[3].lower()}


def verify_key(key: str, secret: str) -> tuple[bool, str | None, str]:
    """Verify a key against the secret.

    Returns (valid, tier-or-None, reason). A bad checksum, a malformed
    key, or an unknown tier all fail closed.
    """
    parsed = parse_key(key)
    if not parsed:
        return False, None, ("malformed key — expected "
                             "DP1-<TIER>-<16 chars>-<8 hex chars>")
    expected = _checksum(parsed["tier"], parsed["random"], secret)
    if not hmac.compare_digest(expected, parsed["checksum"]):
        return False, None, "checksum mismatch — not minted with this secret"
    return True, parsed["tier"], "valid"


def resolve_plan(plan: str, licence_key: str | None,
                 env: dict | None = None) -> tuple[str, str | None]:
    """Effective plan for a command.

    No licence: the --plan value stands. With a licence: DP2 keys
    (Ed25519, production) verify offline against the baked-in public
    key — no secret needed; DP1 keys (HMAC, dev) need the secret
    from env or ~/.config. The key's tier wins over --plan.
    Raises ValueError on a bad key or a missing secret — the caller
    turns that into a usage error. Offline verification cannot know
    about refunds/revocation; use /api/licence-check for that.
    """
    if not licence_key:
        return plan, None
    if licence_key.strip().startswith(licence2.KEY_PREFIX + "-"):
        valid, tier, reason = licence2.verify_key(licence_key)
        if not valid:
            raise ValueError(f"Invalid licence key: {reason}.")
        note = (f"Licence verified: {tier} plan caps unlocked"
                + (f" (overrides --plan {plan})" if tier != plan else "")
                + " (offline check — revocation needs /api/licence-check).")
        return tier, note
    secret = load_secret(env)
    if not secret:
        raise ValueError(
            f"--licence needs the secret: set {SECRET_ENV} or put it in "
            f"{SECRET_FILE} (the seller provides it with the pack; "
            "see README 'Licence keys').")
    valid, tier, reason = verify_key(licence_key, secret)
    if not valid:
        raise ValueError(f"Invalid licence key: {reason}.")
    note = (f"Licence verified: {tier} plan caps unlocked"
            + (f" (overrides --plan {plan})" if tier != plan else "") + ".")
    return tier, note
