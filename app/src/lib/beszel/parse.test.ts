import { describe, expect, it } from 'vitest';
import { parseContainer, parseStatsSample, parseSystem } from './parse';
import systemsFixture from '../../../tests/fixtures/systems.json';
import systemStatsFixture from '../../../tests/fixtures/system_stats.json';
import containersFixture from '../../../tests/fixtures/containers.json';
import realtimeEventFixture from '../../../tests/fixtures/realtime-event.json';

describe('parseSystem', () => {
  it('maps a raw systems record to a SystemRow', () => {
    const raw = systemsFixture[0];
    const row = parseSystem(raw);
    expect(row).toEqual({
      id: 'abc123def456ghi',
      slug: 'bserver',
      name: 'bserver',
      host: 'bserver',
      port: 45876,
      status: 'up',
      cpuCores: 8,
      memGb: 32,
      diskTotalGb: 42.5,
      uptimeSeconds: 1209600,
      kernel: '6.8.0-52-generic',
      os: 'ubuntu 24.04',
      bootTime: 1713312000,
    });
  });

  it('preserves paused status', () => {
    const raw = systemsFixture[2];
    expect(parseSystem(raw).status).toBe('paused');
  });

  it('coerces a string port to a number', () => {
    const raw = systemsFixture[0];
    // port in the Beszel schema arrives as a string; parseSystem must coerce.
    expect(typeof parseSystem(raw).port).toBe('number');
  });
});

describe('parseStatsSample', () => {
  it('maps a raw system_stats item to a StatsSample', () => {
    const raw = systemStatsFixture.items[0];
    const sample = parseStatsSample(raw);
    expect(sample.systemId).toBe('abc123def456ghi');
    expect(sample.cpuPct).toBe(23.5);
    expect(sample.memPct).toBe(48.2);
    expect(sample.diskPct).toBe(42.5);
    expect(sample.netReadBps).toBe(1048576);
    expect(sample.netSentBps).toBe(524288);
    expect(sample.temps).toEqual({
      coretemp_package_id_0: 54.2,
      nvme_composite: 41.0,
    });
  });

  it('converts the created string to an ms timestamp', () => {
    const raw = systemStatsFixture.items[0];
    const sample = parseStatsSample(raw);
    expect(sample.timestamp).toBe(new Date('2026-04-24 11:59:00.000Z').getTime());
  });

  it('returns an empty temps object when the sensor map is missing', () => {
    const raw = systemStatsFixture.items[3];
    const sample = parseStatsSample(raw);
    expect(sample.temps).toEqual({});
  });

  it('parses a realtime event record shape identically', () => {
    const sample = parseStatsSample(realtimeEventFixture.record);
    expect(sample.systemId).toBe('abc123def456ghi');
    expect(sample.cpuPct).toBe(27.8);
  });
});

describe('parseContainer', () => {
  it('maps a raw containers record to a ContainerRow', () => {
    const raw = containersFixture[0];
    const row = parseContainer(raw);
    expect(row).toEqual({
      systemId: 'abc123def456ghi',
      name: 'beszel-hub',
      cpuPct: 2.4,
      memMb: 128.5,
      netReadBps: 4096,
      netSentBps: 2048,
    });
  });

  it('parses all containers in the fixture', () => {
    const rows = containersFixture.map(parseContainer);
    expect(rows).toHaveLength(2);
    expect(rows[1].name).toBe('caddy');
  });
});
