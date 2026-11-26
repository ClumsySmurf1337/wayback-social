"""Capped free tier + paid plans (v1.2).

The free tier is deliberately capped so it is useful but not a
replacement for the paid packs — and the caps are enforced in the
CLI, not just printed on the pricing page. Paid plans are one-time
licences; the plan is passed with --plan (default: free) and printed
in every run's output so the cap is never a surprise.

Caps are per single command run:
  free     25 captures / archive call, 3 networks per find,
           3 targets per batch, text fetch for 5 posts
  starter  250 captures, 7 networks, 10 targets, 100 posts
  pro      2,500 captures, 14 networks, 50 targets, 1,000 posts
  studio   25,000 captures, 14 networks, 200 targets, 10,000 posts
"""
from __future__ import annotations

PLAN_IDS = ("free", "starter", "pro", "studio")

PLAN_CAPS = {
    "free":    {"archive_limit": 25,   "find_networks": 3,  "batch_targets": 3,   "fetch_text": 5},
    "starter": {"archive_limit": 250,  "find_networks": 7,  "batch_targets": 10,  "fetch_text": 100},
    "pro":     {"archive_limit": 2500, "find_networks": 14, "batch_targets": 50,  "fetch_text": 1000},
    "studio":  {"archive_limit": 25000, "find_networks": 14, "batch_targets": 200, "fetch_text": 10000},
}

PLAN_LABELS = {
    "free": "Free ($0)",
    "starter": "Starter ($9 one-time)",
    "pro": "Pro ($19 launch, reg. $29 one-time)",
    "studio": "Studio ($49 launch, reg. $99 one-time)",
}


def get_caps(plan: str) -> dict:
    return dict(PLAN_CAPS[plan])


def cap_limit(plan: str, requested: int | None) -> tuple[int, bool]:
    """Clamp a --limit to the plan cap. Returns (effective, was_clamped)."""
    cap = PLAN_CAPS[plan]["archive_limit"]
    if requested is None:
        return cap, True
    return (min(requested, cap), requested > cap)


def cap_find_networks(plan: str, count: int) -> tuple[int, bool]:
    cap = PLAN_CAPS[plan]["find_networks"]
    return (min(count, cap), count > cap)


def cap_batch_targets(plan: str, count: int) -> tuple[int, bool]:
    cap = PLAN_CAPS[plan]["batch_targets"]
    return (min(count, cap), count > cap)


def fetch_text_cap(plan: str) -> int:
    return PLAN_CAPS[plan]["fetch_text"]


def plan_note(plan: str) -> str:
    caps = PLAN_CAPS[plan]
    return (f"Plan: {PLAN_LABELS[plan]} — caps: {caps['archive_limit']} captures/archive, "
            f"{caps['find_networks']} networks/find, {caps['batch_targets']} targets/batch, "
            f"text fetch for {caps['fetch_text']} posts. "
            f"Upgrade: wayback-social --plan pro (one-time pack).")
