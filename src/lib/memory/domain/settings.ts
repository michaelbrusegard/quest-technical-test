import { eq, sql } from 'drizzle-orm';

import { getMemoryDatabase, type MemoryDatabaseSession } from '@/lib/memory/db/client';
import { memoryConfig } from '@/lib/memory/db/schema';
import { DEFAULT_MEMORY_SETTINGS, type MemorySettings } from '@/lib/memory/domain/types';

const SETTINGS_KEY = 'memory_settings';

export async function getMemorySettings(db?: MemoryDatabaseSession): Promise<MemorySettings> {
  const resolvedDb = db ?? (await getMemoryDatabase());
  const [row] = await resolvedDb
    .select({ value: memoryConfig.value })
    .from(memoryConfig)
    .where(eq(memoryConfig.key, SETTINGS_KEY))
    .limit(1);

  if (!row?.value) {
    return DEFAULT_MEMORY_SETTINGS;
  }

  try {
    const parsed = JSON.parse(row.value) as Partial<MemorySettings>;
    return {
      ...DEFAULT_MEMORY_SETTINGS,
      ...parsed,
      excludedDomains: parsed.excludedDomains ?? DEFAULT_MEMORY_SETTINGS.excludedDomains,
    };
  } catch {
    return DEFAULT_MEMORY_SETTINGS;
  }
}

export async function saveMemorySettings(
  partialSettings: Partial<MemorySettings>,
  db?: MemoryDatabaseSession,
): Promise<MemorySettings> {
  const resolvedDb = db ?? (await getMemoryDatabase());
  const currentSettings = await getMemorySettings(resolvedDb);
  const nextSettings: MemorySettings = {
    ...currentSettings,
    ...partialSettings,
    excludedDomains: sanitizeDomains(
      partialSettings.excludedDomains ?? currentSettings.excludedDomains,
    ),
  };

  await resolvedDb
    .insert(memoryConfig)
    .values({
      key: SETTINGS_KEY,
      value: JSON.stringify(nextSettings),
      updatedAtMs: Date.now(),
    })
    .onConflictDoUpdate({
      target: memoryConfig.key,
      set: {
        value: sql`excluded.value`,
        updatedAtMs: sql`excluded.updated_at_ms`,
      },
    });

  return nextSettings;
}

function sanitizeDomains(domains: string[]): string[] {
  return [...new Set(domains.map((domain) => domain.trim().toLowerCase()).filter(Boolean))];
}
