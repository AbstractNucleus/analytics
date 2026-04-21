# Metrics Collection Architecture Reference

A detailed reference for designing a self-hosted analytics panel that aggregates metrics from one or more machines (starting with `bserver`) into a single central UI. Audience: a solo developer building a live dashboard at their own subdomain, expected fleet size 1 to ~10 hosts, geographically distributed, some behind NAT.

---

## 1. Collection Models

The first architectural decision is *who initiates the network connection*. Everything downstream is shaped by this choice.

### 1.1 Pull model (Prometheus-style)

The central server holds a list of targets and scrapes each one on a schedule (default 15s). Each target runs a small HTTP server that exposes `/metrics`.

```
+---------+       GET /metrics       +-----------+
| Panel   | -----------------------> | agent on  |
| (pull)  | <----------------------- | bserver   |
+---------+       text/plain         +-----------+
```

**Strengths** ([Prometheus docs on pushing](https://prometheus.io/docs/practices/pushing/)):
- Central config of scrape interval — change once, no redeploy of agents.
- Scrape failure is itself a signal ("target down"), no extra heartbeat required.
- Agents are stateless HTTP servers; if the collector dies, nothing is lost — spin up a new collector and metrics resume.
- Easy to debug: `curl http://host:9100/metrics` from anywhere on the network.

**Weaknesses**:
- Every agent must be reachable by the panel. That means a public IP, VPN, SSH tunnel, or reverse proxy for any host behind NAT.
- Service discovery is non-trivial when hosts come and go (needs file_sd, Consul, DNS-SD, etc.).

### 1.2 Push model (StatsD / Telegraf / OTLP-style)

Agents initiate outbound connections to the panel and send samples.

```
+----------+       POST /ingest      +---------+
| agent on | -----------------------> | Panel   |
| bserver  |                          | (push)  |
+----------+                          +---------+
```

**Strengths**:
- Traverses NAT and firewalls trivially — most home networks allow outbound 443. This is the dominant reason push is chosen for heterogeneous fleets ([SigNoz on Prometheus push vs pull](https://signoz.io/guides/is-prometheus-monitoring-push-or-pull/)).
- Works for ephemeral/serverless workloads that disappear before being scraped.
- Zero inbound firewall config on monitored hosts.

**Weaknesses**:
- The ingestion endpoint is a single point of failure. Agents must buffer locally during outages or drop data.
- No implicit "target down" signal — you need an explicit heartbeat/dead-man check.
- Ingest endpoint is a write amplification target that needs rate limiting and auth.

### 1.3 Hybrid models

Two established patterns bridge the two worlds:

- **Prometheus + PushProx** — agents dial out to a proxy; Prometheus scrapes *through* the proxy back down to agents. Preserves pull semantics while traversing NAT ([PushProx repo](https://github.com/prometheus-community/PushProx)).
- **Beszel dual-transport** — agent keeps an outbound WebSocket to the hub; if that drops, hub can also dial in over SSH on port 45876. One protocol per direction, auto-failover ([Beszel security guide](https://beszel.dev/guide/security)).
- **Prometheus Remote Write** — Prometheus-style server with push ingestion for cases where pull is impossible; used by VictoriaMetrics, Mimir, Thanos.

### 1.4 Verdict for a small, NAT-behind fleet

Push or pull-over-outbound-tunnel. A pure pull model is fine when every host is in a single VPC or on a mesh VPN (Tailscale, WireGuard, Nebula), but it becomes painful the moment a laptop on a coffee-shop Wi-Fi or a relative's home network needs to be monitored.

Recommendation: **push-based, with the agent opening a single outbound connection to the panel**. This is Beszel's default mode, OpenTelemetry's default, Grafana Cloud's default, and Netdata Parent streaming's default for a reason.

---

## 2. Agent Options

What actually runs on each monitored machine and sends stats back.

| Agent | Model | Binary size | RAM | Language | License | Out-of-box |
|---|---|---|---|---|---|---|
| Prometheus Node Exporter | pull | ~20 MB | ~15 MB | Go | Apache 2.0 | CPU, mem, disk, net, filesystems, systemd |
| Telegraf | push or pull | ~100 MB | 30-80 MB | Go | MIT | 300+ input plugins |
| Grafana Alloy | push (OTLP + remote-write) | ~150 MB | 50-150 MB | Go | Apache 2.0 | Replaces node_exporter, Promtail, OTel Collector |
| OpenTelemetry Collector | push (OTLP) | ~60-150 MB | 30-100 MB | Go | Apache 2.0 | Generic receivers; needs config for host metrics |
| Netdata agent | push (streaming) or local UI | ~30-50 MB | 150-200 MB full, <150 MB streaming-only | C | GPLv3 | 2000+ metrics auto-detected, per-second cadence |
| Beszel agent | push (WS) or SSH-accept | ~15-25 MB | ~10-30 MB | Go | MIT | CPU, mem, disk, net, temp, containers, GPU, SMART |
| collectd | push or write-plugins | ~2 MB | ~5-10 MB | C | MIT/GPLv2 | 100+ plugins, old but stable |
| Windows Exporter | pull | MSI installer | ~15-25 MB | Go | MIT | Perfmon counters, services, IIS, etc. |
| Custom Go/Rust agent | either | 2-10 MB | <10 MB | your choice | yours | only what you code |

### Key observations

- **Node Exporter** ([repo](https://github.com/prometheus-community/windows_exporter) for its Windows sibling) is the ubiquitous default in the Prometheus world. It's small, reliable, and does one thing. But it only exposes `/metrics` — you need Prometheus or a compatible scraper.
- **Telegraf** is the Swiss-army knife — its plugin ecosystem dwarfs everything else, and it can both scrape Prometheus exporters and push to Prometheus remote-write, InfluxDB, Kafka, etc. ([comparison](https://sourceforge.net/software/compare/Prometheus-vs-Telegraf/)). It's the pragmatic pick when you have a mix of OSes and data sources.
- **Grafana Alloy** explicitly "replaces Promtail, Grafana Agent, or node_exporter" and is the modern recommendation inside Grafana's stack ([Alloy docs](https://grafana.com/oss/alloy-opentelemetry-collector/)). It's a superset of the OTel Collector.
- **OTel Collector** is the vendor-neutral reference implementation. Use it if you want your instrumentation to be portable across future backends.
- **Netdata** is extraordinary out-of-box but heavy — 2000+ metrics at 1s cadence is a lot of data. The parent-child streaming model lets children run at <2% CPU and <150MB RAM when streaming-only, and parents aggregate up to 500 children ([Netdata parents](https://www.netdata.cloud/blog/netdata-parents-streaming-replication/)).
- **Beszel agent** is the standout for small self-hosted setups: a single ~15-25 MB Go binary, single config file, ED25519 keyed, WebSocket-primary with SSH fallback on port 45876, covers Linux/FreeBSD/macOS/Windows, and ships with Docker/Podman container stats, SMART disk health, and GPU (Nvidia/AMD/Intel) out of the box ([DeepWiki](https://deepwiki.com/henrygd/beszel)).
- **Write your own agent** only when (a) you need a metric no existing agent reports, or (b) you want absolute minimum binary size and you're already building a Go/Rust panel. Most "custom agents" end up reimplementing `gopsutil` badly.

### Windows & macOS

- Windows: `windows_exporter` (MSI, installs as a service, adds firewall rule) for pull; Telegraf with `win_perf_counters` plugin for push; Beszel has native Windows support via WinGet/Scoop.
- macOS: Beszel via Homebrew; Telegraf via Homebrew; `node_exporter` works but some collectors are Linux-only.

---

## 3. Transport & Protocol

| Protocol | Overhead | Streaming | Notes |
|---|---|---|---|
| HTTP/1.1 + JSON | highest (JSON parse, no multiplexing) | no | Dead simple, debuggable with curl |
| HTTP/1.1 + Protobuf | low | no | Prometheus remote-write format |
| HTTP/2 + Protobuf (OTLP/HTTP) | low | half-duplex | Works through most HTTP proxies |
| gRPC (OTLP/gRPC) | lowest | full-duplex | Best perf, some L7 proxies still finicky |
| WebSocket | very low after upgrade | full-duplex | Great for live push + bidirectional control |
| Custom TCP (Netdata) | lowest | full-duplex | Bespoke binary protocol, port 19999 |
| SSH tunnel | moderate (TLS handshake, then raw) | full-duplex | Reuses existing key trust model |

Per the OTel community, gRPC with protobuf is ~2-3x more bandwidth- and CPU-efficient than JSON over HTTP, but "performance-wise they are pretty similar" for low sample rates; HTTP is easier to push through load balancers and corporate proxies ([OTLP comparison](https://signoz.io/comparisons/opentelemetry-grpc-vs-http/)).

### 3.1 Beszel's transport (a good pattern to study)

Beszel's agent-hub communication is worth understanding in detail because it's the tightest match for a small-fleet, self-hosted panel:

```
            [WebSocket, agent-initiated] (primary)
            |        HUB_URL :443/ws            |
  +-------+ |                                   | +--------+
  | agent | +---- CBOR-encoded CombinedData --> | | hub    |
  |       | |                                   | | (8090) |
  +-------+ |                                   | +--------+
            |   [SSH, hub-initiated, fallback]  |
            |        agent :45876               |
            +-----------------------------------+
```

- **Primary WebSocket** opened outbound from the agent to the hub. Mutual auth: hub signs a token challenge with its private ED25519 key; agent verifies against the hub public key that was pinned at install; agent sends a fingerprint (hash of machine-specific identifiers) that the hub matches against the system record ([system registration](https://deepwiki.com/henrygd/beszel/7.1-system-registration-and-authentication)).
- **SSH fallback** on port 45876 on the agent, for topologies where the hub can reach agents but agents cannot reach the hub (e.g., hub behind a restrictive egress firewall). Agent accepts *only* the hub's ED25519 key and never provides a pseudo-terminal — compromise of the hub private key cannot yield shell access.
- Payloads are CBOR-encoded (tighter than JSON, easier than protobuf because no schema file required).

This dual-transport design cleanly handles NAT, restrictive networks, and air-gapped-ish deployments without making the user pick up front.

### 3.2 Auth

For a solo-developer setup:
- **Per-agent API keys** if push-only — generate at hub, paste into agent config.
- **ED25519 keypair** if either side might dial — one pinned public key per direction (this is Beszel's pattern).
- **mTLS** is overkill for <10 hosts but is the "right" enterprise answer.
- **OAuth/OIDC** for the user-facing dashboard, optional. Beszel supports "many OAuth2 providers" plus local password.

---

## 4. Storage / Time-Series Database

| DB | Model | Retention default | Disk per sample | Strengths | When to pick |
|---|---|---|---|---|---|
| Prometheus TSDB | pull, local | 15d | ~1.5-2 B | Battle-tested, simple, PromQL | Single node, few weeks of data |
| VictoriaMetrics | pull + remote-write | configurable | ~0.4 B (claimed 10-20x vs Prom) | Compression, speed, PromQL-compatible | Long retention, bigger fleet |
| InfluxDB v2 | push (line protocol) | configurable | ~1-3 B | Flux queries, native TSM engine | Already using Influx |
| InfluxDB v3 | push | configurable | ~0.5-1 B | Parquet/DataFusion, SQL | New projects wanting SQL |
| TimescaleDB | push (SQL) | configurable | ~2-4 B | SQL + Postgres, continuous aggregates | Time-series alongside relational data |
| Thanos/Cortex/Mimir | pull + remote-write | years (S3) | ~0.4 B | HA, multi-tenant, S3-backed | Large fleets with global query |
| ClickHouse | push | configurable | ~0.3-0.5 B | Blazing analytical queries, logs+metrics+traces | Observability all-in-one (SigNoz) |
| SQLite (custom schema) | push | app-defined | ~8-16 B naive, much less with bucketing | Single file, zero-ops | Small fleets, embedded |
| DuckDB | push/batch | app-defined | ~0.5-1 B | Analytical, Parquet-native, embedded | Analytics not realtime |

### 4.1 Prometheus sizing example

With Prometheus's ~1.5-2 bytes per sample ([Robust Perception](https://www.robustperception.io/how-much-disk-space-do-prometheus-blocks-use/)):

```
disk = retention_seconds × samples_per_second × bytes_per_sample × 1.2 (WAL overhead)
```

One Node Exporter host scraped every 15s exposes ~800 series:

```
800 series × (1 / 15 s) = ~53 samples/sec per host
53 × 86400 × 365 × 2 B × 1.2 = ~4 GB/host/year
```

10 hosts × 1 year ≈ **40 GB**, which SQLite, Prometheus, or any modern TSDB trivially handles on a cheap VPS.

### 4.2 SQLite as a TSDB (Beszel's choice)

Beszel embeds PocketBase, which uses SQLite in WAL mode ([PocketBase FAQ](https://pocketbase.io/faq/)), and stores two shapes of data:
- **Real-time collections** (`system_stats`, `container_stats`) — individual time-bucketed samples.
- **State collections** (`systems`, `containers`, `smart_devices`) — current status rows.

Retention and rollup are handled by a `RecordManager` with five tiers ([DeepWiki](https://deepwiki.com/henrygd/beszel)):

| Resolution | Retained | Aggregation |
|---|---|---|
| 1 minute  | 1 hour  | raw samples |
| 10 minutes | 12 hours | avg of >=9 records |
| 20 minutes | 24 hours | avg of >=2 records |
| 2 hours   | 7 days  | avg of >=6 records |
| 8 hours   | 30 days | avg of >=4 records |

Older data is discarded — Beszel is not designed as a long-term archive. For a small fleet this is usually fine; add remote-write to VictoriaMetrics later if you need years of history.

### 4.3 Recommendation for 1-10 machines, solo dev

- If you are **writing a custom panel**: SQLite with an explicit bucketing scheme (raw/10m/1h/1d tiers) is more than enough, dead simple to back up (one file), and has no ops burden. This is Beszel's approach and it scales to low hundreds of hosts.
- If you are **assembling off-the-shelf**: Prometheus + 30-day retention + optional VictoriaMetrics remote-write for long-term.
- Skip InfluxDB v2 unless you already have Flux experience — Influx's positioning has wobbled through v1/v2/v3 and v2 is no longer recommended for new deployments.
- Skip Thanos/Mimir/Cortex entirely — they exist for multi-tenant PB-scale fleets.

---

## 5. Ingestion Pipeline

```
[Agent] --> [Ingest API] --> [Validation/Enrichment] --> [TSDB]
              |                      |
              +--> rate limit        +--> dead-letter
              +--> auth              +--> late-sample clamp
```

### Patterns

1. **Direct agent → DB** (Beszel, InfluxDB native). Simplest. DB becomes SPOF.
2. **Agent → relay/hub → DB** (Prometheus + remote-write, OTel Collector → TSDB). One place to enforce auth, rate limit, transform, dedup.
3. **Agent → queue → consumer → DB** (NATS / Kafka / Redis Streams). Adds durability during DB outages and decouples write rate. Overkill for 1-10 hosts unless you already run one of these queues.

### Handling edge cases

- **Agent disconnected** — client-side ring buffer (Telegraf's `[[outputs.file]]` fallback, OTel Collector's `file_storage` extension, Beszel's in-memory last-N). Keep at least 5-15 minutes of local samples.
- **Late data / out of order** — most TSDBs tolerate out-of-order inserts within a configurable window (Prom: 5m historically, configurable in VictoriaMetrics).
- **Clock skew** — enforce NTP on agents. Optionally record both `sample_time` (agent-local) and `receive_time` (server) and reject samples more than ±5 min off as a sanity check.
- **Duplicate samples after reconnect** — use (series_id, timestamp) as primary key; most TSDBs do this automatically.

---

## 6. Backend / API Layer

For a live dashboard over a small fleet, the simplest shape is:

```
Browser <--WS--> Panel API <--query--> TSDB
                    ^
                    |  /ingest (agents push here)
              [Agent pool]
```

### API style

- **REST** — easiest, fine for polled widgets, easy to cache.
- **WebSocket / SSE** — needed for "live" dashboards. SSE is simpler (one-way server push over HTTP), WebSocket is needed if you also want client→server messages (e.g., "subscribe to bserver only").
- **GraphQL / tRPC** — nice typing, but little benefit for read-mostly dashboards with small, stable query shapes.

Beszel leans on PocketBase's built-in realtime subscriptions (SSE over HTTP) to push updates to the browser.

### Query API patterns

- Serve **pre-aggregated rollups** for the default views (last hour at 1m, last day at 10m, last week at 2h) to keep queries cheap.
- Only hit **raw** data for zoomed-in / ad-hoc analysis.
- Cache the "top-of-dashboard" query aggressively — the same 10 queries account for 90% of traffic from a single user hammering the dashboard.

### Auth

Single-user assumption simplifies things. Pick one:
- Magic-link email login + session cookie.
- OAuth (GitHub/Google) via a library (authjs, Lucia, PocketBase's OAuth2).
- Basic auth behind a reverse proxy (Caddy or Authelia).

### Rate limiting

Per-agent ingest: token-bucket keyed by agent API key, 10 req/s with burst of 60 is plenty for per-15s push. Reject with 429 and `Retry-After`.

---

## 7. Live vs Polled UI Updates

| Technique | Latency | Server load | Complexity |
|---|---|---|---|
| WebSocket push | <100 ms | medium | medium |
| SSE push | <100 ms | medium | low |
| React Query / SWR polling @5-15s | 5-15 s | low-medium | trivial |
| HTMX polling | 5-15 s | low | trivial |

For a "live" dashboard, SSE is usually the right level of sophistication — it's HTTP, passes through proxies, and is supported natively by React Query and the Fetch API. Switch to WebSocket only if you need client→server commands.

Beszel's UI uses PocketBase's realtime subscriptions (SSE) and displays updates roughly every scrape interval (default 60s) ([Beszel UI architecture](https://deepwiki.com/henrygd/beszel)).

---

## 8. Retention, Rollups, Downsampling

A small fleet's hardest storage decision is how much resolution to keep *how far back*.

### Strategies

- **Prometheus** — keeps full resolution for `--storage.tsdb.retention.time` (default 15d), no built-in downsampling.
- **VictoriaMetrics** — same, but compression is so good that 1-year retention at full resolution is typically feasible.
- **Thanos** — automatic 5m and 1h downsampled blocks for long-term S3 storage.
- **Graphite / Whisper** — the original tiered approach: raw/10m/1h/1d tiers, each with its own retention (what Beszel mimics).

### A reasonable default for self-hosted

```
raw (15s)   ->  kept 6 hours
1 min avg   ->  kept 3 days
5 min avg   ->  kept 30 days
1 hour avg  ->  kept 1 year
1 day avg   ->  kept forever (cheap)
```

### Disk budget, realistic

1 machine, ~800 series, 15s scrape, 1 year, mixed tiers above, ~1 B/sample compressed: **~1-3 GB/year**. Ten machines: **10-30 GB/year**. Fits on any VPS.

---

## 9. Alerting Pipeline

### Components

1. **Rule evaluator** — runs queries on a schedule (e.g., "cpu > 90% for 5m").
2. **Alert manager** — dedup, group, route, silence, inhibit.
3. **Notification sinks** — email, webhook, chat.
4. **Dead-man switch** — external service that alerts when the alerting system itself stops pinging.

### Options

| Tool | What it does | Best when |
|---|---|---|
| Prometheus Alertmanager | Rule eval in Prom, routing/dedup in AM. YAML config. | Already using Prometheus |
| Grafana Alerting | UI-driven rules, multi-datasource queries, embedded in Grafana | Using Grafana stack; want GUI |
| Healthchecks.io | External "did X ping me in the last N?" | Dead-man switch layer |
| Beszel built-in | Thresholds for CPU/mem/disk/temp/GPU/SMART, Shoutrrr sinks | Using Beszel as full stack |
| Custom SQL + cron | Query your own DB, send webhook | DIY panel, <10 rules |

### Notification sinks (all support webhooks)

- **ntfy** — pub/sub over HTTP, trivial to self-host, mobile apps ([ntfy.sh](https://ntfy.sh/))
- **Gotify** — self-hosted push, has its own Android app ([comparison](https://blog.vezpi.com/en/post/notification-system-gotify-vs-ntfy/))
- **Discord / Slack webhooks** — just a POST, easiest for solo dev
- **Apprise** — wrapper library over 110+ services; belt-and-suspenders
- **Shoutrrr** (what Beszel uses) — Go library with Email/Signal/Slack/Discord/Telegram/Matrix/etc

### Dead-man switch

Critical for a solo-dev stack: if your panel dies, you'll never get an alert about your panel dying *from the panel itself*. Healthchecks.io (hosted or self-hosted) expects a ping every N minutes; if it stops receiving, *it* alerts you. Wire a cron on the panel to `curl https://hc-ping.com/<uuid>` every minute. ~5 minutes of setup, probably the highest-leverage alerting step in the whole stack.

---

## 10. Deployment Topology

| Topology | Ops burden | Good for |
|---|---|---|
| Single container/binary, SQLite-backed | trivial | 1-10 hosts, solo dev |
| Docker Compose (app + TSDB + Grafana) | low | 10-50 hosts or Grafana-stack fans |
| K3s / Nomad | medium | Homelab with existing orchestrator |
| Full K8s | high | Don't |
| Bare-metal systemd | low | Single VPS, no Docker |

### Recommendation

Start with single-container/binary. Your panel app, SQLite file mounted as a volume, Caddy or Traefik in front for TLS. Everything else is overkill until you hit >20 hosts or >100k series.

---

## 11. Concrete Reference Architectures

### 11.1 "Beszel-style" — single Go binary hub + tiny agents

```
  bserver                     other hosts
  +------+                   +------+ +------+
  |agent | ---.               |agent| |agent|
  +------+    \  WebSocket   +------+ +------+
               \    (outbound from agent)
                \             /
                 \           /
                  v         v
               +---------------+
               |     HUB       |  <-- subdomain (Caddy/Traefik)
               |  Go binary    |
               |  SQLite file  |
               |  SSE to UI    |
               +---------------+
                      ^
                      |  HTTPS
                   [browser]
```

- **Components**: hub binary, agent binary per host, SQLite file, reverse proxy for TLS.
- **Setup time**: 30 min to 1 hour for first host, ~2 min per additional host.
- **Good fit when**: 1-30 hosts, want a clean UI out of the box, OK with ~30-day retention.
- **Caveats**: you're adopting Beszel's schema and UI; if your ambition is to build a bespoke panel, study Beszel rather than run it.

### 11.2 "Prometheus + Grafana" — classic pull stack

```
     bserver                other hosts
  +--------------+       +--------------+
  |node_exporter |       |node_exporter |
  |    :9100     |       |    :9100     |
  +------^-------+       +------^-------+
         |  scrape /metrics     |
         +----------+-----------+
                    |
              +-----v------+       +----------+
              | Prometheus |<----->| Grafana  |
              |  :9090     |       |  :3000   |
              +-----^------+       +-----^----+
                    |                    |
              +-----v------+             |
              |Alertmanager|          [browser]
              |  :9093     |
              +------------+
```

- **Components**: Prometheus, Alertmanager, Grafana, node_exporter per host, reverse proxy.
- **Setup time**: 2-4 hours for first deploy, 5 min per host (only if reachable; add VPN or PushProx if not).
- **Good fit when**: hosts are reachable from panel (same VPC / mesh VPN), you want the default Grafana dashboards, you like YAML.
- **Caveats**: you own the "how do I reach NATed hosts" problem — usually by putting Tailscale/WireGuard on every host, which is fine but adds a moving part.

### 11.3 "OTel-native" — SigNoz / ClickHouse-backed

```
  host                                  panel
  +-----------+                 +------------------+
  |OTel       |    OTLP/gRPC    | OTel Collector   |
  |Collector  |---------------->|  :4317/:4318     |
  |(or Alloy) |                 +--------+---------+
  +-----------+                          |
                                         v
                                  +-------------+        +----------+
                                  |  ClickHouse |<------>| SigNoz   |
                                  +-------------+        |   UI     |
                                                         +----------+
```

- **Components**: OTel Collector (or Alloy) on each host, central OTel Collector, ClickHouse, SigNoz UI (or your own UI) ([SigNoz architecture](https://signoz.io/docs/architecture/)).
- **Setup time**: 4-8 hours first deploy; ClickHouse has real ops weight.
- **Good fit when**: you also need logs and traces, plan to grow to >50 hosts, want vendor-portable instrumentation.
- **Caveats**: ClickHouse is a commitment — memory-hungry, operationally non-trivial. Total overkill for bserver + a few friends.

---

## 12. Recommendation

**Given the stated context** — 1 host today (`bserver`), possibly 1-10 later, solo developer, self-hosted on a subdomain, live dashboards, geographically varied hosts (some NATed) — the right starting architecture is:

> **Push-based, single-binary hub + thin agents, SQLite storage, SSE to the browser, with a dead-man switch via Healthchecks.io.**

In concrete terms, pick one of:

1. **Run Beszel as-is.** It *is* this architecture — MIT-licensed, ~15-25 MB agent, WebSocket primary + SSH fallback, PocketBase/SQLite backend with tiered downsampling, OAuth, Shoutrrr notifications, built-in container/GPU/SMART support. 30 minutes to first host, 2 minutes per additional host. ([beszel.dev](https://beszel.dev/))

2. **Build your own panel on the same shape.** Go or TypeScript hub, one table per metric-family with explicit time-bucket columns in SQLite (WAL mode), one Go agent binary that pushes CBOR over WebSocket with ED25519 mutual auth, SSE from hub to browser, Prometheus-style `/health` for the dead-man. Reuse Beszel's retention tiers as a starting point. Add Prometheus remote-write *output* from the hub later if you want Grafana-style deep dives or long-term storage in VictoriaMetrics.

**Why not Prometheus+Grafana as the first step**: every NATed host becomes a configuration project (VPN, PushProx, reverse proxy), and you get a nice dashboard but a stranger's UX. The Prometheus stack shines at 20+ hosts on a single network; at 1-10 hosts across varied networks it's friction.

**Why not SigNoz/OTel/ClickHouse**: it's the future-proof answer, but ClickHouse ops is a second job. Revisit when you also want logs + traces and the fleet is >20 hosts.

**Escape hatches you should leave open from day one**:

- Make the agent speak Prometheus remote-write format (it's just protobuf-over-HTTP) *in addition* to your custom protocol. Then you can point it at VictoriaMetrics any time for long-term storage.
- Structure your hub's ingestion as `parse → validate → enrich → store`. You'll want to add dedup/rate-limit/transform in the middle eventually — leave the seams now.
- Use SQLite's `ATTACH DATABASE` to split hot (last 7d) and cold (older) databases into separate files. Cold files can be rotated, compressed, and eventually archived to S3 without touching the hot path.

This gets `bserver` monitored tonight, scales cleanly to ~30 hosts, and keeps every door open for the upgrade path to Prometheus-compatible storage when/if the fleet grows.

---

## Sources

- [Prometheus: When to use the Pushgateway](https://prometheus.io/docs/practices/pushing/)
- [SigNoz: Is Prometheus Monitoring Push or Pull?](https://signoz.io/guides/is-prometheus-monitoring-push-or-pull/)
- [Robust Perception: How much disk space do Prometheus blocks use?](https://www.robustperception.io/how-much-disk-space-do-prometheus-blocks-use/)
- [Prometheus storage docs](https://prometheus.io/docs/prometheus/latest/storage/)
- [PushProx (Prometheus community)](https://github.com/prometheus-community/PushProx)
- [VictoriaMetrics FAQ](https://docs.victoriametrics.com/FAQ.html)
- [Index.dev: InfluxDB vs Prometheus vs VictoriaMetrics](https://www.index.dev/skill-vs-skill/database-prometheus-vs-influxdb-vs-victoriametrics)
- [Grafana Alloy overview](https://grafana.com/oss/alloy-opentelemetry-collector/)
- [OTel Collector vs Grafana Alloy](https://oneuptime.com/blog/post/2026-02-06-compare-opentelemetry-collector-vs-grafana-alloy/view)
- [SigNoz: OpenTelemetry gRPC vs HTTP](https://signoz.io/comparisons/opentelemetry-grpc-vs-http/)
- [OTLP specification](https://opentelemetry.io/docs/specs/otlp/)
- [Netdata Parents streaming architecture](https://www.netdata.cloud/blog/netdata-parents-streaming-replication/)
- [Netdata resource utilization](https://learn.netdata.cloud/docs/netdata-agent/resource-utilization)
- [Beszel homepage](https://beszel.dev/)
- [Beszel security guide](https://beszel.dev/guide/security)
- [Beszel agent installation](https://beszel.dev/guide/agent-installation)
- [Beszel architecture on DeepWiki](https://deepwiki.com/henrygd/beszel)
- [Beszel system registration](https://deepwiki.com/henrygd/beszel/7.1-system-registration-and-authentication)
- [PocketBase FAQ (SQLite backend)](https://pocketbase.io/faq/)
- [Windows Exporter](https://github.com/prometheus-community/windows_exporter)
- [Prometheus vs Telegraf for Windows](https://sourceforge.net/software/compare/Prometheus-vs-Telegraf/)
- [Alertmanager vs Grafana Alerting (2026)](https://alexandre-vazquez.com/alertmanager-vs-grafana-alerting/)
- [Gotify vs ntfy comparison](https://blog.vezpi.com/en/post/notification-system-gotify-vs-ntfy/)
- [ntfy.sh](https://ntfy.sh/)
- [SigNoz technical architecture](https://signoz.io/docs/architecture/)
- [ClickHouse + SigNoz observability](https://clickhouse.com/blog/signoz-observability-solution-with-clickhouse-and-open-telemetry)
