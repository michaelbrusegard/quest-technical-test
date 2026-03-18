import { describe, expect, it } from 'vitest';

import { normalizeQueryResult, resetMemoryDatabaseForTests } from '@/lib/memory/db/client';
import { getMemorySettings, saveMemorySettings } from '@/lib/memory/domain/settings';
import { createTestMemoryDatabase, seedIncompleteSchema } from '@/lib/memory/testing/test-helpers';

describe('createMemoryDatabase', () => {
  it('initializes the folder-based Drizzle migration before settings reads', async () => {
    const database = await createTestMemoryDatabase();

    await expect(getMemorySettings(database)).resolves.toMatchObject({
      enabled: true,
    });

    await saveMemorySettings({ enabled: false }, database);

    await expect(getMemorySettings(database)).resolves.toMatchObject({
      enabled: false,
    });

    resetMemoryDatabaseForTests();
  });

  it('rebuilds an incomplete memory schema before use', async () => {
    const database = await createTestMemoryDatabase({
      skipDefaultSeed: true,
      seed: seedIncompleteSchema,
    });

    await expect(getMemorySettings(database)).resolves.toMatchObject({
      enabled: true,
    });

    await saveMemorySettings({ retentionDays: 90 }, database);
    await expect(getMemorySettings(database)).resolves.toMatchObject({
      retentionDays: 90,
    });

    resetMemoryDatabaseForTests();
  });

  it('normalizes empty get results to an empty rows array for sqlite-proxy', () => {
    expect(normalizeQueryResult('get', {})).toEqual({ rows: [] });
    expect(normalizeQueryResult('get', { rows: [[1], [2]] })).toEqual({ rows: [[1]] });
    expect(normalizeQueryResult('all', {})).toEqual({ rows: [] });
  });
});
