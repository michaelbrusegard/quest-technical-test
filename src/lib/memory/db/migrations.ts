import type { MemoryQueryExecutor, MemoryQueryRequest } from '@/lib/memory/db/query-bridge';

import { bundledMemoryMigrations } from '@/lib/memory/db/migration-files';

const REQUIRED_TABLES = [
  'memory_config',
  'sync_state',
  'visits',
  'sessions',
  'session_visits',
  'session_insights',
];

const BOOTSTRAP_SQL = `
  CREATE TABLE IF NOT EXISTS __drizzle_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    applied_at_ms INTEGER NOT NULL
  );
`;

export async function runMemoryMigrations(executor: MemoryQueryExecutor): Promise<void> {
  await executor.execute({
    sql: BOOTSTRAP_SQL,
    params: [],
    method: 'run',
  });

  const existingTables = await getExistingTables(executor);
  if (hasIncompleteSchema(existingTables)) {
    await resetMemorySchema(executor);
  }

  const appliedMigrationsResult = await executor.execute({
    sql: 'SELECT name FROM __drizzle_migrations ORDER BY id ASC',
    params: [],
    method: 'all',
  });
  const appliedMigrations = new Set(
    (appliedMigrationsResult.rows ?? []).flatMap((row: unknown[]) => {
      const [name] = row;
      return typeof name === 'string' ? [name] : [];
    }),
  );

  const pendingMigrations = bundledMemoryMigrations.filter(
    (migration) => !appliedMigrations.has(migration.id),
  );

  if (pendingMigrations.length === 0) {
    return;
  }

  const batch = pendingMigrations.flatMap((migration) => {
    return [
      {
        sql: migration.sql,
        params: [],
        method: 'run',
      },
      {
        sql: 'INSERT INTO __drizzle_migrations (name, applied_at_ms) VALUES (?, ?)',
        params: [migration.id, Date.now()],
        method: 'run',
      },
    ] satisfies MemoryQueryRequest[];
  });

  await executor.batch(batch);
}

async function getExistingTables(executor: MemoryQueryExecutor): Promise<Set<string>> {
  const result = await executor.execute({
    sql: "SELECT name FROM sqlite_master WHERE type = 'table'",
    params: [],
    method: 'all',
  });

  return new Set(
    (result.rows ?? []).flatMap((row: unknown[]) => {
      const [name] = row;
      return typeof name === 'string' ? [name] : [];
    }),
  );
}

function hasIncompleteSchema(existingTables: Set<string>): boolean {
  const presentRequiredTables = REQUIRED_TABLES.filter((table) => existingTables.has(table));
  return (
    presentRequiredTables.length > 0 && presentRequiredTables.length !== REQUIRED_TABLES.length
  );
}

async function resetMemorySchema(executor: MemoryQueryExecutor): Promise<void> {
  const cleanup = [
    ...REQUIRED_TABLES.toReversed().map(
      (table) =>
        ({
          sql: `DROP TABLE IF EXISTS ${table}`,
          params: [],
          method: 'run',
        }) satisfies MemoryQueryRequest,
    ),
    {
      sql: 'DELETE FROM __drizzle_migrations',
      params: [],
      method: 'run',
    } satisfies MemoryQueryRequest,
  ];

  await executor.batch(cleanup);
}
