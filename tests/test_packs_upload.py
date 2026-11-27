"""Pytest wrapper for the R2 presigned-upload Node suite.

Runs `node functions/api/packs-upload.test.mjs` (14 tests: DP2 licence
verification, DP1 rejection, size/sha validation, free-vs-paid prefix
+ retention, fail-closed 503 without R2 credentials, and a SigV4
signature that verifies against an independent recomputation).
The suite needs no secrets, D1, or network — it mints throwaway
Ed25519 keys at runtime and only verifies the presigned URL, never
fetches it.
"""
import os
import subprocess

NODE_SUITE = os.path.join(
    os.path.dirname(__file__), "..", "functions", "api", "packs-upload.test.mjs")


def test_node_packs_upload_suite_passes():
    result = subprocess.run(
        ["node", NODE_SUITE], capture_output=True, text=True, timeout=120)
    assert result.returncode == 0, result.stdout + result.stderr
    assert "fail 0" in result.stdout
