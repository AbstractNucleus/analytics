export type HostSlug = string;

export type SystemStatus = 'up' | 'down' | 'paused' | 'pending';

/**
 * `systems` row: identity + live runtime state.
 *
 * Static hardware / OS descriptors (kernel, memory total, CPU descriptor, OS
 * name, architecture, core count, etc.) are NOT here — they live in the
 * `system_details` collection. See {@link SystemDetails}.
 */
export interface SystemRow {
  id: string;
  /** URL slug for the host. Derived from the `host` field. */
  slug: HostSlug;
  name: string;
  host: string;
  port: number;
  status: SystemStatus;
  uptimeSeconds: number;
  cpuPct: number;
  memPct: number;
  diskPct: number;
  /** Aggregate temperature reading in °C. 0 when no sensors are reported. */
  tempC: number;
  /** Load average: 1m / 5m / 15m. */
  loadAvg: [number, number, number];
  agentVersion: string;
  containerCount: number;
  /**
   * `info.bb` from the real schema. Semantics are not documented upstream —
   * Beszel source suggests a boot-boundary flag / offset. Preserved as-is so
   * downstream consumers don't lose information, but the per-host view does
   * not currently surface it.
   */
  bootTimeOffset: number;
  /**
   * Wall-clock timestamp (ms since epoch) of the most recent agent push the
   * hub has seen for this system. Sourced from PocketBase's auto-tracked
   * `updated` column on the `systems` row.
   */
  lastSeenMs: number;
}

/**
 * `system_details` row: static hardware / OS descriptors. One row per system,
 * sharing its id with the related `systems` row.
 */
export interface SystemDetails {
  id: string;
  /** FK into {@link SystemRow.id}. */
  systemId: string;
  hostname: string;
  /** Beszel's numeric OS enum. Display via {@link osName}. */
  os: number;
  osName: string;
  kernel: string;
  /** Human-readable CPU descriptor, e.g. `"AMD Ryzen 5 5600X 6-Core Processor"`. */
  cpu: string;
  arch: string;
  cores: number;
  threads: number;
  memoryBytes: number;
  podman: boolean;
}

/**
 * One filesystem in a {@link StatsSample}. The first entry of `disks` is the
 * root mount (synthesised from the legacy `stats.d / .du / .dp` triple); the
 * rest come from `stats.efs` (extra filesystems — only populated when the
 * agent is configured with `EXTRA_FILESYSTEMS=/path[,…]`).
 */
export interface DiskUsage {
  /** Mount point or display label, e.g. `"/"` or `"/secondary"`. */
  name: string;
  totalGb: number;
  usedGb: number;
  /** Percentage used, 0..100. */
  pct: number;
  /** Bytes/sec read rate, if the agent reports per-disk I/O. Otherwise undefined. */
  readBps?: number;
  /** Bytes/sec write rate, if the agent reports per-disk I/O. Otherwise undefined. */
  writeBps?: number;
}

export interface StatsSample {
  systemId: string;
  timestamp: number;
  /** Rollup bucket: `"1m" | "10m" | "20m" | "120m" | "480m"`. */
  type: string;
  cpuPct: number;
  memPct: number;
  memTotalGb: number;
  memUsedGb: number;
  /**
   * Root mount usage % — same as `disks[0].pct`. Kept flat for back-compat with
   * components that only need a single headline disk metric (e.g. the host
   * hero ribbon). New code should prefer iterating `disks`.
   */
  diskPct: number;
  diskTotalGb: number;
  diskUsedGb: number;
  /**
   * All reported filesystems. `disks[0]` is the root mount; subsequent entries
   * are extras from `stats.efs`. Always at least length 1 (the root).
   */
  disks: DiskUsage[];
  /** Bytes/sec read rate on the root disk (`stats.dr`), if reported. */
  diskReadBps: number;
  /** Bytes/sec write rate on the root disk (`stats.dw`), if reported. */
  diskWriteBps: number;
  loadAvg: [number, number, number];
  /**
   * Aggregate send-bytes-per-second across all interfaces. Sourced from
   * `stats.b[0]` when present, otherwise summed across `stats.ni[iface][0]`.
   */
  netSentBps: number;
  /** Aggregate recv-bytes-per-second. `stats.b[1]` or sum of `stats.ni[iface][1]`. */
  netRecvBps: number;
}

export interface ContainerRow {
  id: string;
  systemId: string;
  name: string;
  image: string;
  ports: string;
  /** Human-readable status string from Docker, e.g. `"Up 35 seconds"`. */
  status: string;
  /** Docker health-check state as a numeric code (0 = none / unknown). */
  health: number;
  cpuPct: number;
  memMb: number;
  /** Aggregate network throughput (bytes/s) as exposed by the hub. */
  netBps: number;
}

export interface ContainerStatsEntry {
  name: string;
  cpuPct: number;
  memMb: number;
  /** Optional — only present from the second rollup tick onward. */
  netSentBps?: number;
  netRecvBps?: number;
}

export interface ContainerStatsSample {
  id: string;
  systemId: string;
  timestamp: number;
  type: string;
  containers: ContainerStatsEntry[];
}

export type Unsubscribe = () => void;

/** Time window for getRecentStats. Matches the shared timeRange label vocabulary. */
export type TimeRange = '1h' | '24h' | '7d' | '30d';
