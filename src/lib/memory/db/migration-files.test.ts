import { describe, expect, it } from 'vitest';

import { bundledMemoryMigrations } from '@/lib/memory/db/migration-files';

describe('bundledMemoryMigrations', () => {
  it('loads folder-based Drizzle migration files', () => {
    expect(bundledMemoryMigrations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: '0000_memory_init',
          path: expect.stringContaining('0000_memory_init/migration.sql'),
          sql: expect.stringContaining('CREATE TABLE `memory_config`'),
        }),
      ]),
    );
  });
});
