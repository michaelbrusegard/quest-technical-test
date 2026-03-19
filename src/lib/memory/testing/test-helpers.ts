import { createRequire } from 'node:module';

import type {
  MemoryQueryExecutor,
  MemoryQueryRequest,
  MemoryQueryResult,
} from '@/lib/memory/db/query-bridge';

import {
  createMemoryDatabase,
  resetMemoryDatabaseForTests,
  type MemoryDatabase,
} from '@/lib/memory/db/client';
import { bundledMemoryMigrations } from '@/lib/memory/db/migration-files';

const [initialMigration] = bundledMemoryMigrations;
const require = createRequire(import.meta.url);

if (!initialMigration) {
  throw new Error('Expected at least one bundled Drizzle migration for the memory database');
}

const initialMigrationSql = initialMigration.sql;
const initialMigrationId = initialMigration.id;

export async function createTestMemoryDatabase(options?: {
  seed?: (executor: MemoryQueryExecutor) => Promise<void>;
  skipDefaultSeed?: boolean;
}): Promise<MemoryDatabase> {
  resetMemoryDatabaseForTests();
  const executor = createNodeSqliteMemoryExecutor();
  if (!options?.skipDefaultSeed) {
    await seedValidSchema(executor);
  }
  if (options?.seed) {
    await options.seed(executor);
  }
  return createMemoryDatabase({ executor });
}

type TestDatabase = {
  exec(sql: string): void;
  prepare(sql: string): {
    run: (...params: Array<string | number | boolean | null>) => void;
    all: (...params: Array<string | number | boolean | null>) => object[];
  };
};

function createNodeSqliteMemoryExecutor(): MemoryQueryExecutor {
  const sqliteModule = require('node:sqlite') as {
    DatabaseSync: new (path: string) => TestDatabase;
  };
  const db = new sqliteModule.DatabaseSync(':memory:');

  return {
    execute: async (request) => executeQuery(db, request),
    batch: async (batch) => {
      db.exec('BEGIN IMMEDIATE TRANSACTION;');
      try {
        const results = batch.map((request) => executeQuery(db, request));
        db.exec('COMMIT;');
        return results;
      } catch (error) {
        db.exec('ROLLBACK;');
        throw error;
      }
    },
  };
}

export async function seedValidSchema(executor: MemoryQueryExecutor): Promise<void> {
  await executor.execute({
    sql: `
      CREATE TABLE IF NOT EXISTS __drizzle_migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        applied_at_ms INTEGER NOT NULL
      );
    `,
    params: [],
    method: 'run',
  });
  await executor.execute({
    sql: initialMigrationSql,
    params: [],
    method: 'run',
  });
  await executor.execute({
    sql: 'INSERT OR IGNORE INTO __drizzle_migrations (name, applied_at_ms) VALUES (?, ?)',
    params: [initialMigrationId, Date.now()],
    method: 'run',
  });
}

export async function seedIncompleteSchema(executor: MemoryQueryExecutor): Promise<void> {
  await executor.execute({
    sql: `
      CREATE TABLE IF NOT EXISTS __drizzle_migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        applied_at_ms INTEGER NOT NULL
      );
    `,
    params: [],
    method: 'run',
  });
  await executor.execute({
    sql: 'CREATE TABLE IF NOT EXISTS memory_config (key text PRIMARY KEY NOT NULL, value text NOT NULL, updated_at_ms integer NOT NULL);',
    params: [],
    method: 'run',
  });
  await executor.execute({
    sql: 'INSERT OR IGNORE INTO __drizzle_migrations (name, applied_at_ms) VALUES (?, ?)',
    params: [initialMigrationId, Date.now()],
    method: 'run',
  });
}

function executeQuery(db: TestDatabase, request: MemoryQueryRequest): MemoryQueryResult {
  const params = request.params as Array<string | number | boolean | null>;

  if (request.method === 'run') {
    if (request.params.length === 0) {
      db.exec(request.sql);
    } else {
      db.prepare(request.sql).run(...params);
    }
    return { rows: [] };
  }

  const rows = db
    .prepare(request.sql)
    .all(...params)
    .map((row: object) => Object.values(row as Record<string, unknown>));

  if (request.method === 'get') {
    const firstRow = rows[0];
    return firstRow ? { rows: [firstRow] } : {};
  }

  return { rows };
}
