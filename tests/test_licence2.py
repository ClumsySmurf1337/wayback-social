"""Tests for wayback_social/licence2.py — DP2 (Ed25519) production keys."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest

from wayback_social import ed25519, licence, licence2

# A throwaway test seed (NOT the production keypair). Its public key
# is used to verify test-minted keys; the production public key in
# licence2.py is a different keypair.
TEST_SEED = bytes.fromhex(
    "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60")
TEST_PUB = ed25519.publickey_from_seed(TEST_SEED)


def test_make_and_verify_round_trip():
    key = licence2.make_key("pro", TEST_SEED)
    assert key.startswith("DP2-PRO-")
    valid, tier, reason = licence2.verify_key(key, TEST_PUB)
    assert (valid, tier) == (True, "pro")
    assert reason == "valid"


def test_verify_rejects_tampered_key():
    key = licence2.make_key("studio", TEST_SEED)
    parts = key.split("-")
    parts[2] = "AAAAAAAAAAAAAAAA"  # different random -> bad signature
    valid, tier, reason = licence2.verify_key("-".join(parts), TEST_PUB)
    assert valid is False and tier is None
    assert "signature" in reason


def test_verify_rejects_wrong_public_key():
    key = licence2.make_key("pro", TEST_SEED)
    other_pub = ed25519.publickey_from_seed(os.urandom(32))
    valid, _, _ = licence2.verify_key(key, other_pub)
    assert valid is False


def test_verify_rejects_malformed_keys():
    for bad in ["", "DP2-PRO-ABC", "DP1-PRO-ABCDEFGHIJKLMNOP-12345678",
                "DP2-UNKNOWN-ABCDEFGHIJKLMNOP-" + "A" * 88,
                "DP2-PRO-ABCDEFGHIJKLMNOP-" + "A" * 10]:
        valid, tier, _ = licence2.verify_key(bad, TEST_PUB)
        assert valid is False and tier is None


def test_make_key_rejects_unknown_tier_and_bad_seed():
    with pytest.raises(ValueError):
        licence2.make_key("platinum", TEST_SEED)
    with pytest.raises(ValueError):
        licence2.make_key("pro", b"short")


def test_production_public_key_is_a_real_ed25519_key():
    raw = licence2.public_key_bytes()
    assert len(raw) == 32
    # The baked-in production key must not be the test key.
    assert raw != TEST_PUB


def test_key_hash_and_prefix():
    key = licence2.make_key("starter", TEST_SEED)
    assert len(licence2.key_hash(key)) == 64
    assert licence2.key_prefix(key) == key[:24]
    assert licence2.key_hash(key) != licence2.key_hash(
        licence2.make_key("starter", TEST_SEED))


def test_resolve_plan_accepts_dp2_without_a_secret(monkeypatch):
    # resolve_plan must verify DP2 keys offline — no secret involved.
    # Point the module's public key at the test keypair for this test.
    monkeypatch.setattr(licence2, "PUBLIC_KEY_B64",
                        __import__("base64").b64encode(
                            b"\x30\x2a\x30\x05\x06\x03\x2b\x65\x70\x03\x21\x00" + TEST_PUB).decode())
    key = licence2.make_key("studio", TEST_SEED)
    plan, note = licence.resolve_plan("free", key, env={})
    assert plan == "studio"
    assert "offline check" in note


def test_resolve_plan_rejects_bad_dp1_instead_of_falling_through():
    # A malformed DP1 key must raise — never silently fall back to free.
    with pytest.raises(ValueError, match="Invalid licence key"):
        licence.resolve_plan(
            "free", "DP1-PRO-ABCDEFGHIJKLMNOP-00000000",
            env={"WAYBACK_SOCIAL_LICENCE_SECRET": "x"})
