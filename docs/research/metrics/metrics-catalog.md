# Server Analytics Dashboard — Metrics Catalog

A comprehensive catalog of metrics a modern self-hosted server analytics panel should display, targeted at a primarily Linux host ("bserver") with a future multi-machine fleet in mind. Categories, rationales, visualizations, and alert thresholds are drawn from the reference implementations at the bottom (Prometheus Node Exporter, Netdata, Grafana "Node Exporter Full", Beszel, and Datadog system docs).

Conventions used below:

- **Viz** column suggests the primary chart type: line (time series), gauge (current value vs max), stat (single big number), table (top-N list), heatmap (distribution over time), status dot (up/down/healthy), bar, or stacked area.
- **Alert** is a reasonable default threshold. Tune per host — a DB server and a static-site host have different normal bands.
- "Per-host" assumes every metric is tagged with `host`/`hostname` so the same panel works across many machines.

---

## 1. System / Host

### 1.1 CPU

| Metric | What it is | Why it matters | Viz | Alert |
|---|---|---|---|---|
| CPU usage % (total) | `1 - avg(rate(node_cpu_seconds_total{mode="idle"}))` | Headline saturation signal; spikes precede almost every other symptom | line + current-value stat | >85% sustained 5 min |
| Per-core usage | Same, grouped by `cpu` label | Reveals single-threaded bottlenecks that total % hides | heatmap (core x time) | any core pinned >95% 10 min |
| CPU time by mode | user, system, iowait, irq, softirq, steal, guest, nice, idle | Diagnoses *what kind* of load (kernel vs user vs waiting on disk vs noisy neighbor) | stacked area | n/a (diagnostic) |
| Load average 1/5/15m | `node_load1`, `node_load5`, `node_load15` | Classic Unix pressure metric; normalize by core count | line (three series) | load1 > cores * 1.5 |
| Context switches/s | `rate(node_context_switches_total)` | Sudden jumps hint at lock contention, noisy thread pools, hyperactive timers | line | anomaly-based |
| Interrupts/s | `rate(node_intr_total)` | Network storms and failing hardware raise this | line | anomaly-based |
| iowait % | `node_cpu_seconds_total{mode="iowait"}` | High iowait == CPU idle waiting on storage — points to disk as bottleneck | line | >20% sustained |
| Steal time % | `node_cpu_seconds_total{mode="steal"}` | On VMs: time stolen by hypervisor — your noisy neighbors | line | >5% sustained |
| CPU frequency | `node_cpu_frequency_hertz` | Thermal throttling and power-cap detection | line per core | drop >30% from max |
| CPU pressure (PSI) | `/proc/pressure/cpu` some/full | PSI is newer and catches "everything runnable but nothing moving" better than load avg | line | some > 20%, full > 10% |

### 1.2 Memory

| Metric | What it is | Why it matters | Viz | Alert |
|---|---|---|---|---|
| Memory used / total | `MemTotal - MemAvailable` | Primary capacity signal; use `MemAvailable`, not `free` | stacked area + gauge | >90% |
| Breakdown: used / cached / buffers / free / slab | From `/proc/meminfo` | Cache is not "used" — a naive dashboard panics users unnecessarily | stacked area | n/a |
| Swap used / total | `SwapTotal - SwapFree` | Light swap fine; any swap on a DB host is bad | gauge | >50% of swap |
| Swap in/out rate | `vmstat pswpin/pswpout` | Rate matters more than size — thrash kills latency | line | >0 sustained on latency-sensitive hosts |
| Page faults (major/minor)/s | `node_vmstat_pgmajfault` | Major faults mean disk reads; indicates memory pressure | line | anomaly-based |
| OOM kill events | Count of oom-killer in dmesg / journal | A single event often explains mystery restarts | status dot + event log | any event = HIGH |
| Memory pressure (PSI) | `/proc/pressure/memory` | Low free RAM + PSI rising == reclaim thrash | line | some > 10% |
| Hugepages / transparent hugepages | `HugePages_*` | Relevant for DBs and JVMs | stat | n/a |
| Dirty pages | `Dirty` in meminfo | Large dirty sets precede long fsync stalls | line | anomaly-based |

### 1.3 Disk / Filesystem

| Metric | What it is | Why it matters | Viz | Alert |
|---|---|---|---|---|
| Filesystem usage % | `(size - avail) / size` per mount | A full disk is the #1 cause of outages | gauge per mount | >85% warn, >95% critical |
| Filesystem usage by mount (table) | Per-mount size / used / avail / fstype | Lets you spot whether it's `/`, `/var/log`, or a data mount | table | n/a |
| Inode usage % | `1 - node_filesystem_files_free/files` | You can be out of inodes with free bytes (many tiny files) | gauge | >80% |
| Disk IOPS (read/write) | `rate(node_disk_reads_completed_total)` | Identifies hot disks and caps on NVMe/SATA | line | vendor-specific |
| Disk throughput (MB/s) | `rate(node_disk_read_bytes_total)` | Sustained throughput vs bursty behavior | line | vendor-specific |
| Disk latency (avg read/write) | `node_disk_*_time_seconds_total / *_completed_total` | Real user-visible slowness lives here, not in IOPS | line | >20 ms sustained on SSD |
| Disk queue depth / await | `avgqu-sz`, `await` (iostat equivalent) | Rising queue == saturation | line | >4 sustained |
| Disk utilization % | `rate(node_disk_io_time_seconds_total)` | 1.0 == device 100% busy | gauge | >90% sustained |
| SMART health | `smartctl_device_*` via smartctl_exporter | Predicts disk failure (reallocated sectors, pending sectors) | status dot + table | any SMART warn = HIGH |
| RAID array status | `node_md_disks`, `mdadm` state | Silent degraded RAID is common and dangerous | status dot | degraded = CRITICAL |
| Filesystem errors | dmesg EXT4/XFS errors | Precedes corruption | event count | any = HIGH |

### 1.4 Network

| Metric | What it is | Why it matters | Viz | Alert |
|---|---|---|---|---|
| Bandwidth in/out per interface | `rate(node_network_receive_bytes_total)` | Capacity planning + unexpected egress (data exfil) | line per iface | >80% link speed |
| Packet rate in/out | `rate(node_network_receive_packets_total)` | DDoS, scrape storms | line | anomaly-based |
| Interface errors | `node_network_*_errs_total` | Bad cable, duplex mismatch, failing NIC | line | >0 /s sustained |
| Interface drops | `node_network_*_drop_total` | Kernel ring buffer exhaustion | line | >0 /s sustained |
| TCP connections by state | `node_netstat_Tcp_CurrEstab`, others | Established vs TIME_WAIT vs CLOSE_WAIT tells very different stories | stacked area | CLOSE_WAIT climbing = leak |
| TCP retransmits/s | `rate(node_netstat_Tcp_RetransSegs)` | Network quality; >1% is a red flag | line | >1% of segs out |
| Active / passive opens /s | `ActiveOpens`, `PassiveOpens` | Connection churn signals client retry storms | line | anomaly-based |
| Listening ports | `ss -tlnp` snapshot | Security + "what is this server doing" | table | unexpected port opens |
| Conntrack table usage | `nf_conntrack_count / _max` | Full conntrack silently drops connections | gauge | >80% |
| DNS resolver latency | local resolver probe | DNS is the stealth cause of app slowness | line + p95 | p95 > 100 ms |

### 1.5 System info

| Metric | What it is | Why it matters | Viz |
|---|---|---|---|
| Hostname / OS / kernel | `node_uname_info` | Identity and drift detection across fleet | info card |
| Uptime | `time() - node_boot_time_seconds` | Recent reboot often explains weirdness | stat |
| Reboot events | Delta in boot_time | Unplanned reboots get lost without an event log | event list |
| Time sync drift | `node_timex_offset_seconds` | Auth/logs/TLS break when clocks drift | line | `>50 ms` |

### 1.6 Thermal / power / hardware

| Metric | What it is | Why it matters | Viz | Alert |
|---|---|---|---|---|
| CPU / package temp | `node_hwmon_temp_celsius` | Throttling, airflow issues, summer heat | line per sensor | >85 C |
| GPU temp & utilization | `nvidia_smi_*` / AMD equivalents | If there's a GPU it matters for both heat and workload | line | vendor |
| Disk temperature | SMART attribute 194 | NVMe can throttle hard above ~70 C | line | >65 C |
| Fan RPM | `node_hwmon_fan_rpm` | 0 RPM on a fan that should spin = hardware failure imminent | line | zero on expected fan |
| Power draw (W) | `node_hwmon_power_average_watt`, PSU sensors | Rack / UPS capacity; efficiency | line | n/a |
| ECC memory errors | `edac_*` collector | Silent data corruption precursor | counter + event | any correctable > rate, uncorrectable = CRITICAL |

---

## 2. Processes

| Metric | What it is | Why it matters | Viz | Alert |
|---|---|---|---|---|
| Total process / thread count | `node_processes_state` | Fork bombs, runaway workers | line | threshold per host |
| Processes by state | running / sleeping / zombie / D-state | D-state stuck on I/O and zombies are worth a separate panel | stacked area | zombies climbing, D-state > N |
| Top N by CPU | Per-PID CPU % | "Why is the box hot" in one glance | table (pid, user, cmd, cpu, mem, time) | n/a |
| Top N by memory (RSS) | Per-PID RSS | Catches leaks | table | n/a |
| Top N by disk I/O | `iotop`-style: read/write bytes per pid | Finds noisy log writers, backup jobs | table | n/a |
| Top N by net I/O | per-pid bytes (via `nethogs`/eBPF) | Unidentified bandwidth source | table | n/a |
| Long-running processes | runtime > threshold | Stuck cron jobs, orphaned SSH sessions | table | runtime > 24h for non-daemons |
| File descriptor usage | per-process open FDs / limit | FD leaks are a classic cause of silent 5xx | line per top process | >80% of limit |

---

## 3. Services / Daemons / Containers

### 3.1 Systemd units

| Metric | What it is | Why it matters | Viz | Alert |
|---|---|---|---|---|
| Unit state | `node_systemd_unit_state{state="active"}` per unit | Is everything that *should* be running actually running | status grid | any expected unit !=active |
| Failed units count | `node_systemd_units{state="failed"}` | Single-pane "anything broken?" | stat | >0 |
| Restart count per unit | Derived from `NRestarts` | Flapping services | bar | >N in 1h |
| Unit uptime / last start | from systemd timestamps | Detect unexpected restarts | table | n/a |

### 3.2 Containers (Docker / Podman)

| Metric | What it is | Why it matters | Viz | Alert |
|---|---|---|---|---|
| Container count (running / total) | `docker ps` / cadvisor | Footprint overview | stat | n/a |
| Per-container CPU % | `container_cpu_usage_seconds_total` | Noisy neighbors on one host | line per container | >90% of limit |
| Per-container memory (RSS + cache) | `container_memory_working_set_bytes` | OOMKill precursor | line | >90% of limit |
| Per-container network in/out | `container_network_*_bytes_total` | Which container is chatty | line | n/a |
| Container restart count | From docker API | Crashloop detection | bar | >3 in 10 min |
| Image / version info | `container_spec_*` labels | Drift and "what's actually deployed" | table | n/a |
| Volume usage | Per-volume size | Volumes grow silently | gauge | >85% |

---

## 4. Logs

Log analytics sit next to the metrics panel — most good dashboards cross-link the two (click a spike, see the logs for that minute).

| Metric | What it is | Why it matters | Viz | Alert |
|---|---|---|---|---|
| Log volume over time | Lines/s from journald/syslog | Sudden silence or spikes both signal problems | line | spike > 5x baseline, or flatline |
| Error count (ERR/CRIT) | journald priority 0-3 | Fast "is anything burning" | line + stat | derivative alert |
| Warning count | journald priority 4 | Catches slow degradations | line | anomaly |
| Per-service log rate | Grouped by unit | Which component is yelling | stacked area | per-unit anomaly |
| Recent log tail | Last N lines with level filter | The single most-used panel during incidents | scrolling table w/ search | n/a |
| Top error messages | Deduped top-N error strings | "Same error 10k times" vs "10k unique errors" | table | n/a |
| Auth / audit log stream | journald `_SYSTEMD_UNIT=systemd-logind` + auditd | Security overlap | filtered table | n/a |

Integration patterns: journald native via `systemd-journal-gatewayd` or `promtail`; syslog to Loki; `vector` as a generic shipper. Keep logs and metrics in the same UI even if storage differs.

---

## 5. Security / Auth

| Metric | What it is | Why it matters | Viz | Alert |
|---|---|---|---|---|
| SSH successful logins | `pam_unix` success entries | Expected baseline; deviation = investigate | line + table (user, src IP, time) | login outside known IP set |
| SSH failed logins /min | `Failed password` or `Invalid user` | Brute force signal | line | >20/min |
| Top source IPs (failed) | Grouped by src | Decide what to ban manually | table | n/a |
| fail2ban currently banned | fail2ban-client status per jail | Active defense snapshot | stat per jail | n/a |
| fail2ban ban rate | New bans/hour | Ongoing attack waves | line | spike > 10x baseline |
| Listening port list | `ss -tln` | Ground truth of attack surface | table (port, process, user) | unexpected new port |
| Open externally-reachable ports | Matched against expected allowlist | Same, filtered to public | table | any unexpected |
| Firewall drops | `nftables`/`iptables` counters, or UFW logs | Scan activity, misconfigured clients | line | anomaly |
| sudo usage | `pam_unix` sudo entries, or auditd | Who did what as root | table (user, cmd, time) | any sudo from unexpected user |
| User / group changes | auditd on `/etc/passwd`, `/etc/group`, `/etc/shadow` | Unauthorized account creation | event log | any change = HIGH |
| SSH key / sshd_config changes | auditd watch on `~/.ssh/authorized_keys`, `/etc/ssh/` | Persistence mechanism for attackers | event log | any change = HIGH |
| Package changes | dpkg/rpm log | Supply chain / unexpected installs | event log | n/a |
| Unattended-upgrades status | Last run, pending security updates | Patch hygiene | stat | pending security updates > 0 |
| CVE / kernel vuln scan | e.g. `vulners`, `trivy` host scan | Known-vuln exposure | table | any CRITICAL CVE |

---

## 6. Network / Traffic

Beyond interface counters (Section 1.4), richer traffic analytics:

| Metric | What it is | Why it matters | Viz | Alert |
|---|---|---|---|---|
| Per-host traffic (fleet) | Totals per `hostname` | Fleet-wide "who's loud" | bar / line | n/a |
| Active connections by process | `ss -tnp` grouped by pid/command | Which daemon is talking to 2k IPs | table | n/a |
| Top remote peers | By bytes and by conn count | Debugging + anomaly spotting | table (ip, bytes, conns) | n/a |
| GeoIP of inbound traffic | MaxMind lookup on remote IPs | Public-facing only; useful for threat modeling | map + table | n/a |
| DNS query stats | Via local resolver (Unbound/CoreDNS metrics) or eBPF | Slow DNS → slow everything | line + p95 | p95 > 100ms |
| DNS answer rcode breakdown | NXDOMAIN / SERVFAIL ratio | Misconfigured clients or upstream problems | stacked area | SERVFAIL spike |
| Firewall drop counts (per chain/rule) | `nft counter` | Which rule is hitting | bar | rule anomalies |
| Per-IP rate limit hits | nginx limit_req / iptables hashlimit | Abuse detection | line | n/a |

---

## 7. Web / HTTP (nginx / caddy / apache)

| Metric | What it is | Why it matters | Viz | Alert |
|---|---|---|---|---|
| Requests / second | stub_status or access-log parse | Traffic headline | line | anomaly |
| RPS by vhost / host header | same, grouped | Multi-tenant picture | stacked area | n/a |
| Status code breakdown | 2xx/3xx/4xx/5xx per second | Error rate is the RED signal | stacked area | 5xx > 1% of total |
| Error rate % | `5xx / total` | SLO-style single number | line + stat | >1% for 5 min |
| Latency p50 / p95 / p99 | histogram from access logs or exporter | Tail latency is user experience | line (three series) or heatmap | p99 > 1s |
| Request duration heatmap | Per-request time distribution | Shows bimodal latency / outliers | heatmap | n/a |
| Top endpoints | Top-N by req count + by avg latency | Where to optimize | table | n/a |
| Top slow endpoints | Top-N by p95 | Where users hurt | table | n/a |
| Top user agents | Grouped | Bots, scrapers, unexpected clients | table | n/a |
| Top referers | Grouped | Traffic sources | table | n/a |
| Bandwidth by vhost | Bytes out per server_name | Who's eating egress | line | n/a |
| Active / waiting connections | stub_status | Queue buildup | line | waiting climbing |
| Upstream response time | nginx `$upstream_response_time` | Separates app latency from proxy latency | line | n/a |
| Cache hit ratio | `$upstream_cache_status` breakdown | CDN/local cache effectiveness | gauge + stacked area | hit ratio drops |
| TLS handshake time | Log-derived | Crypto overhead, OCSP issues | line | n/a |
| Config reload status | Exporter metric / log | Bad reload takes sites down silently | status dot | last reload failed |

---

## 8. Databases

### 8.1 Postgres

| Metric | What it is | Why it matters | Alert |
|---|---|---|---|
| Active connections / max | `pg_stat_activity` | Connection exhaustion blocks everything | >80% of max |
| Connections by state | active / idle / idle-in-txn / waiting | `idle in transaction` is a deadlock / leak signal | idle-in-txn > N |
| Transactions per second | commits + rollbacks | Workload headline | anomaly |
| Rollback rate | rollbacks / total | App bugs or contention | >5% |
| Cache hit ratio | `heap_blks_hit / (heap_blks_hit + heap_blks_read)` | <95% means buffer pool too small | <95% |
| Slow queries | `pg_stat_statements` top-N | Primary tuning source | table |
| Locks / blocked queries | `pg_locks` + `pg_blocking_pids` | Contention visible live | any > N seconds |
| Replication lag (bytes & seconds) | `pg_stat_replication.replay_lag` | Read-replica freshness | >10s |
| WAL generation rate | `pg_stat_wal` | Capacity & archiving pressure | anomaly |
| Checkpoints (req vs timed) | `pg_stat_bgwriter` | Too many requested = tune `max_wal_size` | requested > timed |
| Deadlocks | `pg_stat_database.deadlocks` | Never "normal" | >0/min |
| Autovacuum status | last vacuum/analyze per table | Bloat prevention | table older than N days |
| Table / index bloat | `pgstattuple` | Long-term health | warn thresholds |
| DB size | `pg_database_size` | Growth trend | growth rate anomaly |

### 8.2 MySQL / MariaDB

| Metric | What it is | Alert |
|---|---|---|
| Threads_connected / max_connections | >80% |
| Queries per second, Slow_queries | anomaly |
| InnoDB buffer pool hit ratio | <99% |
| InnoDB row lock waits | any sustained |
| Replica `Seconds_Behind_Master` | >10s |
| `innodb_log_waits` | >0 |
| Table lock waits / aborted_clients | anomaly |

### 8.3 Redis

| Metric | What it is | Alert |
|---|---|---|
| `used_memory` / `maxmemory` | >80% |
| Ops/sec (`instantaneous_ops_per_sec`) | anomaly |
| Hit / miss ratio (`keyspace_hits` / misses) | hit ratio drop |
| Evicted / expired keys | evictions > 0 on non-cache use |
| Connected clients | >80% of `maxclients` |
| Replication lag / `master_link_status` | lag >5s, link !up |
| Blocked clients | >0 |
| Latency percentiles (`latency-monitor`) | p99 > 10 ms |
| Persistence: last RDB save, AOF status | last save > threshold |

---

## 9. Application-level metrics

If apps emit their own telemetry (StatsD, OpenTelemetry, Prometheus `/metrics`), surface the RED + USE patterns:

| Pattern | Metrics | Why |
|---|---|---|
| **RED** (request-driven services) | Rate, Errors, Duration (p50/p95/p99) per route | Universal service-health view |
| **USE** (resources) | Utilization, Saturation, Errors — for any pool (DB, threadpool, queue) | Finds capacity issues |
| Queue depth & age of oldest item | For background workers / jobs | Backlog visibility |
| Feature flag / build / version | Deployed version, commit SHA | Tie incidents to releases |
| Business KPIs | logins, sign-ups, purchases/hour | Bridges ops and product |
| Custom error rate | Domain-specific failed ops | Users care about this, not 5xx |

Visualization: line with p50/p95/p99, heatmap for duration histograms, bar for queue lengths, version overlay markers on all time series.

---

## 10. Environmental / Hardware

| Metric | What it is | Why it matters | Viz | Alert |
|---|---|---|---|---|
| UPS battery charge % | NUT / apcupsd exporter | Power outage headroom | gauge | <50% when on battery |
| UPS status (online/on-battery/low-battery) | NUT | Triggers graceful shutdown | status dot | on-battery = HIGH, low = CRITICAL |
| UPS estimated runtime | NUT | Time to shutdown | stat | <5 min |
| UPS load % | NUT | Oversubscribed UPS = short runtime | gauge | >80% |
| Line voltage / frequency | NUT | Dirty power | line | outside nominal |
| SMART reallocated / pending sectors | smartctl_exporter | Leading indicator of disk death | counter | any new |
| SMART wearout (SSD/NVMe) | SMART attr 233/177/percentage_used | Plan replacement before failure | gauge | >80% |
| RAID resync progress & health | `/proc/mdstat`, hardware RAID CLI | Visible degradation | status + progress | degraded, resync stuck |
| ECC corrected / uncorrected errors | EDAC | Memory going bad | counter | uncorrected > 0 |
| PSU redundancy status | IPMI / redfish | One PSU dead = no redundancy | status dot | any PSU failed |
| IPMI sensor aggregate | All IPMI sensors vs thresholds | Out-of-band ground truth | table | any sensor out-of-range |

---

## 11. Cost / Resource efficiency

These are derived metrics, built from the ones above, but they deserve their own panel because they answer "where is the money going?"

| Metric | Derivation | Why | Viz |
|---|---|---|---|
| CPU time by service / container | `sum(rate(container_cpu_usage_seconds_total)) by (service)` | Chargeback; find runaway workloads | bar / pie (over long windows) |
| Memory-hours by service | `avg_over_time(container_memory_working_set) * window` | Same, for RAM | bar |
| Bandwidth by service | Per-container network rate | Egress cost often dominates in cloud | bar |
| Bandwidth projection | Linear or trend extrapolation of monthly bytes | "Will I blow the cap?" | line + trend line |
| Storage growth rate (per mount) | `deriv(node_filesystem_used_bytes[7d])` | Predict full-disk date | line + "days until full" stat |
| Days-until-full forecast | `free / growth_rate` | Actionable single number | stat | <14 days = HIGH |
| Power draw cost | `kW * $/kWh` | Real rack cost | stat | n/a |
| Container image size / count | Docker system df | Disk hog attribution | bar | n/a |
| Log storage growth | Size of `/var/log` + Loki bucket | Log leaks silently fill disks | line | n/a |

---

## Minimum Viable Dashboard (15–20 metrics)

If the panel can only display a handful of things on day one, pick these. Ordered by signal-per-pixel for a general Linux server:

1. **CPU usage % (total)** — line + current stat.
2. **Load average (1/5/15m)** — line.
3. **Memory used % (using MemAvailable)** — gauge + stacked area.
4. **Swap in/out rate** — line.
5. **Disk usage % per mount** — gauge per mount, biggest one prominent.
6. **Disk I/O latency (read & write)** — line.
7. **Disk throughput (MB/s)** — line.
8. **Network bandwidth in/out per interface** — line.
9. **TCP retransmits /s** — line.
10. **Uptime + hostname + kernel + last reboot** — info card.
11. **Failed systemd units** — stat (count) + expandable table.
12. **Top 5 processes by CPU and by memory** — two small tables.
13. **Container list with CPU% / mem%** — table (if Docker is present).
14. **SSH failed logins /min + top source IPs** — line + table.
15. **Log volume with error/warn overlay (last 24h)** — line with colored bands, click to tail.
16. **Temperature (hottest CPU/disk sensor)** — stat with color.
17. **SMART + RAID health roll-up** — single status dot that drills down.
18. **Fleet summary tile** (once you have >1 host) — grid of host status dots with CPU / mem / disk sparklines.

Two more if there's an HTTP server present:

19. **HTTP requests/s with 2xx/3xx/4xx/5xx split** — stacked area.
20. **HTTP latency p50 / p95 / p99** — line, three series.

Design principles for that first screen: one "is anything on fire?" banner at the top (counts of alerting metrics), everything else below it, clickable drill-downs to the full catalog panels. Keep the color language consistent — green/amber/red tied to the alert thresholds in this doc, not ad-hoc per panel.

---

## Sources

- [Prometheus Node Exporter — GitHub](https://github.com/prometheus/node_exporter)
- [Prometheus Node Exporter Guide](https://prometheus.io/docs/guides/node-exporter/)
- [Netdata features](https://www.netdata.cloud/features/)
- [Grafana dashboard: Node Exporter Full (1860)](https://grafana.com/grafana/dashboards/1860-node-exporter-full/)
- [Beszel self-hosted monitoring](https://beszel.dev/)
- [Datadog — System integration / key host metrics](https://docs.datadoghq.com/integrations/system/)
- [Datadog — How to collect NGINX metrics](https://www.datadoghq.com/blog/how-to-collect-nginx-metrics/)
- [NGINX Metrics Catalog](https://docs.nginx.com/nginx-instance-manager/monitoring/catalogs/metrics/)
- [Sematext — NGINX monitoring key metrics](https://sematext.com/blog/nginx-monitoring/)
- [PostgreSQL Monitoring wiki](https://wiki.postgresql.org/wiki/Monitoring)
- [DigitalOcean — How to monitor PostgreSQL performance](https://docs.digitalocean.com/products/databases/postgresql/how-to/monitor-databases/)
- [Percona — PostgreSQL replication lag](https://www.percona.com/blog/replication-lag-in-postgresql/)
- [Middleware — PostgreSQL monitoring: key metrics](https://middleware.io/blog/postgresql-monitoring/)
- [fail2ban — GitHub](https://github.com/fail2ban/fail2ban)
- [DigitalOcean — How fail2ban works](https://www.digitalocean.com/community/tutorials/how-fail2ban-works-to-protect-services-on-a-linux-server)
- [Zenarmor — Linux server monitoring, logs and tools](https://www.zenarmor.com/docs/linux-tutorials/linux-server-monitoring-logs-and-tools)
- [SigNoz — Prometheus Node Exporter metrics & alerting](https://signoz.io/guides/prometheus-node-exporter-metrics/)
