import type { MemoryOverview } from '@/lib/memory/domain/types';

import { listBrowserSources, fetchBrowserHistory, type BrowserSource } from '@/lib/browser-history';
import {
  getMemoryDatabase,
  type MemoryDatabase,
  type MemoryDatabaseSession,
} from '@/lib/memory/db/client';
import {
  loadAllVisits,
  loadMemoryOverview,
  loadSessionBundles,
  loadSyncCursors,
  pruneVisitsOlderThan,
  saveSessionInsight,
  syncSessions,
  upsertSyncState,
  upsertVisits,
} from '@/lib/memory/db/repositories/index';
import { getMemorySettings } from '@/lib/memory/domain/settings';
import { generateSessionInsight } from '@/lib/memory/enrichment/insight-generation';
import { normalizeVisit } from '@/lib/memory/ingestion/canonicalize';
import { sessionizeVisits } from '@/lib/memory/ingestion/sessionize';

type SyncDependencies = {
  db?: MemoryDatabase;
  listSources?: typeof listBrowserSources;
  fetchHistory?: typeof fetchBrowserHistory;
  getCerebrasApiKey?: () => Promise<string>;
  now?: () => number;
};

const DEFAULT_SYNC_LIMIT_PER_SOURCE = 1_000;

export type MemoryEnrichmentStatus = 'idle' | 'missing-api-key' | 'complete' | 'failed';

export type SyncMemoryResult = {
  overview: MemoryOverview;
  enrichmentStatus: MemoryEnrichmentStatus;
  enrichmentError: string | null;
};

export async function syncMemory(dependencies: SyncDependencies = {}): Promise<SyncMemoryResult> {
  const db = dependencies.db ?? (await getMemoryDatabase());
  const listSourcesImpl = dependencies.listSources ?? listBrowserSources;
  const fetchHistoryImpl = dependencies.fetchHistory ?? fetchBrowserHistory;
  const now = dependencies.now ?? Date.now;

  const [sources, settings, cursors] = await Promise.all([
    listSourcesImpl(),
    getMemorySettings(db),
    loadSyncCursors(db),
  ]);

  if (!settings.enabled) {
    return {
      overview: await loadMemoryOverview(sources, db),
      enrichmentStatus: 'idle',
      enrichmentError: null,
    };
  }

  const response = await fetchHistoryImpl({
    cursors,
    limitPerSource: DEFAULT_SYNC_LIMIT_PER_SOURCE,
  });
  const importedAtMs = response.fetchedAtMs ?? now();
  const normalizedVisits = response.records
    .map((record) => normalizeVisit(record, settings, importedAtMs))
    .filter((record) => record !== null);

  await upsertVisits(normalizedVisits, db);
  await upsertSyncState(response.nextCursors, importedAtMs, db);
  await pruneVisitsOlderThan(importedAtMs - settings.retentionDays * 24 * 60 * 60 * 1000, db);
  const allVisits = await loadAllVisits(db);
  const sessions = sessionizeVisits(allVisits, settings);
  await syncSessions(sessions, db);

  let enrichmentStatus: MemoryEnrichmentStatus = 'idle';
  let enrichmentError: string | null = null;

  if (settings.autoEnrich) {
    const cerebrasApiKey = (
      await (dependencies.getCerebrasApiKey?.() ?? Promise.resolve(''))
    ).trim();

    if (!cerebrasApiKey) {
      enrichmentStatus = 'missing-api-key';
    } else {
      try {
        await enrichSessions(cerebrasApiKey, db);
        enrichmentStatus = 'complete';
      } catch (error) {
        enrichmentStatus = 'failed';
        enrichmentError = stringifyError(error, 'Unable to refresh session insights');
      }
    }
  }

  return {
    overview: await loadMemoryOverview(sources, db),
    enrichmentStatus,
    enrichmentError,
  };
}

export async function getMemoryOverview(
  db?: MemoryDatabaseSession,
  sources?: BrowserSource[],
): Promise<MemoryOverview> {
  const resolvedDb = db ?? (await getMemoryDatabase());
  const resolvedSources = sources ?? (await listBrowserSources());
  return loadMemoryOverview(resolvedSources, resolvedDb);
}

async function enrichSessions(cerebrasApiKey: string, db: MemoryDatabaseSession): Promise<void> {
  const sessionBundles = await loadSessionBundles(db);

  for (const bundle of sessionBundles) {
    if (bundle.insight) {
      continue;
    }

    const session = {
      ...bundle.session,
      visits: [],
    };
    const insight = await generateSessionInsight(session, cerebrasApiKey);
    await saveSessionInsight(insight, db);
  }
}

function stringifyError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}
