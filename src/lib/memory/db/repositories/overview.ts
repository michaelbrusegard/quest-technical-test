import { desc, sql } from 'drizzle-orm';

import type { BrowserSource } from '@/lib/browser-history';
import type { MemoryOverview } from '@/lib/memory/domain/types';

import { getMemoryDatabase, type MemoryDatabaseSession } from '@/lib/memory/db/client';
import { sessionInsights, sessions, syncState, visits } from '@/lib/memory/db/schema';

export async function loadMemoryOverview(
  sources: BrowserSource[],
  db?: MemoryDatabaseSession,
): Promise<MemoryOverview> {
  const resolvedDb = db ?? (await getMemoryDatabase());
  const [visitCountRow] = await resolvedDb
    .select({ visitCount: sql<number>`count(*)` })
    .from(visits);
  const [sessionCountRow] = await resolvedDb
    .select({ sessionCount: sql<number>`count(*)` })
    .from(sessions);
  const [lastSyncRow] = await resolvedDb
    .select({
      lastSyncedAtMs: sql<number | null>`max(${syncState.lastSyncedAtMs})`,
    })
    .from(syncState);
  const [lastInsightRow] = await resolvedDb
    .select({
      updatedAtMs: sql<number | null>`max(${sessionInsights.updatedAtMs})`,
    })
    .from(sessionInsights);
  const recentInsights = await resolvedDb
    .select({ themesJson: sessionInsights.themesJson })
    .from(sessionInsights)
    .orderBy(desc(sessionInsights.updatedAtMs))
    .limit(5);

  return {
    sources,
    visitCount: visitCountRow?.visitCount ?? 0,
    sessionCount: sessionCountRow?.sessionCount ?? 0,
    lastSyncedAtMs: lastSyncRow?.lastSyncedAtMs ?? null,
    lastEnrichedAtMs: lastInsightRow?.updatedAtMs ?? null,
    recentThemes: [
      ...new Set(recentInsights.flatMap((row) => parseStringArray(row.themesJson))),
    ].slice(0, 5),
  };
}

function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === 'string')
      : [];
  } catch {
    return [];
  }
}
