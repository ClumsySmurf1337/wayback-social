"""Test-only CONNECT forwarder (localhost only, no TLS termination).

Why this exists: in this sandbox Chrome cannot open a CONNECT tunnel
through the egress proxy directly (ERR_TUNNEL_CONNECTION_FAILED for
every external site, while curl's identical CONNECT succeeds), and
this Chrome-for-Testing build rejects every public TLS root
(ERR_CERT_AUTHORITY_INVALID even for example.com). The forwarder
bridges the gap: Chrome talks to 127.0.0.1 (which it can reach),
Python does the CONNECT to the egress proxy with preemptive Basic
auth exactly like curl, then relays bytes untouched — TLS stays
end-to-end between Chrome and the real site, so the page tested is
the real live page. The live site's certificate is verified
independently (openssl: Let's Encrypt, verify return code 0); the
test browser ignores cert errors only because its own root store is
broken in this sandbox.

Credentials come from the https_proxy environment variable at
runtime and are never written to disk. Run: python3 fwdproxy.py
--port 3998. Kill it when the suite finishes (conftest does this).
"""
import argparse
import base64
import os
import socket
import threading
from urllib.parse import urlparse


def _upstream():
    u = urlparse(os.environ.get("https_proxy")
                 or os.environ.get("HTTPS_PROXY") or "")
    auth = ""
    if u.username:
        auth = base64.b64encode(
            f"{u.username}:{u.password or ''}".encode()).decode()
    return (u.hostname, u.port or 3128), auth


UPSTREAM, AUTH = _upstream()


def _pipe(a, b):
    try:
        while True:
            d = a.recv(65536)
            if not d:
                break
            b.sendall(d)
    except OSError:
        pass
    finally:
        try:
            b.shutdown(socket.SHUT_WR)
        except OSError:
            pass


def _handle(client):
    try:
        req = b""
        while b"\r\n\r\n" not in req:
            chunk = client.recv(4096)
            if not chunk:
                return
            req += chunk
        line, rest = req.split(b"\r\n", 1)
        method, target, _ = line.decode("latin1").split(" ", 2)
        up = socket.create_connection(UPSTREAM, timeout=20)
        if method == "CONNECT":
            up.sendall(
                f"CONNECT {target} HTTP/1.1\r\nHost: {target}\r\n"
                f"Proxy-Authorization: Basic {AUTH}\r\n"
                "Proxy-Connection: keep-alive\r\n\r\n".encode())
            resp = b""
            while b"\r\n\r\n" not in resp:
                chunk = up.recv(4096)
                if not chunk:
                    client.sendall(b"HTTP/1.1 502 Bad Gateway\r\n\r\n")
                    return
                resp += chunk
            if b" 200 " not in resp.split(b"\r\n", 1)[0]:
                client.sendall(b"HTTP/1.1 502 Bad Gateway\r\n\r\n")
                return
            client.sendall(b"HTTP/1.1 200 Connection Established\r\n\r\n")
        else:
            headers = rest.decode("latin1").replace(
                "\r\n\r\n", f"\r\nProxy-Authorization: Basic {AUTH}\r\n\r\n")
            up.sendall(line + b"\r\n" + headers.encode("latin1"))
        t = threading.Thread(target=_pipe, args=(client, up), daemon=True)
        t.start()
        _pipe(up, client)
        t.join(timeout=2)
    except Exception:
        pass
    finally:
        try:
            client.close()
        except OSError:
            pass


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=3998)
    args = ap.parse_args()
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(("127.0.0.1", args.port))
    srv.listen(50)
    print(f"fwdproxy listening on 127.0.0.1:{args.port}", flush=True)
    while True:
        c, _ = srv.accept()
        threading.Thread(target=_handle, args=(c,), daemon=True).start()


if __name__ == "__main__":
    main()
