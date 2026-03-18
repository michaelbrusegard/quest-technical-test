import { invoke } from '@tauri-apps/api/core';
import {
  drizzle,
  type AsyncBatchRemoteCallback,
  type AsyncRemoteCallback,
  type SqliteRemoteDatabase,
} from 'drizzle-orm/sqlite-proxy';

import type {
  MemoryQueryExecutor,
  MemoryQueryMethod,
  MemoryQueryResult,
} from '@/lib/memory/db/query-bridge';

import { runMemoryMigrations } from '@/lib/memory/db/migrations';
import { schema } from '@/lib/memory/db/schema';

export type MemoryDatabase = SqliteRemoteDatabase<typeof schema>;
export type MemoryDatabaseSession = Omit<MemoryDatabase, 'batch'>;
export type DrizzleRemoteQueryResult = { rows: unknown[][] };

let databasePromise: Promise<MemoryDatabase> | null = null;

export function resetMemoryDatabaseForTests(): void {
  databasePromise = null;
}

export async function getMemoryDatabase(): Promise<MemoryDatabase> {
  databasePromise ??= createMemoryDatabase();
  return databasePromise;
}

export async function createMemoryDatabase({
  executor,
}: {
  executor?: MemoryQueryExecutor;
} = {}): Promise<MemoryDatabase> {
  const resolvedExecutor = executor ?? createTauriMemoryQueryExecutor();
  await runMemoryMigrations(resolvedExecutor);

  return drizzle(createRemoteCallback(resolvedExecutor), createBatchCallback(resolvedExecutor), {
    schema,
  });
}

export function createTauriMemoryQueryExecutor(): MemoryQueryExecutor {
  return {
    execute: async (request) => {
      if (!isTauriRuntime()) {
        return { rows: [] };
      }

      return invoke<MemoryQueryResult>('memory_execute', { request });
    },
    batch: async (batch) => {
      if (!isTauriRuntime()) {
        return batch.map(() => ({ rows: [] }));
      }

      return invoke<MemoryQueryResult[]>('memory_batch', { batch });
    },
  };
}

function createRemoteCallback(executor: MemoryQueryExecutor): AsyncRemoteCallback {
  return async (sql, params, method) => {
    const result = await executor.execute({ sql, params, method });
    return normalizeQueryResult(method, result) as never;
  };
}

function createBatchCallback(executor: MemoryQueryExecutor): AsyncBatchRemoteCallback {
  return async (batch) => {
    const results = await executor.batch(batch);
    return results.map((result, index) =>
      normalizeQueryResult(batch[index]?.method ?? 'all', result),
    ) as never;
  };
}

export function normalizeQueryResult(
  method: MemoryQueryMethod,
  result: MemoryQueryResult,
): DrizzleRemoteQueryResult {
  if (method === 'get') {
    const firstRow = result.rows?.[0];
    return { rows: firstRow ? [firstRow] : [] };
  }

  return { rows: result.rows ?? [] };
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}
