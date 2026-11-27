"""Pytest wrapper for the Stripe webhook Node suites + Python cross-check.

Runs `node --test functions/api/stripe-webhook.test.mjs` (9 tests:
signature verification, mint + D1 + Resend, line-items tier
fallback, idempotency, bundle/topup handling, failure paths,
email failure handling) and
`node --test functions/api/stripe-webhook-refunds.test.mjs`
(4 tests: refund + async-payment-failed revocation, migration
tolerance, licence-check), then verifies the key the Node harness
minted with the pure-Python Ed25519 code in
wayback_social/licence2.py — proving a key minted by the
server-side Node code verifies in the CLI's stdlib-only verifier.
"""
import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest

from wayback_social import licence2

NODE_SUITES = [
    os.path.join(os.path.dirname(__file__), "..", "functions", "api", "stripe-webhook.test.mjs"),
    os.path.join(os.path.dirname(__file__), "..", "functions", "api", "stripe-webhook-refunds.test.mjs"),
]
E2E_JSON = "/tmp/stripe_webhook_e2e.json"


def test_node_webhook_suites_pass():
    for suite in NODE_SUITES:
        result = subprocess.run(
            ["node", "--test", suite],
            capture_output=True, text=True, timeout=120)
        assert result.returncode == 0, result.stdout + result.stderr
        # Count-agnostic: the suites grow as cases are added; what
        # matters is zero failures (returncode already proves that).
        assert "fail 0" in result.stdout


def test_node_minted_key_verifies_in_python():
    assert os.path.exists(E2E_JSON), "node suite must run first (it writes the artefact)"
    data = json.load(open(E2E_JSON))
    key = data["key"]
    public_key = licence2.public_key_bytes(data["public_key_spki_b64"])
    valid, tier, reason = licence2.verify_key(key, public_key)
    assert valid, reason
    assert tier == "pro"
    assert licence2.parse_key(key)["tier"] == "pro"
