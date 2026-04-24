import type { ContainerRow, StatsSample, SystemRow, SystemStatus } from './types';

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

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function statusOf(value: unknown): SystemStatus {
  return value === 'up' || value === 'down' || value === 'paused' ? value : 'down';
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
    cpuCores: num(info.cpu),
    memGb: num(info.m),
    diskTotalGb: num(info.dt),
    uptimeSeconds: num(info.u),
    kernel: str(info.k),
    os: str(info.os),
    bootTime: num(info.b),
  };
}

export function parseStatsSample(raw: unknown): StatsSample {
  const r = obj(raw);
  const stats = obj(r.stats);
  const tempsRaw = obj(stats.t);
  const temps: Record<string, number> = {};
  for (const [key, value] of Object.entries(tempsRaw)) {
    const n = num(value, NaN);
    if (Number.isFinite(n)) temps[key] = n;
  }
  return {
    systemId: str(r.system),
    timestamp: toMs(r.created),
    cpuPct: num(stats.cpu),
    memPct: num(stats.mem),
    diskPct: num(stats.disk),
    netReadBps: num(stats.nr),
    netSentBps: num(stats.ns),
    temps,
  };
}

export function parseContainer(raw: unknown): ContainerRow {
  const r = obj(raw);
  const stats = obj(r.stats);
  return {
    systemId: str(r.system),
    name: str(r.name),
    cpuPct: num(stats.cpu),
    memMb: num(stats.mem),
    netReadBps: num(stats.nr),
    netSentBps: num(stats.ns),
  };
}
