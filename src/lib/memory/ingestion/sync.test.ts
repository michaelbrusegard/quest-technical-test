import { describe, expect, it } from 'vitest';

import type {
  BrowserSource,
  FetchHistoryResponse,
  StandardHistoryVisit,
} from '@/lib/browser-history';

import { loadSessionBundles, loadSyncCursors } from '@/lib/memory/db/repositories/index';
import { saveMemorySettings } from '@/lib/memory/domain/settings';
import { syncMemory } from '@/lib/memory/ingestion/sync';
import { createTestMemoryDatabase } from '@/lib/memory/testing/test-helpers';

const sources: BrowserSource[] = [
  {
    sourceId: 'chrome-default',
    browserFamily: 'chromium',
    browserName: 'Chrome',
    profileName: 'Default',
    isDefaultProfile: true,
    platform: 'macos',
  },
];

function createRecord(overrides: Partial<StandardHistoryVisit>): StandardHistoryVisit {
  return {
    sourceId: 'chrome-default',
    browserFamily: 'chromium',
    browserName: 'Chrome',
    profileName: 'Default',
    visitId: '1',
    url: 'https://example.com',
    title: 'Example',
    visitedAtMs: 1_000,
    domain: 'example.com',
    visitCount: 1,
    typedCount: 0,
    referrerVisitId: null,
    transitionType: 'link',
    rawVisitTime: '1000',
    ...overrides,
  };
}

describe('syncMemory', () => {
  it('stores visits, updates sync cursors, and creates sessions', async () => {
    const db = await createTestMemoryDatabase();
    await saveMemorySettings({ autoEnrich: false }, db);

    const response: FetchHistoryResponse = {
      records: [
        createRecord({
          visitId: '1',
          visitedAtMs: 1_000,
          rawVisitTime: '1000',
          title: 'Read docs',
        }),
        createRecord({
          visitId: '2',
          visitedAtMs: 2_000,
          rawVisitTime: '2000',
          title: 'Compare docs',
        }),
      ],
      nextCursors: {
        'chrome-default': {
          lastVisitTime: '2000',
          lastVisitId: '2',
        },
      },
      sourceStates: [],
      fetchedAtMs: 10_000,
    };

    const result = await syncMemory({
      db,
      listSources: async () => sources,
      fetchHistory: async () => response,
    });

    expect(result.enrichmentStatus).toBe('idle');
    expect(result.enrichmentError).toBeNull();
    const { overview } = result;
    expect(overview.visitCount).toBe(2);
    expect(overview.sessionCount).toBe(1);
    expect(await loadSyncCursors(db)).toEqual({
      'chrome-default': {
        lastVisitTime: '2000',
        lastVisitId: '2',
      },
    });

    const sessions = await loadSessionBundles(db);
    expect(sessions[0]?.session.title).toBe('Read docs');
  });

  it('respects excluded domains while syncing', async () => {
    const db = await createTestMemoryDatabase();
    await saveMemorySettings({ autoEnrich: false, excludedDomains: ['example.com'] }, db);

    const response: FetchHistoryResponse = {
      records: [
        createRecord({
          domain: 'example.com',
          url: 'https://example.com/docs',
        }),
      ],
      nextCursors: {
        'chrome-default': {
          lastVisitTime: '1000',
          lastVisitId: '1',
        },
      },
      sourceStates: [],
      fetchedAtMs: 10_000,
    };

    const result = await syncMemory({
      db,
      listSources: async () => sources,
      fetchHistory: async () => response,
    });

    expect(result.enrichmentStatus).toBe('idle');
    expect(result.enrichmentError).toBeNull();
    const { overview } = result;
    expect(overview.visitCount).toBe(0);
    expect(overview.sessionCount).toBe(0);
  });

  it('keeps sync successful when enrichment is skipped without a Cerebras key', async () => {
    const db = await createTestMemoryDatabase();
    await saveMemorySettings({ autoEnrich: true }, db);

    const response: FetchHistoryResponse = {
      records: [
        createRecord({
          visitId: '1',
          visitedAtMs: 1_000,
          rawVisitTime: '1000',
          title: 'Read docs',
        }),
      ],
      nextCursors: {
        'chrome-default': {
          lastVisitTime: '1000',
          lastVisitId: '1',
        },
      },
      sourceStates: [],
      fetchedAtMs: 10_000,
    };

    const result = await syncMemory({
      db,
      listSources: async () => sources,
      fetchHistory: async () => response,
      getCerebrasApiKey: async () => '',
    });

    expect(result.overview.visitCount).toBe(1);
    expect(result.overview.sessionCount).toBe(1);
    expect(result.enrichmentStatus).toBe('missing-api-key');
    expect(result.enrichmentError).toBeNull();
  });
});
