import type { ReactNode } from 'react';

import { AssistantRuntimeProvider, useLocalRuntime } from '@assistant-ui/react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import type { MemoryOverview } from '@/lib/memory/domain/types';

import { useApiKeys } from '@/hooks/use-api-keys';
import { type BrowserSource } from '@/lib/browser-history';
import { createChatModelAdapterWithContext } from '@/lib/chat-model-adapter';
import { createMemoryContext } from '@/lib/memory/agent/context';
import { type MemoryEnrichmentStatus, syncMemory } from '@/lib/memory/ingestion/sync';

const HISTORY_SYNC_INTERVAL_MS = 5 * 60 * 1000;

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function getRuntimeResetKey(isLoading: boolean, anthropicApiKey: string): string {
  let hash = 0;
  for (const char of anthropicApiKey) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return `${isLoading ? 'loading' : 'ready'}:${anthropicApiKey.length}:${hash}`;
}

type BrowserHistoryRuntimeContextValue = {
  memoryOverview: MemoryOverview;
  isHistorySyncing: boolean;
  historySyncError: string | null;
  enrichmentStatus: MemoryEnrichmentStatus;
  enrichmentError: string | null;
  refreshHistory: () => Promise<void>;
};
const BrowserHistoryRuntimeContext = createContext<BrowserHistoryRuntimeContextValue | null>(null);
export function ChatRuntimeProvider({
  children,
}: Readonly<{
  children: ReactNode;
}>): React.ReactElement {
  const { keys, isLoading } = useApiKeys();
  const [memoryOverview, setMemoryOverview] = useState<MemoryOverview>({
    sources: [] satisfies BrowserSource[],
    visitCount: 0,
    sessionCount: 0,
    lastSyncedAtMs: null,
    lastEnrichedAtMs: null,
    recentThemes: [],
  });
  const [historySyncError, setHistorySyncError] = useState<string | null>(null);
  const [enrichmentStatus, setEnrichmentStatus] = useState<MemoryEnrichmentStatus>('idle');
  const [enrichmentError, setEnrichmentError] = useState<string | null>(null);
  const [isHistorySyncing, setIsHistorySyncing] = useState(false);
  const historyContextRef = useRef(createMemoryContext(memoryOverview));
  const isSyncingRef = useRef(false);
  const runtimeResetKey = useMemo(
    () => getRuntimeResetKey(isLoading, keys.anthropic),
    [isLoading, keys.anthropic],
  );
  const refreshHistory = useCallback(async () => {
    if (isSyncingRef.current) {
      return;
    }
    isSyncingRef.current = true;
    setIsHistorySyncing(true);
    setHistorySyncError(null);
    try {
      const result = await syncMemory({
        getCerebrasApiKey: async () => keys.cerebras,
      });
      historyContextRef.current = createMemoryContext(result.overview);
      setMemoryOverview(result.overview);
      setEnrichmentStatus(result.enrichmentStatus);
      setEnrichmentError(result.enrichmentError);
    } catch (error) {
      setHistorySyncError(
        error instanceof Error ? error.message : 'Unable to sync browser history',
      );
    } finally {
      isSyncingRef.current = false;
      setIsHistorySyncing(false);
    }
  }, [keys.cerebras]);
  useEffect(() => {
    historyContextRef.current = createMemoryContext(memoryOverview);
  }, [memoryOverview]);
  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);
  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }
    let cancelled = false;
    const win = getCurrentWindow();
    let intervalId: ReturnType<typeof window.setInterval> | null = null;
    let unlistenFocusChanged: (() => void) | null = null;
    const stopPeriodicSync = () => {
      if (intervalId !== null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    };
    const startPeriodicSync = () => {
      stopPeriodicSync();
      intervalId = window.setInterval(() => {
        void refreshHistory();
      }, HISTORY_SYNC_INTERVAL_MS);
    };
    const setupFocusHandling = async () => {
      const isFocused = await win.isFocused();
      if (cancelled) {
        return;
      }
      if (isFocused) {
        startPeriodicSync();
      }
      unlistenFocusChanged = await win.onFocusChanged(({ payload }) => {
        if (payload) {
          startPeriodicSync();
          void refreshHistory();
          return;
        }
        stopPeriodicSync();
      });
      if (cancelled) {
        unlistenFocusChanged();
        stopPeriodicSync();
      }
    };
    void setupFocusHandling();
    return () => {
      cancelled = true;
      stopPeriodicSync();
      unlistenFocusChanged?.();
    };
  }, [refreshHistory]);
  const contextValue = useMemo<BrowserHistoryRuntimeContextValue>(
    () => ({
      memoryOverview,
      isHistorySyncing,
      historySyncError,
      enrichmentStatus,
      enrichmentError,
      refreshHistory,
    }),
    [
      memoryOverview,
      historySyncError,
      enrichmentError,
      enrichmentStatus,
      isHistorySyncing,
      refreshHistory,
    ],
  );
  return (
    <BrowserHistoryRuntimeContext.Provider value={contextValue}>
      <LocalChatAssistantRuntime
        key={runtimeResetKey}
        anthropicApiKey={keys.anthropic}
        getMemoryContext={() => historyContextRef.current}
      >
        {children}
      </LocalChatAssistantRuntime>
    </BrowserHistoryRuntimeContext.Provider>
  );
}
function LocalChatAssistantRuntime({
  anthropicApiKey,
  getMemoryContext,
  children,
}: Readonly<{
  anthropicApiKey: string;
  getMemoryContext: () => string;
  children: ReactNode;
}>): React.ReactElement {
  const adapter = useMemo(() => {
    return createChatModelAdapterWithContext(() => {
      return getMemoryContext();
    }, anthropicApiKey);
  }, [anthropicApiKey, getMemoryContext]);
  const runtime = useLocalRuntime(adapter, { maxSteps: 5 });
  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>;
}
export function useBrowserHistorySync(): BrowserHistoryRuntimeContextValue {
  const context = useContext(BrowserHistoryRuntimeContext);
  if (!context) {
    throw new Error('useBrowserHistorySync must be used within ChatRuntimeProvider');
  }
  return context;
}
