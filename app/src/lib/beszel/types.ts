export type HostSlug = string;

export type SystemStatus = 'up' | 'down' | 'paused';

export interface SystemRow {
  id: string;
  slug: HostSlug;
  name: string;
  host: string;
  port: number;
  status: SystemStatus;
  cpuCores: number;
  memGb: number;
  uptimeSeconds: number;
  kernel: string;
  os: string;
  bootTime: number;
}

export interface StatsSample {
  systemId: string;
  timestamp: number;
  cpuPct: number;
  memPct: number;
  diskPct: number;
  netReadBps: number;
  netSentBps: number;
  temps: Record<string, number>;
}

export interface ContainerRow {
  systemId: string;
  name: string;
  cpuPct: number;
  memMb: number;
  netReadBps: number;
  netSentBps: number;
}

export type Unsubscribe = () => void;

/** Time window for getRecentStats. Matches the shared timeRange label vocabulary. */
export type TimeRange = '1h' | '24h' | '7d' | '30d';
