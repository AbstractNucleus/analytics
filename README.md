# analytics

A fleet-monitoring dashboard for a personal homelab. Custom [SvelteKit](https://kit.svelte.dev/) frontend on top of [Beszel](https://github.com/henrygd/beszel), designed to run tailnet-only via [Tailscale](https://tailscale.com/).

Published for reference. The `deploy/` folder shows how I run it, but expect to read code, not follow polished steps.

## What it shows

- **Fleet view:** one row per host: status, hostname, OS + arch, uptime, CPU sparkline, memory %, disk %, network in/out, last-seen indicator. Rows live-update at ~1 Hz.
- **Per-host page:** CPU (line chart + per-core heatmap + load average + PSI when available), memory (used vs `MemAvailable` + swap + cache/buffers), disk (per-mount %, IOPS, queue depth, latency), network (per-interface bandwidth, packets/s, errors/drops), temperatures (CPU/GPU/NVMe). All charts share a 1h / 24h / 7d / 30d time-range toggle.
- **Containers panel:** per-host Docker container CPU, memory, and network, when the agent has access to the Docker socket.
- **Theme toggle:** light/dark, follows `prefers-color-scheme` on first load, persists to `localStorage`.

## Built with

- SvelteKit (adapter-node) frontend, uPlot for charts.
- Beszel hub (PocketBase) for metric collection; `beszel-agent` on each host pushes over the tailnet.
- nginx ingress bound to a Tailscale IP, TLS via Let's Encrypt with the Cloudflare DNS-01 challenge.
- Docker Compose for the hub + frontend; agents run as native systemd / Windows services.

## Running it locally

```sh
cp deploy/.env.example deploy/.env
docker compose -f deploy/docker-compose.dev.yml up
```

## License

[MIT](LICENSE).
