# Contributing to wayback-social

## Setup

```bash
python -m venv .venv && source .venv/bin/activate
pip install -e . pytest
python -m pytest tests/ -q
```

## Adding a network

1. Add one entry to `wayback_social/networks.py`: CDX `url` patterns
   for the handle, a `post_id` regex, an oEmbed template if one exists,
   and an honest `coverage` note.
2. Add a smoke test in `tests/` — offline only (no live CDX in CI,
   archive.org is too slow/flaky). Live checks are manual; see README.
3. Keep files small (~300 lines max, one job per file), matching the
   project rule. No new dependency without a reason in the PR.

## Adding a field

Add it to `FIELD_OPTIONS` in `wayback_social/parse.py`, populate it in
`PostsParser._process` / `_enrich`, and update the README field list.
Field names stay in the waybacktweets style: `archived_*`, `parsed_*`,
`available_*`.

## Releases / pricing

Pricing lives in one place: `web/config.js` (`PRICING` + `CHECKOUT_LINKS`).
Change a price there and the web app + README pricing table must match.
Checkout links are Stripe Payment Links — never commit a live secret key.
