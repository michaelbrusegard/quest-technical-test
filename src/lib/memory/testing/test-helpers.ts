import initSqlJs from 'sql.js/dist/sql-asm.js';

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
  const executor = await createSqlJsMemoryExecutor();
  if (!options?.skipDefaultSeed) {
    await seedValidSchema(executor);
  }
  if (options?.seed) {
    await options.seed(executor);
  }
  return createMemoryDatabase({ executor });
}

async function createSqlJsMemoryExecutor(): Promise<MemoryQueryExecutor> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();

  const executor: MemoryQueryExecutor = {
    execute: async (request) => executeQuery(db, request),
    batch: async (batch) => {
      db.run('BEGIN IMMEDIATE TRANSACTION;');
      try {
        const results = batch.map((request) => executeQuery(db, request));
        db.run('COMMIT;');
        return results;
      } catch (error) {
        db.run('ROLLBACK;');
        throw error;
      }
    },
  };

  return executor;
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

function executeQuery(
  db: import('sql.js').Database,
  request: MemoryQueryRequest,
): MemoryQueryResult {
  if (request.method === 'run') {
    if (request.params.length === 0) {
      db.exec(request.sql);
    } else {
      db.run(request.sql, request.params as import('sql.js').BindParams);
    }
    return { rows: [] };
  }

  const statement = db.prepare(request.sql, request.params as import('sql.js').BindParams);
  const rows: unknown[][] = [];

  try {
    while (statement.step()) {
      rows.push(Object.values(statement.getAsObject()));

      if (request.method === 'get') {
        break;
      }
    }
  } finally {
    statement.free();
  }

  return request.method === 'get' && rows.length === 0 ? {} : { rows };
}
