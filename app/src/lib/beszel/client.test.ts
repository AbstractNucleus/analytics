import { beforeEach, describe, expect, it, vi } from 'vitest';
import systemsFixture from '../../../tests/fixtures/systems.json';
import systemStatsFixture from '../../../tests/fixtures/system_stats.json';
import realtimeEventFixture from '../../../tests/fixtures/realtime-event.json';

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
    // `this` is the new-instance; attach the stub methods.
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
  // subscribe resolves to an async unsubscribe function by default.
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
    expect(typeof client.getRecentStats).toBe('function');
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
      expect(rows).toHaveLength(3);
      expect(rows[0]).toMatchObject({ id: 'abc123def456ghi', slug: 'bserver', port: 45876 });
    });
  });

  describe('getSystem', () => {
    it('looks up a system by host (slug) and returns a parsed SystemRow', async () => {
      getFirstListItemSpy.mockResolvedValue(systemsFixture[1]);
      const client = createClient('http://localhost:8090');
      const row = await client.getSystem('laptop');
      expect(collectionSpy).toHaveBeenCalledWith('systems');
      expect(getFirstListItemSpy).toHaveBeenCalled();
      const [filterArg] = getFirstListItemSpy.mock.calls[0];
      expect(filterArg).toContain('host');
      expect(filterArg).toContain('laptop');
      expect(row.slug).toBe('laptop');
      expect(row.cpuCores).toBe(16);
    });
  });

  describe('getRecentStats', () => {
    it('queries system_stats with a filter bound to the resolved system id and time range', async () => {
      // getSystem call that getRecentStats performs internally
      getFirstListItemSpy.mockResolvedValue(systemsFixture[0]);
      getListSpy.mockResolvedValue(systemStatsFixture);
      const client = createClient('http://localhost:8090');
      const samples = await client.getRecentStats('bserver', '1h');
      expect(collectionSpy).toHaveBeenCalledWith('system_stats');
      expect(getListSpy).toHaveBeenCalled();
      const [, , opts] = getListSpy.mock.calls[0];
      expect(opts.filter).toContain("system = 'abc123def456ghi'");
      expect(opts.filter).toContain('created >=');
      expect(samples).toHaveLength(5);
      expect(samples[0]).toMatchObject({ systemId: 'abc123def456ghi', cpuPct: 23.5 });
    });
  });

  describe('subscribeStats', () => {
    it('subscribes with a filter limiting events to the host and forwards parsed samples', async () => {
      getFirstListItemSpy.mockResolvedValue(systemsFixture[0]);
      const client = createClient('http://localhost:8090');
      const handler = vi.fn();
      const unsub = await client.subscribeStats('bserver', handler);

      expect(collectionSpy).toHaveBeenCalledWith('system_stats');
      expect(subscribeSpy).toHaveBeenCalled();
      const [topicArg, cbArg, optsArg] = subscribeSpy.mock.calls[0];
      expect(topicArg).toBe('*');
      // filter narrows to the resolved system id
      expect(optsArg?.filter ?? '').toContain("system = 'abc123def456ghi'");

      // Simulate an incoming event: PocketBase invokes the callback with { action, record }
      cbArg({ action: 'create', record: realtimeEventFixture.record });
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0]).toMatchObject({
        systemId: 'abc123def456ghi',
        cpuPct: 27.8,
      });

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
        expect.objectContaining({ systemId: 'abc123def456ghi', cpuPct: 27.8 }),
      );

      unsub();
      expect(unsubscribeMock).toHaveBeenCalled();
    });
  });
});
