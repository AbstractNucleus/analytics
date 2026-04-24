import type {
  ContainerRow,
  ContainerStatsEntry,
  ContainerStatsSample,
  StatsSample,
  SystemDetails,
  SystemRow,
  SystemStatus,
} from './types';

function num(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function bool(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function statusOf(value: unknown): SystemStatus {
  return value === 'up' || value === 'down' || value === 'paused' || value === 'pending'
    ? value
    : 'down';
}

function loadAvg(value: unknown): [number, number, number] {
  const raw = arr(value);
  return [num(raw[0]), num(raw[1]), num(raw[2])];
}

/**
 * Beszel stores timestamps as PocketBase strings like "2026-04-24 11:59:00.000Z".
 * `new Date(...)` accepts both the space and 'T' variants in V8; normalize to 'T' so any
 * stricter engine downstream (or a future typed-model consumer) still gets a valid ISO string.
 */
function toMs(value: unknown): number {
  if (typeof value !== 'string') return NaN;
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  return new Date(normalized).getTime();
}

export function parseSystem(raw: unknown): SystemRow {
  const r = obj(raw);
  const info = obj(r.info);
  const host = str(r.host);
  return {
    id: str(r.id),
    slug: host,
    name: str(r.name),
    host,
    port: num(r.port),
    status: statusOf(r.status),
    uptimeSeconds: num(info.u),
    cpuPct: num(info.cpu),
    memPct: num(info.mp),
    diskPct: num(info.dp),
    tempC: num(info.t),
    loadAvg: loadAvg(info.la),
    agentVersion: str(info.v),
    containerCount: num(info.ct),
    bootTimeOffset: num(info.bb),
  };
}

export function parseSystemDetails(raw: unknown): SystemDetails {
  const r = obj(raw);
  return {
    id: str(r.id),
    systemId: str(r.system),
    hostname: str(r.hostname),
    os: num(r.os),
    osName: str(r.os_name),
    kernel: str(r.kernel),
    cpu: str(r.cpu),
    arch: str(r.arch),
    cores: num(r.cores),
    threads: num(r.threads),
    memoryBytes: num(r.memory),
    podman: bool(r.podman),
  };
}

/**
 * Each `stats.ni[iface]` is a 4-tuple `[sent_bps, recv_bps, sent_total, recv_total]`.
 * Early-boot samples don't populate rate deltas yet; the totals still grow.
 */
function sumInterfaceRates(ni: unknown): { sent: number; recv: number } {
  const map = obj(ni);
  let sent = 0;
  let recv = 0;
  for (const value of Object.values(map)) {
    const tuple = arr(value);
    sent += num(tuple[0]);
    recv += num(tuple[1]);
  }
  return { sent, recv };
}

export function parseStatsSample(raw: unknown): StatsSample {
  const r = obj(raw);
  const stats = obj(r.stats);
  const b = arr(stats.b);
  const haveB = b.length >= 2;
  const { sent: sentFromNi, recv: recvFromNi } = sumInterfaceRates(stats.ni);
  return {
    systemId: str(r.system),
    timestamp: toMs(r.created),
    type: str(r.type),
    cpuPct: num(stats.cpu),
    memPct: num(stats.mp),
    memTotalGb: num(stats.m),
    memUsedGb: num(stats.mu),
    diskPct: num(stats.dp),
    diskTotalGb: num(stats.d),
    diskUsedGb: num(stats.du),
    loadAvg: loadAvg(stats.la),
    netSentBps: haveB ? num(b[0]) : sentFromNi,
    netRecvBps: haveB ? num(b[1]) : recvFromNi,
  };
}

export function parseContainer(raw: unknown): ContainerRow {
  const r = obj(raw);
  return {
    id: str(r.id),
    systemId: str(r.system),
    name: str(r.name),
    image: str(r.image),
    ports: str(r.ports),
    status: str(r.status),
    health: num(r.health),
    cpuPct: num(r.cpu),
    memMb: num(r.memory),
    netBps: num(r.net),
  };
}

function parseContainerStatsEntry(raw: unknown): ContainerStatsEntry {
  const r = obj(raw);
  const b = arr(r.b);
  const entry: ContainerStatsEntry = {
    name: str(r.n),
    cpuPct: num(r.c),
    memMb: num(r.m),
  };
  if (b.length >= 2) {
    entry.netSentBps = num(b[0]);
    entry.netRecvBps = num(b[1]);
  }
  return entry;
}

export function parseContainerStats(raw: unknown): ContainerStatsSample {
  const r = obj(raw);
  const stats = arr(r.stats);
  return {
    id: str(r.id),
    systemId: str(r.system),
    timestamp: toMs(r.created),
    type: str(r.type),
    containers: stats.map(parseContainerStatsEntry),
  };
}
