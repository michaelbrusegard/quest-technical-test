import { invoke } from '@tauri-apps/api/core';

const HISTORY_STORAGE_KEY = 'quest.browser-history.v2';
const MAX_STORED_RECORDS = 1500;
const DEFAULT_LIMIT_PER_SOURCE = 250;

export type BrowserFamily = 'chromium' | 'firefox' | 'safari';
export type SourceFetchStatus =
  | 'ok'
  | 'not_modified'
  | 'unsupported'
  | 'unavailable'
  | 'read_failed';

export type BrowserSource = {
  sourceId: string;
  browserFamily: BrowserFamily;
  browserName: string;
  profileName: string;
  isDefaultProfile: boolean;
  platform: string;
};

export type Cursor = {
  lastVisitTime: string;
  lastVisitId: string;
};

export type StandardHistoryVisit = {
  sourceId: string;
  browserFamily: BrowserFamily;
  browserName: string;
  profileName: string;
  visitId: string;
  url: string;
  title: string | null;
  visitedAtMs: number;
  domain: string | null;
  visitCount: number | null;
  typedCount: number | null;
  referrerVisitId: string | null;
  transitionType: string | null;
  rawVisitTime: string;
};

export type SourceFetchState = {
  sourceId: string;
  browserName: string;
  profileName: string;
  status: SourceFetchStatus;
  message: string | null;
  recordsFetched: number;
  nextCursor: Cursor | null;
};

export type FetchHistoryRequest = {
  sources?: string[];
  cursors?: Record<string, Cursor>;
  limitPerSource?: number;
};

export type FetchHistoryResponse = {
  records: StandardHistoryVisit[];
  nextCursors: Record<string, Cursor>;
  sourceStates: SourceFetchState[];
  fetchedAtMs: number;
};

export type BrowserHistoryState = {
  sources: BrowserSource[];
  records: StandardHistoryVisit[];
  cursors: Record<string, Cursor>;
  sourceStates: SourceFetchState[];
  fetchedAtMs: number | null;
};

export function createEmptyBrowserHistoryState(): BrowserHistoryState {
  return {
    sources: [],
    records: [],
    cursors: {},
    sourceStates: [],
    fetchedAtMs: null,
  };
}

export async function syncBrowserHistory(
  previousState: BrowserHistoryState = loadBrowserHistoryState(),
): Promise<BrowserHistoryState> {
  if (!isTauriRuntime()) {
    return previousState;
  }

  const [sources, response] = await Promise.all([
    listBrowserSources(),
    fetchBrowserHistory({
      cursors: previousState.cursors,
      limitPerSource: DEFAULT_LIMIT_PER_SOURCE,
    }),
  ]);

  const nextState = {
    sources,
    records: mergeRecords(previousState.records, response.records),
    cursors: {
      ...previousState.cursors,
      ...response.nextCursors,
    },
    sourceStates: response.sourceStates,
    fetchedAtMs: response.fetchedAtMs,
  } satisfies BrowserHistoryState;

  saveBrowserHistoryState(nextState);
  return nextState;
}

export async function listBrowserSources(): Promise<BrowserSource[]> {
  if (!isTauriRuntime()) {
    return [];
  }

  return invoke<BrowserSource[]>('list_browser_sources');
}

export async function fetchBrowserHistory(
  request: FetchHistoryRequest,
): Promise<FetchHistoryResponse> {
  if (!isTauriRuntime()) {
    return {
      records: [],
      nextCursors: {},
      sourceStates: [],
      fetchedAtMs: Date.now(),
    };
  }

  return invoke<FetchHistoryResponse>('fetch_browser_history', { request });
}

export function loadBrowserHistoryState(): BrowserHistoryState {
  if (typeof window === 'undefined') {
    return createEmptyBrowserHistoryState();
  }

  try {
    const rawState = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!rawState) {
      return createEmptyBrowserHistoryState();
    }

    const parsedState = JSON.parse(rawState) as Partial<BrowserHistoryState>;
    return {
      sources: parsedState.sources ?? [],
      records: parsedState.records ?? [],
      cursors: parsedState.cursors ?? {},
      sourceStates: parsedState.sourceStates ?? [],
      fetchedAtMs: parsedState.fetchedAtMs ?? null,
    };
  } catch {
    return createEmptyBrowserHistoryState();
  }
}

export function createHistoryContext(state: BrowserHistoryState): string {
  if (state.records.length === 0) {
    return '';
  }

  const topDomains = Array.from(countDomains(state.records).entries())
    .toSorted((left, right) => right[1] - left[1])
    .slice(0, 8)
    .map(([domain, count]) => `- ${domain}: ${count} visits`)
    .join('\n');
  const recentVisits = state.records
    .toSorted((left, right) => right.visitedAtMs - left.visitedAtMs)
    .slice(0, 12)
    .map((record) => {
      const title = record.title?.trim() || record.url;
      const domain = record.domain ?? 'unknown domain';
      const timestamp = new Date(record.visitedAtMs).toISOString();
      return `- ${timestamp} | ${domain} | ${title}`;
    })
    .join('\n');
  const sources = state.sources
    .map((source) => `${source.browserName} (${source.profileName})`)
    .join(', ');

  return [
    "The assistant is grounded in the user's local browser history imported through the Tauri desktop runtime.",
    `Known browser profiles: ${sources || 'none detected'}`,
    `Stored visit records: ${state.records.length}`,
    state.fetchedAtMs ? `Last synced at: ${new Date(state.fetchedAtMs).toISOString()}` : null,
    'Top domains:',
    topDomains || '- none',
    'Recent visits:',
    recentVisits,
    "Use this history as factual grounding about the user's interests and recent activity. If the answer is uncertain, say so rather than inventing details.",
  ]
    .filter(Boolean)
    .join('\n');
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function saveBrowserHistoryState(state: BrowserHistoryState): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(state));
}

function mergeRecords(
  existingRecords: StandardHistoryVisit[],
  newRecords: StandardHistoryVisit[],
): StandardHistoryVisit[] {
  const recordsById = new Map<string, StandardHistoryVisit>();
  for (const record of [...existingRecords, ...newRecords]) {
    recordsById.set(`${record.sourceId}:${record.visitId}`, record);
  }

  return Array.from(recordsById.values())
    .toSorted((left, right) => right.visitedAtMs - left.visitedAtMs)
    .slice(0, MAX_STORED_RECORDS)
    .toSorted((left, right) => left.visitedAtMs - right.visitedAtMs);
}

function countDomains(records: StandardHistoryVisit[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const record of records) {
    if (!record.domain) {
      continue;
    }
    counts.set(record.domain, (counts.get(record.domain) ?? 0) + 1);
  }
  return counts;
}
