import { describe, expect, it } from 'vitest';
import {
  parseContainer,
  parseContainerStats,
  parseStatsSample,
  parseSystem,
  parseSystemDetails,
} from './parse';
import systemsFixture from '../../../tests/fixtures/systems.json';
import systemDetailsFixture from '../../../tests/fixtures/system_details.json';
import systemStatsFixture from '../../../tests/fixtures/system_stats.json';
import containersFixture from '../../../tests/fixtures/containers.json';
import containerStatsFixture from '../../../tests/fixtures/container_stats.json';
import realtimeEventFixture from '../../../tests/fixtures/realtime-event.json';

// Fixtures are re-captured periodically; assertions lean on the mapping from raw → parsed,
// not on specific numeric values that shift between captures. Where a value IS asserted
// exactly it's because the shape of the mapping (e.g. "string → number coercion") is what's
// being tested.

const rawSystem = systemsFixture[0] as Record<string, unknown>;
const rawSystemInfo = rawSystem.info as Record<string, unknown>;
const SYSTEM_ID = rawSystem.id as string;

describe('parseSystem', () => {
  it('maps a raw systems record to a SystemRow pulling live state from `info`', () => {
    const row = parseSystem(rawSystem);
    expect(row).toEqual({
      id: SYSTEM_ID,
      slug: rawSystem.host,
      name: rawSystem.name,
      host: rawSystem.host,
      port: Number(rawSystem.port),
      status: rawSystem.status,
      uptimeSeconds: rawSystemInfo.u,
      cpuPct: rawSystemInfo.cpu,
      memPct: rawSystemInfo.mp,
      diskPct: rawSystemInfo.dp,
      tempC: rawSystemInfo.t,
      loadAvg: rawSystemInfo.la,
      agentVersion: rawSystemInfo.v,
      containerCount: rawSystemInfo.ct,
      bootTimeOffset: rawSystemInfo.bb,
      lastSeenMs: new Date(String(rawSystem.updated).replace(' ', 'T')).getTime(),
    });
  });

  it('parses lastSeenMs from the `updated` PocketBase column', () => {
    const updatedAt = '2026-04-24 12:00:00.000Z';
    const row = parseSystem({ ...rawSystem, updated: updatedAt });
    expect(row.lastSeenMs).toBe(new Date(updatedAt.replace(' ', 'T')).getTime());
  });

  it('returns NaN for lastSeenMs when `updated` is missing', () => {
    const { updated, ...withoutUpdated } = rawSystem as Record<string, unknown>;
    const row = parseSystem(withoutUpdated);
    expect(Number.isNaN(row.lastSeenMs)).toBe(true);
  });

  it('coerces the string port to a number', () => {
    // Real Beszel stores `port` as a string; the parser must give us a number.
    expect(typeof rawSystem.port).toBe('string');
    expect(typeof parseSystem(rawSystem).port).toBe('number');
  });

  it('accepts the "pending" status when a system is registered but no agent has reported yet', () => {
    const pending = {
      ...rawSystem,
      status: 'pending',
      info: { u: 0, cpu: 0, mp: 0, dp: 0, v: '', bb: 0, la: [0, 0, 0] },
    };
    expect(parseSystem(pending).status).toBe('pending');
  });

  it('falls back to "down" on unknown status strings', () => {
    const unknown = { ...rawSystem, status: 'wat' };
    expect(parseSystem(unknown).status).toBe('down');
  });

  it('returns safe defaults when `info` is missing entirely', () => {
    const bare = { ...rawSystem, info: undefined };
    const row = parseSystem(bare);
    expect(row.uptimeSeconds).toBe(0);
    expect(row.cpuPct).toBe(0);
    expect(row.tempC).toBe(0);
    expect(row.loadAvg).toEqual([0, 0, 0]);
    expect(row.agentVersion).toBe('');
    expect(row.containerCount).toBe(0);
  });
});

describe('parseSystemDetails', () => {
  it('maps a raw system_details record to a SystemDetails', () => {
    const raw = systemDetailsFixture[0] as Record<string, unknown>;
    const details = parseSystemDetails(raw);
    expect(details).toEqual({
      id: raw.id,
      systemId: raw.system,
      hostname: raw.hostname,
      os: raw.os,
      osName: raw.os_name,
      kernel: raw.kernel,
      cpu: raw.cpu,
      arch: raw.arch,
      cores: raw.cores,
      threads: raw.threads,
      memoryBytes: raw.memory,
      podman: raw.podman,
    });
  });

  it('defaults missing fields gracefully', () => {
    const details = parseSystemDetails({ id: 'x', system: 'y' });
    expect(details.hostname).toBe('');
    expect(details.kernel).toBe('');
    expect(details.osName).toBe('');
    expect(details.cores).toBe(0);
    expect(details.memoryBytes).toBe(0);
    expect(details.podman).toBe(false);
  });
});

describe('parseStatsSample', () => {
  const items = systemStatsFixture.items as Array<Record<string, unknown>>;
  const newest = items[0];
  const newestStats = newest.stats as Record<string, unknown>;
  // The earliest captured sample has no `b` top-level key because the first agent push
  // hasn't emitted a rate delta yet. Find it by looking for that absence.
  const rawWithoutB = items.find((s) => !(s.stats as Record<string, unknown>).b);

  it('maps a raw system_stats item to a StatsSample', () => {
    const sample = parseStatsSample(newest);
    expect(sample.systemId).toBe(SYSTEM_ID);
    expect(sample.cpuPct).toBe(newestStats.cpu);
    expect(sample.memPct).toBe(newestStats.mp);
    expect(sample.memTotalGb).toBe(newestStats.m);
    expect(sample.memUsedGb).toBe(newestStats.mu);
    expect(sample.diskPct).toBe(newestStats.dp);
    expect(sample.diskTotalGb).toBe(newestStats.d);
    expect(sample.diskUsedGb).toBe(newestStats.du);
    expect(sample.loadAvg).toEqual(newestStats.la);
    expect(sample.type).toBe(newest.type);
  });

  it('converts the created string to an ms timestamp', () => {
    const sample = parseStatsSample(newest);
    const createdMs = new Date(String(newest.created).replace(' ', 'T')).getTime();
    expect(sample.timestamp).toBe(createdMs);
  });

  it('sources net rates from stats.b when present', () => {
    const b = newestStats.b as [number, number];
    expect(b).toBeDefined();
    const sample = parseStatsSample(newest);
    expect(sample.netSentBps).toBe(b[0]);
    expect(sample.netRecvBps).toBe(b[1]);
  });

  it('falls back to aggregating stats.ni per-interface rates when `b` is absent', () => {
    expect(rawWithoutB).toBeDefined();
    const sample = parseStatsSample(rawWithoutB!);
    // Early-boot sample has zero deltas across all interfaces.
    const ni = (rawWithoutB!.stats as Record<string, unknown>).ni as Record<string, unknown[]>;
    const expectedSent = Object.values(ni).reduce((acc, v) => acc + Number(v[0] ?? 0), 0);
    const expectedRecv = Object.values(ni).reduce((acc, v) => acc + Number(v[1] ?? 0), 0);
    expect(sample.netSentBps).toBe(expectedSent);
    expect(sample.netRecvBps).toBe(expectedRecv);
  });

  it('sums multiple interfaces in ni when `b` is absent', () => {
    const raw = {
      system: SYSTEM_ID,
      created: '2026-04-24 17:10:00.000Z',
      type: '1m',
      stats: {
        cpu: 0,
        m: 0,
        ni: {
          eth0: [10, 20, 0, 0],
          wlan0: [5, 7, 0, 0],
        },
      },
    };
    const sample = parseStatsSample(raw);
    expect(sample.netSentBps).toBe(15);
    expect(sample.netRecvBps).toBe(27);
  });

  it('exposes a `disks` array with the root mount as the first entry', () => {
    const raw = {
      system: SYSTEM_ID,
      created: '2026-04-24 17:10:00.000Z',
      type: '1m',
      stats: { cpu: 0, d: 100, du: 40, dp: 40 },
    };
    const sample = parseStatsSample(raw);
    expect(sample.disks).toHaveLength(1);
    expect(sample.disks[0]).toEqual({
      name: '/',
      totalGb: 100,
      usedGb: 40,
      pct: 40,
    });
  });

  it('parses stats.efs into additional DiskUsage entries, computing pct from du/d', () => {
    const raw = {
      system: SYSTEM_ID,
      created: '2026-04-24 17:10:00.000Z',
      type: '1m',
      stats: {
        cpu: 0,
        d: 229,
        du: 158,
        dp: 73,
        efs: {
          // Real Beszel shape: device name as key, no `dp` field, with
          // optional rb/wb byte-rate fields.
          sda1: { d: 916, du: 0, r: 0, w: 0, rb: 0, wb: 0 },
          'nvme1n1p2': { d: 100, du: 50, r: 0, w: 0, rb: 1024, wb: 2048 },
        },
      },
    };
    const sample = parseStatsSample(raw);
    expect(sample.disks).toHaveLength(3);
    expect(sample.disks[0].name).toBe('/');
    // Extras sort alphabetically by device name.
    expect(sample.disks[1].name).toBe('nvme1n1p2');
    expect(sample.disks[2].name).toBe('sda1');
    expect(sample.disks[1].totalGb).toBe(100);
    expect(sample.disks[1].pct).toBe(50); // computed from 50/100
    expect(sample.disks[2].pct).toBe(0);  // computed from 0/916
    expect(sample.disks[1].readBps).toBe(1024);
    expect(sample.disks[1].writeBps).toBe(2048);
  });

  it('still strips a legacy /hostfs/ prefix from efs keys', () => {
    const raw = {
      system: SYSTEM_ID,
      created: '2026-04-24 17:10:00.000Z',
      type: '1m',
      stats: {
        cpu: 0,
        d: 100,
        du: 40,
        dp: 40,
        efs: { '/hostfs/secondary': { d: 200, du: 50, dp: 25 } },
      },
    };
    const sample = parseStatsSample(raw);
    expect(sample.disks[1].name).toBe('/secondary');
  });

  it('pulls per-sample disk read / write rates from stats.dr and stats.dw', () => {
    const raw = {
      system: SYSTEM_ID,
      created: '2026-04-24 17:10:00.000Z',
      type: '1m',
      stats: { cpu: 0, d: 100, du: 40, dp: 40, dr: 1024, dw: 2048 },
    };
    const sample = parseStatsSample(raw);
    expect(sample.diskReadBps).toBe(1024);
    expect(sample.diskWriteBps).toBe(2048);
  });

  it('parses a realtime event record shape identically to list results', () => {
    const record = realtimeEventFixture.record as Record<string, unknown>;
    const stats = record.stats as Record<string, unknown>;
    const sample = parseStatsSample(record);
    expect(sample.systemId).toBe(record.system);
    expect(sample.cpuPct).toBe(stats.cpu);
    // Realtime record is far enough in the run that `b` is present.
    const b = stats.b as [number, number];
    expect(sample.netSentBps).toBe(b[0]);
    expect(sample.netRecvBps).toBe(b[1]);
  });
});

describe('parseContainer', () => {
  it('maps a raw containers record using the flat schema fields', () => {
    const raw = containersFixture[0] as Record<string, unknown>;
    const row = parseContainer(raw);
    expect(row).toEqual({
      id: raw.id,
      systemId: raw.system,
      name: raw.name,
      image: raw.image,
      ports: raw.ports,
      status: raw.status,
      health: raw.health,
      cpuPct: raw.cpu,
      memMb: raw.memory,
      netBps: raw.net,
    });
  });

  it('parses all containers in the fixture', () => {
    const rows = containersFixture.map(parseContainer);
    expect(rows).toHaveLength(containersFixture.length);
    for (const row of rows) {
      expect(typeof row.name).toBe('string');
      expect(row.name).not.toBe('');
    }
  });
});

describe('parseContainerStats', () => {
  const items = containerStatsFixture.items as Array<Record<string, unknown>>;

  it('maps a raw container_stats sample into a ContainerStatsSample', () => {
    const newest = items[0];
    const stats = newest.stats as Array<Record<string, unknown>>;
    const firstEntry = stats[0];
    const b = firstEntry.b as [number, number] | undefined;

    const sample = parseContainerStats(newest);
    expect(sample.systemId).toBe(newest.system);
    expect(sample.timestamp).toBe(
      new Date(String(newest.created).replace(' ', 'T')).getTime(),
    );
    expect(sample.type).toBe(newest.type);
    expect(sample.containers).toHaveLength(stats.length);
    expect(sample.containers[0]).toMatchObject({
      name: firstEntry.n,
      cpuPct: firstEntry.c,
      memMb: firstEntry.m,
    });
    if (b) {
      expect(sample.containers[0].netSentBps).toBe(b[0]);
      expect(sample.containers[0].netRecvBps).toBe(b[1]);
    }
  });

  it('omits net rates when the entry has no `b` field (early-boot samples)', () => {
    const earliest = items[items.length - 1];
    const entryWithoutB = (earliest.stats as Array<Record<string, unknown>>).find((e) => !e.b);
    expect(entryWithoutB).toBeDefined();
    const sample = parseContainerStats(earliest);
    const parsedEntry = sample.containers.find((c) => c.name === entryWithoutB!.n);
    expect(parsedEntry).toBeDefined();
    expect(parsedEntry!.netSentBps).toBeUndefined();
    expect(parsedEntry!.netRecvBps).toBeUndefined();
  });
});
