"""Ed25519 signatures in pure Python (stdlib only) — RFC 8032.

Why this file exists: production licence keys (DP2) are Ed25519-signed
by the Cloudflare Pages Function, and the CLI must verify them with
zero new dependencies — the stdlib has no Ed25519. This is the
standard reference implementation (Daniel J. Bernstein et al.,
public-domain "ed25519.py"), with two additions: point-on-curve
validation in ``decodepoint`` (the original skips it) and a small
``sign`` used only by the tests (minting in production happens in
Node, see functions/_lib/dp2.js).

Speed: one verify is a few hundred 255-bit modular multiplications
in pure Python (~0.2s). Fine for a CLI that verifies one key per run.
Never use this to verify untrusted keys at scale — it is not
constant-time.
"""
from __future__ import annotations

import hashlib

b = 256
q = 2**255 - 19
L = 2**252 + 27742317777372353535851937790883648493
d = -121665 * pow(121666, q - 2, q) % q
I = pow(2, (q - 1) // 4, q)


def _H(data: bytes) -> bytes:
    return hashlib.sha512(data).digest()


def _inv(x: int) -> int:
    return pow(x, q - 2, q)


def _xrecover(y: int) -> int:
    xx = (y * y - 1) * _inv(d * y * y + 1) % q
    x = pow(xx, (q + 3) // 8, q)
    if (x * x - xx) % q != 0:
        x = (x * I) % q
    if x % 2 != 0:
        x = q - x
    return x


_By = 4 * _inv(5) % q
_Bx = _xrecover(_By)
B = [_Bx % q, _By % q]


def _edwards(P: list[int], Q: list[int]) -> list[int]:
    # Ed25519 is the a=-1 twisted Edwards curve, so the addition law is
    #   x3 = (x1*y2 + x2*y1) / (1 + d*x1*x2*y1*y2)
    #   y3 = (y1*y2 + x1*x2) / (1 - d*x1*x2*y1*y2)   <-- PLUS, because a=-1
    # The y3 numerator is the easy one to get wrong (minus is the a=+1
    # formula); the RFC 8032 vectors catch it immediately.
    x1, y1 = P
    x2, y2 = Q
    x3 = (x1 * y2 + x2 * y1) * _inv(1 + d * x1 * x2 * y1 * y2 % q) % q
    y3 = (y1 * y2 + x1 * x2) * _inv(1 - d * x1 * x2 * y1 * y2 % q) % q
    return [x3, y3]


def _scalarmult(P: list[int], e: int) -> list[int]:
    if e == 0:
        return [0, 1]
    Q = _scalarmult(P, e // 2)
    Q = _edwards(Q, Q)
    if e & 1:
        Q = _edwards(Q, P)
    return Q


def _bit(h: bytes, i: int) -> int:
    return (h[i // 8] >> (i % 8)) & 1


def encodepoint(P: list[int]) -> bytes:
    x, y = P
    bits = (y & ((1 << 255) - 1)) | ((x & 1) << 255)
    return bits.to_bytes(32, "little")


def decodepoint(s: bytes) -> list[int]:
    """Decode a 32-byte point; raises ValueError if off-curve."""
    if len(s) != 32:
        raise ValueError("point must be 32 bytes")
    y = int.from_bytes(s, "little") & ((1 << 255) - 1)
    x = _xrecover(y)
    if x & 1 != _bit(s, 255):
        x = q - x
    # Curve equation for a=-1: -x^2 + y^2 = 1 + d*x^2*y^2.
    if (y * y - x * x - 1 - d * x * x * y * y) % q != 0:
        raise ValueError("point is not on the Ed25519 curve")
    return [x, y]


def _hint(data: bytes) -> int:
    return int.from_bytes(_H(data), "little")


def publickey_from_seed(seed: bytes) -> bytes:
    """32-byte seed -> 32-byte public key (RFC 8032 key generation)."""
    if len(seed) != 32:
        raise ValueError("seed must be 32 bytes")
    h = _H(seed)
    a = 2**254 + sum(2**i * _bit(h, i) for i in range(3, 254))
    return encodepoint(_scalarmult(B, a))


def sign(message: bytes, seed: bytes, public_key: bytes) -> bytes:
    """Sign (test/dev use only — production mints in Node)."""
    h = _H(seed)
    a = 2**254 + sum(2**i * _bit(h, i) for i in range(3, 254))
    r = _hint(h[32:] + message)
    R = _scalarmult(B, r)
    S = (r + _hint(encodepoint(R) + public_key + message) * a) % L
    return encodepoint(R) + S.to_bytes(32, "little")


def verify(message: bytes, signature: bytes, public_key: bytes) -> bool:
    """True iff the 64-byte signature is valid for message + public key."""
    if len(signature) != 64 or len(public_key) != 32:
        return False
    try:
        R = decodepoint(signature[:32])
        A = decodepoint(public_key)
    except ValueError:
        return False
    S = int.from_bytes(signature[32:], "little")
    if S >= L:
        return False
    h = _hint(signature[:32] + public_key + message)
    return _scalarmult(B, S) == _edwards(R, _scalarmult(A, h))
