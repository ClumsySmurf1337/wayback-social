"""Pytest wrapper for the Paddle webhook Node suite + Python cross-check.

Runs `node --test tests/test_paddle_webhook.mjs` (10 tests: signature
verification, mint + D1 + Resend, idempotency, licence-email content
+ missing-key + Resend-failure handling, price mapping, refund
revocation, licence-check, web DP2 verification) and then verifies
the key the Node harness minted with the pure-Python Ed25519 code in
wayback_social/licence2.py — proving a key minted by the server-side
Node code verifies in the CLI's stdlib-only verifier.
"""
import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest

from wayback_social import licence2

NODE_SUITE = os.path.join(os.path.dirname(__file__), "test_paddle_webhook.mjs")
E2E_JSON = "/tmp/paddle_webhook_e2e.json"


def test_node_webhook_suite_passes():
    result = subprocess.run(
        ["node", "--test", NODE_SUITE],
        capture_output=True, text=True, timeout=120)
    assert result.returncode == 0, result.stdout + result.stderr
    # Count-agnostic: the suite grows as the email track adds cases;
    # what matters is zero failures (returncode already proves that).
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
