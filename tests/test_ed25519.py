"""Tests for wayback_social/ed25519.py — RFC 8032 vectors + round trips.

The vectors below are RFC 8032 §7.1 tests 1 and 2 (seed, public key,
message, signature). They were cross-checked against Node's crypto
(2026-11-26) before being written here.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from wayback_social import ed25519

VECTORS = [
    {
        "seed": "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60",
        "pub": "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a",
        "msg": "",
        "sig": ("e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e06522490155"
                "5fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b"),
    },
    {
        "seed": "4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb",
        "pub": "3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c",
        "msg": "72",
        "sig": ("92a009a9f0d4cab8720e820b5f642540a2b27b5416503f8fb3762223ebdb69da08"
                "5ac1e43e15996e458f3613d0f11d8c387b2eaeb4302aeeb00d291612bb0c00"),
    },
]


def test_publickey_matches_rfc8032():
    for v in VECTORS:
        assert ed25519.publickey_from_seed(bytes.fromhex(v["seed"])).hex() == v["pub"]


def test_verify_rfc8032_signatures():
    for v in VECTORS:
        assert ed25519.verify(bytes.fromhex(v["msg"]), bytes.fromhex(v["sig"]),
                              bytes.fromhex(v["pub"]))


def test_sign_matches_rfc8032():
    for v in VECTORS:
        sig = ed25519.sign(bytes.fromhex(v["msg"]), bytes.fromhex(v["seed"]),
                           bytes.fromhex(v["pub"]))
        assert sig.hex() == v["sig"]


def test_verify_rejects_tampered_message_and_signature():
    v = VECTORS[0]
    msg, sig, pub = (bytes.fromhex(v["msg"]), bytes.fromhex(v["sig"]),
                     bytes.fromhex(v["pub"]))
    assert not ed25519.verify(b"x", sig, pub)
    bad = bytearray(sig)
    bad[0] ^= 1
    assert not ed25519.verify(msg, bytes(bad), pub)
    bad_pub = bytearray(pub)
    bad_pub[0] ^= 1
    assert not ed25519.verify(msg, sig, bytes(bad_pub))


def test_verify_rejects_wrong_lengths_and_off_curve_points():
    v = VECTORS[0]
    assert not ed25519.verify(b"", b"short", bytes.fromhex(v["pub"]))
    assert not ed25519.verify(b"", bytes.fromhex(v["sig"]), b"short")
    # All-zero public key decodes to an off-curve point.
    assert not ed25519.verify(b"", bytes.fromhex(v["sig"]), bytes(32))


def test_round_trip_random_seed():
    seed = os.urandom(32)
    pub = ed25519.publickey_from_seed(seed)
    msg = b"DP2:PRO:ABCDEFGHIJKLMNOP"
    sig = ed25519.sign(msg, seed, pub)
    assert ed25519.verify(msg, sig, pub)
    assert not ed25519.verify(msg + b"!", sig, pub)
