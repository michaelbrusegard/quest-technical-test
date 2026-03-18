import { desc, like, or } from 'drizzle-orm';

import type { MemorySearchResult } from '@/lib/memory/domain/types';

import { getMemoryDatabase, type MemoryDatabaseSession } from '@/lib/memory/db/client';
import { sessions } from '@/lib/memory/db/schema';
import { fillSessionsVisitsAndInsights } from '@/lib/memory/queries/mappers';

export type SearchMemoryArgs = {
  query: string;
  limit?: number;
};

export async function searchMemory(
  { query, limit = 5 }: SearchMemoryArgs,
  db?: MemoryDatabaseSession,
): Promise<MemorySearchResult> {
  const resolvedDb = db ?? (await getMemoryDatabase());
  const searchPattern = `%${query}%`;

  const results = await resolvedDb
    .select()
    .from(sessions)
    .where(
      or(
        like(sessions.title, searchPattern),
        like(sessions.primaryDomain, searchPattern),
        like(sessions.evidenceJson, searchPattern),
      ),
    )
    .orderBy(desc(sessions.startedAtMs))
    .limit(limit);

  const mappedSessions = await fillSessionsVisitsAndInsights(results, resolvedDb);

  return {
    summary:
      mappedSessions.length > 0
        ? `Found ${mappedSessions.length} browsing sessions matching "${query}".`
        : `No browsing sessions matched the search for "${query}".`,
    sessions: mappedSessions,
  };
}
