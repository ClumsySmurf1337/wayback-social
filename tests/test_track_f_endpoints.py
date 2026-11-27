"""Pytest wrapper for the Track F endpoint Node suites.

Runs `node functions/api/evidence-usage.test.mjs` (18 tests: GET
server count + local-first fallback, POST one-report + idempotency,
used-up / non-Studio / revoked / no-row / unconfigured) and
`node functions/api/billing-portal.test.mjs` (13 tests: portal
session URL + exact Stripe request, no-customer 404, bad key 401,
live-key refusal, missing migration 0004) and asserts zero failures
in each. The suites themselves mint throwaway Ed25519 keypairs and
mock D1 + Stripe fetch — no secrets, no D1, no network.
"""
import os
import subprocess

ROOT = os.path.join(os.path.dirname(__file__), "..")

SUITES = [
    os.path.join(ROOT, "functions", "api", "evidence-usage.test.mjs"),
    os.path.join(ROOT, "functions", "api", "billing-portal.test.mjs"),
]


def test_track_f_node_suites_pass():
    for suite in SUITES:
        assert os.path.isfile(suite), f"{suite} missing"
        result = subprocess.run(
            ["node", suite],
            capture_output=True, text=True, timeout=120)
        assert result.returncode == 0, suite + "\n" + result.stdout + result.stderr
        assert "fail 0" in result.stdout, suite + "\n" + result.stdout
