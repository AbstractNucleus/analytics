import PocketBase from 'pocketbase';
import {
  parseContainer,
  parseContainerStats,
  parseStatsSample,
  parseSystem,
  parseSystemDetails,
} from './parse';
import type {
  ContainerRow,
  ContainerStatsSample,
  HostSlug,
  StatsSample,
  SystemDetails,
  SystemRow,
  TimeRange,
  Unsubscribe,
} from './types';

export interface BeszelClient {
  listSystems(): Promise<SystemRow[]>;
  getSystem(slug: HostSlug): Promise<SystemRow>;
  getSystemDetails(slug: HostSlug): Promise<SystemDetails>;
  getRecentStats(slug: HostSlug, range: TimeRange): Promise<StatsSample[]>;
  getRecentContainerStats(slug: HostSlug, range: TimeRange): Promise<ContainerStatsSample[]>;
  listContainers(slug: HostSlug): Promise<ContainerRow[]>;
  subscribeStats(slug: HostSlug, handler: (sample: StatsSample) => void): Promise<Unsubscribe>;
  subscribeFleet(handler: (sample: StatsSample) => void): Promise<Unsubscribe>;
}

const RANGE_MS: Record<TimeRange, number> = {
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

/**
 * PocketBase filters want its own date format: "YYYY-MM-DD HH:MM:SS.sssZ". ISO 'T' variant
 * works too on current versions but the space form is what Beszel stores internally.
 */
function pbDate(ms: number): string {
  return new Date(ms).toISOString().replace('T', ' ');
}

function escapeFilterValue(value: string): string {
  return value.replace(/'/g, "\\'");
}

/** Upper bound on a single range fetch. 1 s samples × 24 h = 86 400 — we cap above that. */
const MAX_PER_PAGE = 100_000;

export function createClient(baseUrl: string, apiToken?: string): BeszelClient {
  const pb = new PocketBase(baseUrl);
  if (apiToken) {
    pb.authStore.save(apiToken);
  }

  async function resolveSystemId(slug: HostSlug): Promise<string> {
    const row = await getSystem(slug);
    return row.id;
  }

  async function getSystem(slug: HostSlug): Promise<SystemRow> {
    const raw = await pb
      .collection('systems')
      .getFirstListItem(`host = '${escapeFilterValue(slug)}'`);
    return parseSystem(raw);
  }

  async function getSystemDetails(slug: HostSlug): Promise<SystemDetails> {
    const systemId = await resolveSystemId(slug);
    const raw = await pb
      .collection('system_details')
      .getFirstListItem(`system = '${escapeFilterValue(systemId)}'`);
    return parseSystemDetails(raw);
  }

  async function listSystems(): Promise<SystemRow[]> {
    const raw = await pb.collection('systems').getFullList();
    return (raw as unknown[]).map(parseSystem);
  }

  async function getRecentStats(slug: HostSlug, range: TimeRange): Promise<StatsSample[]> {
    const systemId = await resolveSystemId(slug);
    const sinceMs = Date.now() - RANGE_MS[range];
    const filter = `system = '${escapeFilterValue(systemId)}' && created >= '${pbDate(sinceMs)}'`;
    const result = await pb
      .collection('system_stats')
      .getList(1, MAX_PER_PAGE, { filter, sort: 'created' });
    return (result.items as unknown[]).map(parseStatsSample);
  }

  async function getRecentContainerStats(
    slug: HostSlug,
    range: TimeRange,
  ): Promise<ContainerStatsSample[]> {
    const systemId = await resolveSystemId(slug);
    const sinceMs = Date.now() - RANGE_MS[range];
    const filter = `system = '${escapeFilterValue(systemId)}' && created >= '${pbDate(sinceMs)}'`;
    const result = await pb
      .collection('container_stats')
      .getList(1, MAX_PER_PAGE, { filter, sort: 'created' });
    return (result.items as unknown[]).map(parseContainerStats);
  }

  async function listContainers(slug: HostSlug): Promise<ContainerRow[]> {
    const systemId = await resolveSystemId(slug);
    const raw = await pb
      .collection('containers')
      .getFullList({ filter: `system = '${escapeFilterValue(systemId)}'` });
    return (raw as unknown[]).map(parseContainer);
  }

  async function subscribeStats(
    slug: HostSlug,
    handler: (sample: StatsSample) => void,
  ): Promise<Unsubscribe> {
    const systemId = await resolveSystemId(slug);
    const unsub = await pb.collection('system_stats').subscribe(
      '*',
      (data: { action: string; record: unknown }) => {
        handler(parseStatsSample(data.record));
      },
      { filter: `system = '${escapeFilterValue(systemId)}'` },
    );
    return () => {
      void unsub();
    };
  }

  async function subscribeFleet(
    handler: (sample: StatsSample) => void,
  ): Promise<Unsubscribe> {
    const unsub = await pb
      .collection('system_stats')
      .subscribe('*', (data: { action: string; record: unknown }) => {
        handler(parseStatsSample(data.record));
      });
    return () => {
      void unsub();
    };
  }

  return {
    listSystems,
    getSystem,
    getSystemDetails,
    getRecentStats,
    getRecentContainerStats,
    listContainers,
    subscribeStats,
    subscribeFleet,
  };
}
