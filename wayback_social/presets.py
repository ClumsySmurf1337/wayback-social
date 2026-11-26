"""Market presets: who uses wayback-social, and what a good search
looks like for them.

A preset is a starting point, not a verdict. Every preset uses only
public Wayback CDX captures — no logins, no private messages, no
location tracking, no account access. Results prove a public post
existed at a captured time; they do not prove intent, identity, or
what happened off the public record.

Catfish / relationship presets carry an explicit ethics note in
their output: check your own safety first, use public information
only, and do not use results to harass, stalk, or confront someone
in a way that puts anyone at risk.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Preset:
    id: str
    name: str
    audience: str
    goal: str
    networks: list[str] = field(default_factory=list)
    fetch_text: bool = True
    formats: list[str] = field(default_factory=lambda: ["csv", "json", "html"])
    limit_per_network: int = 50
    checklist: list[str] = field(default_factory=list)
    ethics: str = ""


PRESETS: list[Preset] = [
    Preset("catfish", "Catfish check", "Dating / online safety",
           "Is this profile real, reused, or stolen? Check the handle, "
           "photos and name across networks and over time.",
           networks=["x", "instagram", "facebook", "tiktok", "threads",
                     "reddit", "pinterest", "tumblr"],
           checklist=[
               "Same handle on how many networks? A real person usually reuses one handle; a stolen profile often appears on only one.",
               "Oldest capture date — a profile created last week claiming a 5-year history is a red flag.",
               "Do the archived posts match the story (same city, job, photos over time)?",
               "Reverse-image check the profile photo separately (Google Lens / TinEye) — Wayback has no image search.",
               "Never send money, gift cards, or ID to someone you met online, however real they look.",
           ],
           ethics="Public archived posts only. A match does not prove the person messaging you is that person — stolen photos are the classic catfish move."),
    Preset("relationship", "Relationship trust check",
           "Someone worried about a partner's public activity",
           "What has this person posted publicly, under this handle, over time?",
           networks=["x", "instagram", "facebook", "tiktok", "threads", "reddit"],
           checklist=[
               "Search the handle you already know — do not guess passwords or access accounts.",
               "Look at dates: a sudden new handle or deleted history is information, not proof of anything.",
               "Compare what was posted publicly with what was said privately — and talk to the person before concluding anything.",
               "If you feel unsafe, contact a local domestic-abuse / relationship helpline first; an archive search is not safety planning.",
           ],
           ethics="Public posts only, no DMs, no location, no account access. This tool cannot read private messages and must never be used to stalk, harass, or secretly monitor someone."),
    Preset("brand", "Brand monitoring", "Marketers / founders",
           "Where has our brand / handle appeared, and what got deleted?",
           networks=["x", "instagram", "facebook", "tiktok", "youtube",
                     "reddit", "threads", "bluesky"],
           checklist=["Track handle + brand keywords over time.",
                      "Export HTML reports for stakeholders.",
                      "Watch for impersonator handles with similar names."]),
    Preset("hiring", "Hiring screen", "Recruiters / HR",
           "Public professional history for a candidate, with consent.",
           networks=["linkedin", "x", "reddit", "medium", "youtube"],
           checklist=["Use public posts only, and only with the candidate's knowledge where your policy requires it.",
                      "Do not use protected characteristics (age, health, religion, etc.) found in archives.",
                      "Keep a dated export as your audit trail."]),
    Preset("legal", "Evidence preservation", "Lawyers / investigators",
           "Preserve a dated, citable record of a public post before it is deleted.",
           networks=["x", "facebook", "instagram", "tiktok", "youtube", "reddit"],
           formats=["csv", "json", "jsonl", "html"],
           checklist=["Save the archived snapshot URL + timestamp + digest for every capture.",
                      "Export JSONL as the machine-readable exhibit; HTML as the readable one.",
                      "Verify the snapshot yourself at web.archive.org before relying on it in a filing."]),
    Preset("journalist", "Journalist / OSINT", "Reporters / researchers",
           "Verify a claim, find deleted posts, trace a handle across networks.",
           networks=["x", "instagram", "facebook", "tiktok", "youtube",
                     "reddit", "threads", "bluesky", "mastodon", "tumblr"],
           checklist=["Cross-check every archived post against a second source.",
                      "Note the capture date — an archive proves the post existed then, not when it was written.",
                      "Keep the CDX digest; it is your chain of custody."]),
    Preset("researcher", "Researcher", "Academics / analysts",
           "A complete, reproducible archive pull for a handle or topic.",
           networks=["x", "reddit", "bluesky", "mastodon", "youtube"],
           formats=["csv", "json", "jsonl", "html"],
           checklist=["Use --resumption-key paging for large pulls; record the key.",
                      "Publish the query (network, handle, date range, limit) with your results."]),
]

_BY_ID = {p.id: p for p in PRESETS}


def get_preset(name: str) -> Preset | None:
    return _BY_ID.get(name.strip().lower().replace(" ", "_"))


def list_presets() -> list[Preset]:
    return list(PRESETS)
