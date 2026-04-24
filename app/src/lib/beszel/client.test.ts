import { beforeEach, describe, expect, it, vi } from 'vitest';
import systemsFixture from '../../../tests/fixtures/systems.json';
import systemDetailsFixture from '../../../tests/fixtures/system_details.json';
import systemStatsFixture from '../../../tests/fixtures/system_stats.json';
import containersFixture from '../../../tests/fixtures/containers.json';
import containerStatsFixture from '../../../tests/fixtures/container_stats.json';
import realtimeEventFixture from '../../../tests/fixtures/realtime-event.json';

const rawSystem = systemsFixture[0] as Record<string, unknown>;
const SYSTEM_ID = rawSystem.id as string;
const SYSTEM_HOST = rawSystem.host as string;

// Per-test collection-method spies, reassigned by the mock factory each time the test calls
// `new PocketBase(...)`. We keep them at module scope so test bodies can assert against them.
const collectionSpy = vi.fn();
const getFullListSpy = vi.fn();
const getListSpy = vi.fn();
const getOneSpy = vi.fn();
const getFirstListItemSpy = vi.fn();
const subscribeSpy = vi.fn();
const unsubscribeMock = vi.fn();
const authStoreSaveSpy = vi.fn();

vi.mock('pocketbase', () => {
  const PocketBase = vi.fn().mockImplementation(function MockPB(this: unknown) {
    Object.assign(this as object, {
      authStore: { save: authStoreSaveSpy },
      collection: collectionSpy,
    });
  });
  return { default: PocketBase };
});

// Import after vi.mock so the mocked module is used.
import { createClient } from './client';

function resetSpies() {
  collectionSpy.mockReset();
  getFullListSpy.mockReset();
  getListSpy.mockReset();
  getOneSpy.mockReset();
  getFirstListItemSpy.mockReset();
  subscribeSpy.mockReset();
  unsubscribeMock.mockReset();
  authStoreSaveSpy.mockReset();

  collectionSpy.mockImplementation(() => ({
    getFullList: getFullListSpy,
    getList: getListSpy,
    getOne: getOneSpy,
    getFirstListItem: getFirstListItemSpy,
    subscribe: subscribeSpy,
  }));
  subscribeSpy.mockResolvedValue(unsubscribeMock);
}

describe('createClient', () => {
  beforeEach(() => {
    resetSpies();
  });

  it('returns the documented client surface', () => {
    const client = createClient('http://localhost:8090');
    expect(typeof client.listSystems).toBe('function');
    expect(typeof client.getSystem).toBe('function');
    expect(typeof client.getSystemDetails).toBe('function');
    expect(typeof client.getRecentStats).toBe('function');
    expect(typeof client.getRecentContainerStats).toBe('function');
    expect(typeof client.listContainers).toBe('function');
    expect(typeof client.subscribeStats).toBe('function');
    expect(typeof client.subscribeFleet).toBe('function');
  });

  it('saves the api token on the authStore when provided', () => {
    createClient('http://localhost:8090', 'tok_xyz');
    expect(authStoreSaveSpy).toHaveBeenCalledWith('tok_xyz');
  });

  it('does not touch authStore when no token is provided', () => {
    createClient('http://localhost:8090');
    expect(authStoreSaveSpy).not.toHaveBeenCalled();
  });

  describe('listSystems', () => {
    it('fetches the systems collection and returns parsed SystemRows', async () => {
      getFullListSpy.mockResolvedValue(systemsFixture);
      const client = createClient('http://localhost:8090');
      const rows = await client.listSystems();
      expect(collectionSpy).toHaveBeenCalledWith('systems');
      expect(getFullListSpy).toHaveBeenCalled();
      expect(rows).toHaveLength(systemsFixture.length);
      expect(rows[0]).toMatchObject({ id: SYSTEM_ID, slug: SYSTEM_HOST });
    });
  });

  describe('getSystem', () => {
    it('looks up a system by host (slug) and returns a parsed SystemRow', async () => {
      getFirstListItemSpy.mockResolvedValue(rawSystem);
      const client = createClient('http://localhost:8090');
      const row = await client.getSystem(SYSTEM_HOST);
      expect(collectionSpy).toHaveBeenCalledWith('systems');
      expect(getFirstListItemSpy).toHaveBeenCalled();
      const [filterArg] = getFirstListItemSpy.mock.calls[0];
      expect(filterArg).toContain('host');
      expect(filterArg).toContain(SYSTEM_HOST);
      expect(row.slug).toBe(SYSTEM_HOST);
      expect(row.id).toBe(SYSTEM_ID);
    });
  });

  describe('getSystemDetails', () => {
    it('resolves the system id then fetches the matching system_details row', async () => {
      // First call (getSystem) resolves via systems collection; then system_details lookup by FK.
      getFirstListItemSpy
        .mockResolvedValueOnce(rawSystem) // for getSystem
        .mockResolvedValueOnce(systemDetailsFixture[0]); // for system_details by system fk
      const client = createClient('http://localhost:8090');
      const details = await client.getSystemDetails(SYSTEM_HOST);

      expect(collectionSpy).toHaveBeenCalledWith('systems');
      expect(collectionSpy).toHaveBeenCalledWith('system_details');
      expect(getFirstListItemSpy).toHaveBeenCalledTimes(2);
      const [secondFilter] = getFirstListItemSpy.mock.calls[1];
      expect(secondFilter).toContain('system');
      expect(secondFilter).toContain(SYSTEM_ID);
      expect(details.systemId).toBe(SYSTEM_ID);
      expect(details.hostname).toBe(systemDetailsFixture[0].hostname);
      expect(details.kernel).toBe(systemDetailsFixture[0].kernel);
    });
  });

  describe('getRecentStats', () => {
    it('queries system_stats with a filter bound to the resolved system id and time range', async () => {
      getFirstListItemSpy.mockResolvedValue(rawSystem);
      getListSpy.mockResolvedValue(systemStatsFixture);
      const client = createClient('http://localhost:8090');
      const samples = await client.getRecentStats(SYSTEM_HOST, '1h');
      expect(collectionSpy).toHaveBeenCalledWith('system_stats');
      expect(getListSpy).toHaveBeenCalled();
      const [, , opts] = getListSpy.mock.calls[0];
      expect(opts.filter).toContain(`system = '${SYSTEM_ID}'`);
      expect(opts.filter).toContain('created >=');
      expect(samples).toHaveLength(systemStatsFixture.items.length);
      expect(samples[0]).toMatchObject({ systemId: SYSTEM_ID });
    });
  });

  describe('getRecentContainerStats', () => {
    it('queries container_stats with a filter bound to the resolved system id and time range', async () => {
      getFirstListItemSpy.mockResolvedValue(rawSystem);
      getListSpy.mockResolvedValue(containerStatsFixture);
      const client = createClient('http://localhost:8090');
      const samples = await client.getRecentContainerStats(SYSTEM_HOST, '1h');
      expect(collectionSpy).toHaveBeenCalledWith('container_stats');
      expect(getListSpy).toHaveBeenCalled();
      const [, , opts] = getListSpy.mock.calls[0];
      expect(opts.filter).toContain(`system = '${SYSTEM_ID}'`);
      expect(opts.filter).toContain('created >=');
      expect(samples).toHaveLength(containerStatsFixture.items.length);
      expect(samples[0].systemId).toBe(SYSTEM_ID);
      expect(Array.isArray(samples[0].containers)).toBe(true);
    });
  });

  describe('listContainers', () => {
    it('fetches containers scoped to the resolved system id', async () => {
      getFirstListItemSpy.mockResolvedValue(rawSystem);
      getFullListSpy.mockResolvedValue(containersFixture);
      const client = createClient('http://localhost:8090');
      const rows = await client.listContainers(SYSTEM_HOST);
      expect(collectionSpy).toHaveBeenCalledWith('containers');
      const [opts] = getFullListSpy.mock.calls[0];
      expect(opts.filter).toContain(`system = '${SYSTEM_ID}'`);
      expect(rows).toHaveLength(containersFixture.length);
    });
  });

  describe('subscribeStats', () => {
    it('subscribes with a filter limiting events to the host and forwards parsed samples', async () => {
      getFirstListItemSpy.mockResolvedValue(rawSystem);
      const client = createClient('http://localhost:8090');
      const handler = vi.fn();
      const unsub = await client.subscribeStats(SYSTEM_HOST, handler);

      expect(collectionSpy).toHaveBeenCalledWith('system_stats');
      expect(subscribeSpy).toHaveBeenCalled();
      const [topicArg, cbArg, optsArg] = subscribeSpy.mock.calls[0];
      expect(topicArg).toBe('*');
      expect(optsArg?.filter ?? '').toContain(`system = '${SYSTEM_ID}'`);

      cbArg({ action: 'create', record: realtimeEventFixture.record });
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0]).toMatchObject({ systemId: SYSTEM_ID });

      expect(typeof unsub).toBe('function');
      unsub();
      expect(unsubscribeMock).toHaveBeenCalled();
    });
  });

  describe('subscribeFleet', () => {
    it('subscribes to all system_stats events and forwards parsed samples unfiltered', async () => {
      const client = createClient('http://localhost:8090');
      const handler = vi.fn();
      const unsub = await client.subscribeFleet(handler);

      expect(collectionSpy).toHaveBeenCalledWith('system_stats');
      expect(subscribeSpy).toHaveBeenCalled();
      const [topicArg, cbArg] = subscribeSpy.mock.calls[0];
      expect(topicArg).toBe('*');

      cbArg({ action: 'update', record: realtimeEventFixture.record });
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ systemId: SYSTEM_ID }),
      );

      unsub();
      expect(unsubscribeMock).toHaveBeenCalled();
    });
  });
});
