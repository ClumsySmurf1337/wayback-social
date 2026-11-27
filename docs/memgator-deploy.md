# MemGator deployment (wayback-social)

Self-hosted [MemGator](https://github.com/oduwsdl/MemGator) 1.0-rc9
(Memento TimeMap aggregator, Go, MIT) on this VM, exposed publicly via a
Cloudflare Tunnel. It replaces the dead public Memento aggregator
(timetravel.mementoweb.org, verified dead 2026-11-26).

## Public URL

**https://memgator.northforgelabs.dev**

- `GET /about` — server banner (MemGator 1.0-rc9).
- `GET /timemap/json/<url>` — TimeMap for a URL, e.g.
  `/timemap/json/https://twitter.com/jack/status/20` (real mementos
  from 2008 onward, verified live).
- Tunnel: Cloudflare account `9ea150e75aa3812cbaea8ae80bfe2f8d`,
  tunnel `memgator` (`47369996-b86e-48e5-a316-ea8c3404d7f2`), DNS CNAME
  `memgator.northforgelabs.dev` → `<tunnel-id>.cfargotunnel.com`
  (record id `a226d28d2dcb1fb47c42613201924226`, proxied). Ingress:
  `memgator.northforgelabs.dev` → `http://127.0.0.1:1208`, else
  `http_status:404`. Remote-managed (`config_src: cloudflare`).

## Layout (`ops/memgator/`)

| File | What it is |
|---|---|
| `memgator` / `cloudflared` | Binaries — built/downloaded on the VM, **never committed** (gitignored). |
| `memgator-proxy.patch` | One-line patch vs stock 1.0-rc9: `Proxy: http.ProxyFromEnvironment` in `initNetwork()` (`main.go:891`). Stock MemGator ignores the VM egress proxy otherwise and cannot reach any archive. |
| `archives.json` | Trimmed 10-archive list MemGator queries. |
| `start.sh` / `dns.sh` / `dns-bridge.sh` / `relay.sh` / `tunnel.sh` | Per-component start/stop/restart/status (PID files alongside). |
| `stack.sh` | Start/stop/status the whole stack in order. |
| `dns-forwarder.py` | TCP DNS forwarder: raw DNS → DoH (`cloudflare-dns.com`) over HTTPS. Stdlib only. |
| `edge-relay.py` | TCP relay: `127.0.0.1:7844` → `CONNECT region1:7844` via the egress proxy. |
| `resolv.conf` / `hosts` | Bind-mounted into cloudflared's mount namespace (see below). |
| `tunnel-token` | Tunnel token, mode 0600, gitignored. **Never** in the repo, chat, or a command-line flag — passed via `TUNNEL_TOKEN` env only. |
| `healthcheck.sh` | Restart-only-when-down checker (see below). |
| `memgator-stack.service`, `memgator-healthcheck.{service,timer}` | systemd units (durable copies). |
| `install-systemd.sh` | Copies units to `/etc/systemd/system/`, enables stack + timer. |

## Build (rebuilding the binary)

```sh
git clone https://github.com/oduwsdl/MemGator   # tag v1.0-rc9
cd MemGator
git apply /path/to/ops/memgator/memgator-proxy.patch
go build -o ops/memgator/memgator .
```

`cloudflared` 2026.11.2 is the standalone binary from Cloudflare
(downloaded, not built). Neither binary is committed — rebuild on the VM.

## Why the stack is this complicated (VM networking)

The VM's egress is locked down in three ways, each forcing one component:

1. **DNS resolver is a sinkhole.** It answers every query with a
   `198.18.x.x` address (or an empty answer), and direct UDP/53 to
   1.1.1.1 is intercepted the same way. cloudflared cannot resolve the
   `_v2-origintunneld._tcp.argotunnel.com` SRV records it needs for edge
   discovery. Fix: `dns-forwarder.py` (DoH over HTTPS, which works
   because port 443 goes through transparently) + a `socat` bridge
   (`dns-bridge.sh`) that turns it into a real DNS server on UDP
   `127.0.0.1:53` — the bridge is needed because this sandbox blocks
   UDP `sendto()` for Python/Node processes (EPERM) while `socat` can
   send UDP. cloudflared ignores `--dns-resolver-addrs` for edge
   discovery, so `tunnel.sh` runs it inside a mount namespace
   (`unshare --mount`) with a bind-mounted `resolv.conf` pointing at
   `127.0.0.1`.
2. **UDP egress is blocked** (`sendmsg: operation not permitted`), so
   QUIC is dead. cloudflared runs with `--protocol http2`.
3. **Direct TCP/7844 to the edge is intercepted** by a transparent
   proxy that answers non-TLS bytes (TLS handshake fails), and
   cloudflared ignores `HTTPS_PROXY` for its edge connection (verified:
   zero CONNECT attempts to a local fake proxy). The egress proxy DOES
   allow `CONNECT region1.v2.argotunnel.com:7844` — but see the blocker
   below. Fix: `edge-relay.py` listens on `127.0.0.1:7844`; a
   bind-mounted `hosts` maps `region1/region2.v2.argotunnel.com` to
   `127.0.0.1`, so every edge dial lands on the relay, which CONNECTs
   to region1 through the explicit proxy (auth from `HTTPS_PROXY` env).

## Restart policy: only when needed (John's call, 2026-11-26)

No blind periodic restarts. `healthcheck.sh` runs every 15 minutes
(systemd timer `memgator-healthcheck.timer`, plus any agent cron) and
restarts a component **only** when its probe fails:

- memgator `/about` fails → restart memgator immediately.
- TimeMap probe fails → restart only on **two consecutive failures**
  (one failure is usually archive.org flakiness — see below).
- Local DNS bridge `dig` SRV fails → restart forwarder + bridge.
- Edge relay TCP `:7844` refuses → restart relay (only when proxy
  credentials are available in the run's env — see caveat).
- cloudflared dead, or public URL fails while local memgator is fine →
  restart tunnel (+ relay). At most one tunnel restart per run.

**Cost: $0.** The VM is already running and Cloudflare Tunnel is free
on the Free plan — there is no per-call or per-restart billing. The
"only when needed" rule is about not churning a healthy daemon and not
burning the 100k req/day Workers wall with pointless probes: a check
run makes ~5 tiny requests (~500/day), not a full aggregation.

## Credential-rotation caveat

The egress proxy credentials rotate (roughly per exec call / session).
The edge relay reads `HTTPS_PROXY` **at startup**; when the
credentials expire, its CONNECTs start failing while the relay process
itself stays alive (a TCP probe to `:7844` still succeeds). The
healthcheck detects this indirectly — public URL down while local
memgator is up — and restarts the relay, but the restart only helps if
the healthcheck run itself has fresh credentials. Runs from the
systemd timer have **no** proxy credentials, so a relay restart there
is deferred and logged; recovery then waits for the next agent-run
(exec / agent cron) with fresh env. **The durable schedule is therefore
the agent's own 15-minute cron calling `healthcheck.sh`**; the systemd
timer is a best-effort fallback that keeps the credential-free
components (memgator, DNS bridge, cloudflared process) healthy.

## VM-restart / service-restart behavior

- A service restart kills all five daemons (observed 2026-11-26).
  The systemd `memgator-stack.service` restarts the stack on boot;
  the 15-minute health check restarts anything still down.
- `/etc` is ephemeral across VM replacement: the unit files in
  `ops/memgator/` are the durable copies — re-run
  `./install-systemd.sh` after a rebuild. The tunnel, DNS record,
  and token survive (they live in Cloudflare + `tunnel-token`, not
  in `/etc`), so no Cloudflare re-setup is needed.
- If the tunnel token is ever exposed (it was once passed as a
  command-line flag during testing — VM-local only, never left the
  machine), rotate it: delete and recreate the `memgator` tunnel via
  the API, update the DNS CNAME + ingress config, and rewrite
  `ops/memgator/tunnel-token` (0600).

## Health check

```sh
./stack.sh status                                   # all five components
curl -s http://127.0.0.1:1208/about | head -3       # MemGator banner
curl -s "http://127.0.0.1:1208/timemap/json/https://twitter.com/jack/status/20" | head -c 200
curl -s -o /dev/null -w "%{http_code}\n" https://memgator.northforgelabs.dev/about   # 200 when the tunnel is up
dig @127.0.0.1 _v2-origintunneld._tcp.argotunnel.com SRV +short   # real SRV records via the bridge
```

## KillMode bug — FIXED 2026-11-27 06:26 UTC (Track L)

**Symptom:** from 2026-11-27 01:25 UTC onward the tunnel kept dying
and the 15-minute healthcheck could never revive it: every timer run
logged "cloudflared up (pid …)" and, ~5s later, "tunnel/public URL
still down", while `cloudflared.log` showed the tunnel registering
successfully ("Registered tunnel connection", atl06/lax08, http2)
and then "Initiating graceful shutdown due to signal terminated".
Local MemGator stayed up (200) the whole time; only the public URL
was 530.

**Root cause:** `memgator-healthcheck.service` is a oneshot without
`RemainAfterExit`, so when it exits systemd kills every process left
in its cgroup (default `KillMode=control-group`) — including the
cloudflared the run had just started. `tunnel.sh start()` backgrounds
cloudflared with plain `&` (no `nohup`/`setsid`), which does not
protect against a cgroup kill. The other daemons survive because they
are started by `memgator-stack.service` (`RemainAfterExit=yes`, stays
"active") or by agent exec runs outside systemd.

**Fix:** `KillMode=process` in `ops/memgator/memgator-healthcheck.service`
(the durable copy; reinstalled with `sudo ./install-systemd.sh`).
Only the main process (healthcheck.sh itself, already exiting) is
killed; a restarted cloudflared survives. **Proven live 06:26 UTC:**
tunnel stopped, `sudo systemctl start memgator-healthcheck.service`,
cloudflared (pid 35195) still running after the service exited and
public URL 200 at 06:26:32. Recovery that morning: `./stack.sh
restart` 06:25:26 UTC from an exec session (fresh proxy creds) —
local /about 200, TimeMap 200 (1,986 mementos for jack/status/20),
public URL 200 at 06:25:51. Tunnel token NOT rotated (needs John's
explicit call).

## Correct behaviors that look like bugs

- **404 / empty TimeMap is correct Memento behavior.** If no archive
  holds a capture of a URL, MemGator returns an empty memento list
  (or 404) — that means "no captures exist", not "MemGator is broken".
- **archive.org transient flakiness is not a MemGator defect.**
  CDX/Timemap queries to archive.org are slow (tens of seconds) and
  intermittently fail or return empty `[]` rows. A single failed
  TimeMap probe is treated as a flake by the health check; only two
  consecutive failures trigger a restart.
- **`Failed to initialize DNS local resolver / ParseAddr("")`** in
  `cloudflared.log` is a benign warning — resolution demonstrably
  works through the bridge (SRV + A resolve, tunnel dials the relay).
- **Precheck `hard_fail=true`** (UDP/TCP/API) at cloudflared startup
  is expected on this VM: direct UDP/TCP/API checks fail by design;
  the tunnel still connects via the relay + http2 when the proxy
  allows CONNECT :7844.
- **Healthcheck says "tunnel/public URL still down" right after
  starting the tunnel — usually just edge-propagation lag.** The
  post-start probe runs ~5s after cloudflared registers, before
  the Cloudflare edge routes the hostname (verified 2026-11-27
  06:26 UTC: "still down" at 06:26:20, public URL 200 at
  06:26:32). Judge by the NEXT healthcheck run ("all green") and
  the public URL, not by that one line.

## Current blocker — RESOLVED 2026-11-27 00:29 UTC

**Public URL is UP: https://memgator.northforgelabs.dev returns 200.**
Verified end to end at 00:29–00:30 UTC: `/about` returns the MemGator
banner; `/timemap/json/https://twitter.com/jack/status/20` returns
real mementos from 2008-11-03 onward; `wayback-social sources` shows
memgator **ok**; cloudflared log shows `Registered tunnel connection
connIndex=0 ... location=atl01 protocol=http2` and the correct ingress
(`memgator.northforgelabs.dev` → `http://127.0.0.1:1208`).

What unblocked it: the edge relay was restarted with fresh proxy
credentials (pid 11663, 00:26 UTC) and the tunnel was restarted once
(pid 13544, 00:29 UTC). The precheck then passed TCP connectivity
(`HTTP/2 connection successful`, region1 + region2, `hard_fail=false`).
The egress proxy's handling of `CONNECT :7844` is inconsistent
across sessions — verified `HTTP 200 Connection Established` + TLS ok
in some sessions, and hanging / `000` in others (three consecutive
curl failures in one session, while `CONNECT :443` works fine in the
same session). Note: a **direct** curl to `region1:7844` still returns
`000` in sessions where the proxy refuses it — that does not mean the
tunnel is down. The tunnel dials via the edge relay (bind-mounted
`hosts` → `127.0.0.1:7844` → CONNECT through the proxy with the
relay's startup credentials), which is the path that matters. Judge
the tunnel by the public URL and the cloudflared log, not by a direct
curl to the edge.

History: the tunnel first went down when a service/VM restart
(~23:02 UTC 2026-11-26) wiped `/etc`, killing the systemd timer +
units and all five daemons. The units were reinstalled
(`./install-systemd.sh`, timer firing again) and the stack restarted
from a session with fresh credentials — local MemGator back at
TimeMap 200 — but an approval timed out mid-restart and cloudflared
was terminated, leaving the public URL at 530 until this retry.

It can flap again: proxy credentials rotate per session, so the
relay's CONNECTs will eventually start failing while the relay
process itself stays alive. The health check retries the tunnel +
relay on every run; recovery then waits for a run with fresh
credentials (agent exec / agent cron — see the credential caveat
above). If it stays blocked for hours: run cloudflared on a host
with direct egress (e.g. John's Mac), or ask for the egress
allowlist to include `region1/region2.v2.argotunnel.com:7844`.

## Web app wiring

`wayback_social/archives.py::search_memgator()` defaults to
`https://memgator.northforgelabs.dev` when `MEMGATOR_URL` is unset.
For the Cloudflare Pages web app, set a Pages env var `MEMGATOR_URL`
to the same value (Production + Preview) — the default already covers
it, so the env var is only needed to point at a different instance.
