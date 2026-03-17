import type { ReactNode } from 'react';

import { AssistantRuntimeProvider, useLocalRuntime } from '@assistant-ui/react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  createEmptyBrowserHistoryState,
  createHistoryContext,
  loadBrowserHistoryState,
  syncBrowserHistory,
  type BrowserHistoryState,
} from '@/lib/browser-history';
import { createChatModelAdapterWithContext } from '@/lib/chat-model-adapter';

const API_KEY = (import.meta.env['VITE_CEREBRAS_API_KEY'] as string) ?? '';

type BrowserHistoryRuntimeContextValue = {
  historyState: BrowserHistoryState;
  isHistorySyncing: boolean;
  historySyncError: string | null;
  refreshHistory: () => Promise<void>;
};

const BrowserHistoryRuntimeContext = createContext<BrowserHistoryRuntimeContextValue | null>(null);

export function ChatRuntimeProvider({
  children,
}: Readonly<{
  children: ReactNode;
}>): React.ReactElement {
  const [historyState, setHistoryState] = useState<BrowserHistoryState>(() =>
    typeof window === 'undefined' ? createEmptyBrowserHistoryState() : loadBrowserHistoryState(),
  );
  const [historySyncError, setHistorySyncError] = useState<string | null>(null);
  const [isHistorySyncing, setIsHistorySyncing] = useState(false);
  const historyContextRef = useRef(createHistoryContext(historyState));

  const adapter = useMemo(
    () =>
      createChatModelAdapterWithContext(API_KEY, () => {
        return historyContextRef.current;
      }),
    [],
  );
  const runtime = useLocalRuntime(adapter);
  const refreshHistory = useCallback(async () => {
    setIsHistorySyncing(true);
    setHistorySyncError(null);

    try {
      const nextState = await syncBrowserHistory(loadBrowserHistoryState());
      historyContextRef.current = createHistoryContext(nextState);
      setHistoryState(nextState);
    } catch (error) {
      setHistorySyncError(
        error instanceof Error ? error.message : 'Unable to sync browser history',
      );
    } finally {
      setIsHistorySyncing(false);
    }
  }, []);

  useEffect(() => {
    historyContextRef.current = createHistoryContext(historyState);
  }, [historyState]);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  const contextValue = useMemo<BrowserHistoryRuntimeContextValue>(
    () => ({
      historyState,
      isHistorySyncing,
      historySyncError,
      refreshHistory,
    }),
    [historyState, historySyncError, isHistorySyncing, refreshHistory],
  );

  return (
    <BrowserHistoryRuntimeContext.Provider value={contextValue}>
      <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>
    </BrowserHistoryRuntimeContext.Provider>
  );
}

export function useBrowserHistorySync(): BrowserHistoryRuntimeContextValue {
  const context = useContext(BrowserHistoryRuntimeContext);
  if (!context) {
    throw new Error('useBrowserHistorySync must be used within ChatRuntimeProvider');
  }
  return context;
}
