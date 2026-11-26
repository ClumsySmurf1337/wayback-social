"""Sync pricing.yaml into plans.py + web/config.js (v1.3).

pricing.yaml is the single source of truth. Regenerates plans.py
(caps, features, labels) and config.js (PRICING, FEATURE_CHART, fee
math). Usage: `python scripts/sync_pricing.py` to rewrite,
`--check` to exit 1 on drift. Stdlib only; YAML parsing is in
yaml_subset.py (same directory).
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

from yaml_subset import parse_yaml_subset

ROOT = Path(__file__).resolve().parent.parent
PRICING_YAML = ROOT / "pricing.yaml"
PLANS_PY = ROOT / "wayback_social" / "plans.py"
CONFIG_JS = ROOT / "web" / "config.js"

TIER_ORDER = ("free", "starter", "pro", "studio", "bundle")
CLI_PLANS = ("free", "starter", "pro", "studio")
CAP_KEYS = ("archive_limit", "find_networks", "batch_targets",
            "fetch_text", "evidence_reports", "seats")


def load_pricing(path: Path = PRICING_YAML) -> dict:
    data = parse_yaml_subset(path.read_text(encoding="utf-8"))
    for section in ("launch", "fees", "tiers"):
        if section not in data:
            raise ValueError(f"pricing.yaml missing section: {section}")
    for tier in TIER_ORDER:
        if tier not in data["tiers"]:
            raise ValueError(f"pricing.yaml missing tier: {tier}")
        for cap in CAP_KEYS:
            if cap not in data["tiers"][tier]["caps"]:
                raise ValueError(f"pricing.yaml tier {tier} missing cap {cap}")
    tiers = data["tiers"]
    bundle_regular = (tiers["starter"]["regular"] + tiers["pro"]["regular"]
                      + tiers["studio"]["regular"])
    if tiers["bundle"]["regular"] != bundle_regular:
        raise ValueError(
            f"Bundle regular ${tiers['bundle']['regular']} != sum of "
            f"regulars ${bundle_regular} — fix pricing.yaml.")
    return data


# --- derived values --------------------------------------------------------

def net_kept(price: float, percent: float, fixed: float) -> float:
    """Net kept after the fee, exact to the cent (ROUND_HALF_UP).
    Float round() gets 15*0.971-0.30 wrong ($14.26 not $14.27); Decimal
    does not, because 14.265 is stored as 14.264999... in binary."""
    from decimal import ROUND_HALF_UP, Decimal
    net = (Decimal(str(price)) * (Decimal("1") - Decimal(str(percent)))
           - Decimal(str(fixed)))
    return float(net.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def fmt_money(value) -> str:
    return f"${value:g}" if isinstance(value, (int, float)) else str(value)


def fmt_num(value: int) -> str:
    return f"{value:,}"


def bundle_discount_pct(data: dict) -> int:
    b = data["tiers"]["bundle"]
    return round((b["regular"] - b["launch"]) / b["regular"] * 100)


def tier_features(data: dict, tier: str) -> list[str]:
    """Human-readable feature bullets for the pricing cards."""
    t = data["tiers"][tier]
    caps, feats = t["caps"], t["features"]
    out = [f"{fmt_num(caps['archive_limit'])} captures per search"]
    out.append("All 14 networks" if caps["find_networks"] == 14
               else f"{caps['find_networks']} networks per broad search")
    out.append(f"{caps['batch_targets']} targets per batch")
    out.append(f"Text fetch for {fmt_num(caps['fetch_text'])} posts")
    exports = [e.upper() for e in feats["exports"]]
    out.append(" + ".join(exports) + " export")
    if feats["deleted_diff"]:
        out.append("Deleted-only diff + live check")
    if feats["keyword_search"]:
        out.append("Keyword search over fetched text")
    if feats["evidence_pack"]:
        out.append(f"{caps['evidence_reports']} evidence-pack reports included")
    if caps["seats"] > 1:
        out.append(f"{caps['seats']} seats")
    if feats["commercial_use"]:
        out.append("Commercial use licence")
    if tier == "bundle":
        out.insert(0, "Everything in Starter + Pro + Studio")
        out.append(f"Best value — {bundle_discount_pct(data)}% off the "
                   f"{fmt_money(t['regular'])} regular total")
    return out


def build_chart(data: dict) -> list[dict]:
    """Feature-comparison rows; values come from the same caps/features."""
    tiers = data["tiers"]
    cap = lambda t, k: tiers[t]["caps"][k]  # noqa: E731
    feat = lambda t, k: tiers[t]["features"][k]  # noqa: E731
    check = lambda b: "✓" if b else "—"  # noqa: E731
    num = lambda t, k: fmt_num(cap(t, k))  # noqa: E731
    nets = lambda t: ("All 14" if cap(t, "find_networks") == 14  # noqa: E731
                      else str(cap(t, "find_networks")))
    exps = lambda t: " + ".join(e.upper() for e in feat(t, "exports"))  # noqa: E731
    reps = lambda t: (str(cap(t, "evidence_reports"))  # noqa: E731
                      if cap(t, "evidence_reports") else "—")
    rows = [
        ("Captures per search", {t: num(t, "archive_limit") for t in TIER_ORDER}),
        ("Networks per broad search (find)", {t: nets(t) for t in TIER_ORDER}),
        ("Batch targets per run", {t: num(t, "batch_targets") for t in TIER_ORDER}),
        ("Replay-text fetches per search", {t: num(t, "fetch_text") for t in TIER_ORDER}),
        ("Exports", {t: exps(t) for t in TIER_ORDER}),
        ("Deleted-only diff", {t: check(feat(t, "deleted_diff")) for t in TIER_ORDER}),
        ("Replay text fetch", {t: check(feat(t, "replay_text")) for t in TIER_ORDER}),
        ("archive.today / Ghostarchive fallback links", {t: check(feat(t, "archive_fallbacks")) for t in TIER_ORDER}),
        ("Keyword search (over fetched text)", {t: check(feat(t, "keyword_search")) for t in TIER_ORDER}),
        ("Evidence-pack reports included", {t: reps(t) for t in TIER_ORDER}),
        ("Seats", {t: str(cap(t, "seats")) for t in TIER_ORDER}),
        ("Commercial use", {t: check(feat(t, "commercial_use")) for t in TIER_ORDER}),
        ("Support", {t: feat(t, "support") for t in TIER_ORDER}),
    ]
    return [{"label": label, "values": values} for label, values in rows]


def _js_str(value: str) -> str:
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def gen_plans_block(data: dict) -> str:
    tiers = data["tiers"]
    lines = ["# __GENERATED_BEGIN__ — from pricing.yaml via "
             "scripts/sync_pricing.py. DO NOT EDIT BY HAND.",
             f"LAUNCH_NOTE = {data['launch']['note']!r}",
             f"TOPUP = {{'price': {data['launch']['topup_price']}, "
             f"'credits': {data['launch']['topup_credits']}}}",
             f"PLAN_IDS = {CLI_PLANS!r}",
             "PLAN_CAPS = {"]
    for t in CLI_PLANS:
        caps = tiers[t]["caps"]
        inner = ", ".join(f"{k!r}: {caps[k]}" for k in CAP_KEYS)
        lines.append(f"    {t!r}: {{{inner}}},")
    lines.append("}")
    caps = tiers["bundle"]["caps"]
    inner = ", ".join(f"{k!r}: {caps[k]}" for k in CAP_KEYS)
    lines.append(f"BUNDLE_CAPS = {{{inner}}}  # bundle buys all packs: Studio-level caps")
    lines.append("PLAN_LABELS = {")
    for t in CLI_PLANS:
        tier = tiers[t]
        if tier["launch"] == tier["regular"]:
            label = f"{tier['name']} (${tier['launch']} one-time)"
        else:
            label = (f"{tier['name']} (${tier['launch']} launch, "
                     f"reg. ${tier['regular']} one-time)")
        if t == "free":
            label = "Free ($0)"
        lines.append(f"    {t!r}: {label!r},")
    lines.append("}")
    lines.append("PLAN_FEATURES = {")
    for t in CLI_PLANS:
        feats = tiers[t]["features"]
        inner = ", ".join(f"{k!r}: {feats[k]!r}" for k in feats)
        lines.append(f"    {t!r}: {{{inner}}},")
    lines.append("}")
    feats = tiers["bundle"]["features"]
    inner = ", ".join(f"{k!r}: {feats[k]!r}" for k in feats)
    lines.append(f"BUNDLE_FEATURES = {{{inner}}}")
    lines.append("PLAN_EXPORTS = {")
    for t in CLI_PLANS:
        lines.append(f"    {t!r}: {tiers[t]['features']['exports']!r},")
    lines.append("}")
    lines.append("# __GENERATED_END__")
    return "\n".join(lines) + "\n"


def gen_config_block(data: dict) -> str:
    tiers, fees = data["tiers"], data["fees"]
    lines = ["  // __PRICING_BEGIN__ — generated from pricing.yaml by "
             "scripts/sync_pricing.py. DO NOT EDIT BY HAND.",
             f"  LAUNCH_NOTE: {_js_str(data['launch']['note'])},",
             f"  TOPUP: {{ price: {data['launch']['topup_price']}, "
             f"credits: {data['launch']['topup_credits']} }},",
             "  // Net kept (fee math — generated; Paddle 5%+50c, Stripe 2.9%+30c):"]
    for t in ("starter", "pro", "studio", "bundle"):
        tier = tiers[t]
        for when in ("launch", "regular"):
            price = tier[when]
            lines.append(
                f"  //   {tier['name']} ${price} {when}: Paddle keeps "
                f"${net_kept(price, fees['paddle']['percent'], fees['paddle']['fixed']):.2f} "
                f"| Stripe keeps "
                f"${net_kept(price, fees['stripe']['percent'], fees['stripe']['fixed']):.2f}")
    topup = data["launch"]["topup_price"]
    lines.append(
        f"  //   Top-up ${topup}: Paddle keeps "
        f"${net_kept(topup, fees['paddle']['percent'], fees['paddle']['fixed']):.2f} "
        f"| Stripe keeps "
        f"${net_kept(topup, fees['stripe']['percent'], fees['stripe']['fixed']):.2f}")
    lines.append(
        f"  // Bundle math: regular total = Starter ${tiers['starter']['regular']} "
        f"+ Pro ${tiers['pro']['regular']} + Studio ${tiers['studio']['regular']} "
        f"= ${tiers['bundle']['regular']}; launch bundle "
        f"${tiers['bundle']['launch']} is {bundle_discount_pct(data)}% off.")
    lines.append("  PRICING: [")
    entries = list(TIER_ORDER) + ["topup"]
    for t in entries:
        if t == "topup":
            lines.append(
                "    {\n"
                f"      id: \"topup\", name: \"Text-fetch top-up\", price: "
                f"\"${topup}\", cadence: \"500 credits\",\n"
                "      blurb: \"Add 500 replay-text fetches to any paid pack. "
                "Credits never expire.\",\n"
                "      features: [\"500 text-fetch credits\", "
                "\"Works with Starter, Pro and Studio\", \"Never expires\"],\n"
                "      cta: \"Buy 500 credits — $15\", checkout: \"topup\", "
                "featured: false,\n    },")
            continue
        tier = tiers[t]
        feats = tier_features(data, t)
        feats_js = ", ".join(_js_str(f) for f in feats)
        regular = (f", regular: {_js_str(fmt_money(tier['regular']))}"
                   if tier["regular"] != tier["launch"] else "")
        checkout = _js_str(tier["checkout"]) if tier["checkout"] else "null"
        entry = ("    {\n"
                 f"      id: {_js_str(t)}, name: {_js_str(tier['name'])}, "
                 f"price: {_js_str(fmt_money(tier['launch']))}{regular}, "
                 f"cadence: {_js_str(tier['cadence'])},\n"
                 f"      blurb: {_js_str(tier['blurb'])},\n"
                 f"      features: [{feats_js}],\n"
                 f"      cta: {_js_str(tier['cta'])}, checkout: {checkout}, "
                 f"featured: {str(tier['featured']).lower()},\n"
                 "    },")
        lines.append(entry)
    lines.append("  ],")
    lines.append("  FEATURE_CHART: [")
    for row in build_chart(data):
        vals = ", ".join(f"{t}: {_js_str(row['values'][t])}" for t in TIER_ORDER)
        lines.append(f"    {{label: {_js_str(row['label'])}, values: {{{vals}}}}},")
    lines.append("  ],")
    lines.append("  // __PRICING_END__")
    return "\n".join(lines) + "\n"


# --- file surgery ----------------------------------------------------------

def replace_block(path: Path, start: str, end: str, new: str) -> str:
    text = path.read_text(encoding="utf-8")
    # Anchor at the start of the marker line (including its indent) so
    # re-running never re-indents the block.
    pattern = re.compile(r"^[ \t]*" + re.escape(start) + r".*?"
                         + re.escape(end), re.DOTALL | re.MULTILINE)
    if not pattern.search(text):
        raise ValueError(f"Markers {start!r}..{end!r} not found in {path}")
    return pattern.sub(lambda _: new.rstrip("\n"), text)


def main(argv: list[str]) -> int:
    check_only = "--check" in argv
    try:
        data = load_pricing()
    except ValueError as e:
        print(f"pricing.yaml error: {e}", file=sys.stderr)
        return 2
    plans_new = replace_block(
        PLANS_PY, "# __GENERATED_BEGIN__", "# __GENERATED_END__",
        gen_plans_block(data))
    config_new = replace_block(
        CONFIG_JS, "// __PRICING_BEGIN__", "// __PRICING_END__",
        gen_config_block(data))
    if check_only:
        ok = True
        if plans_new != PLANS_PY.read_text(encoding="utf-8"):
            print("DRIFT: wayback_social/plans.py differs from pricing.yaml — "
                  "run scripts/sync_pricing.py")
            ok = False
        if config_new != CONFIG_JS.read_text(encoding="utf-8"):
            print("DRIFT: web/config.js differs from pricing.yaml — "
                  "run scripts/sync_pricing.py")
            ok = False
        return 0 if ok else 1
    PLANS_PY.write_text(plans_new, encoding="utf-8")
    CONFIG_JS.write_text(config_new, encoding="utf-8")
    print("Synced pricing.yaml -> wayback_social/plans.py, web/config.js "
          f"(bundle: ${data['tiers']['bundle']['launch']} launch / "
          f"${data['tiers']['bundle']['regular']} regular, "
          f"{bundle_discount_pct(data)}% off)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
