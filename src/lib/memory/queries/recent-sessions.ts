import { desc } from 'drizzle-orm';

import type { RecentSessionsResult } from '@/lib/memory/domain/types';

import { getMemoryDatabase, type MemoryDatabaseSession } from '@/lib/memory/db/client';
import { sessions } from '@/lib/memory/db/schema';
import { fillSessionsVisitsAndInsights } from '@/lib/memory/queries/mappers';

export async function getRecentSessions(
  { limit = 5 }: { limit?: number } = {},
  db?: MemoryDatabaseSession,
): Promise<RecentSessionsResult> {
  const resolvedDb = db ?? (await getMemoryDatabase());

  const results = await resolvedDb
    .select()
    .from(sessions)
    .orderBy(desc(sessions.startedAtMs))
    .limit(limit);

  const mappedSessions = await fillSessionsVisitsAndInsights(results, resolvedDb);

  return {
    summary:
      mappedSessions.length > 0
        ? `Here are the ${mappedSessions.length} most recent browsing sessions.`
        : 'No recent browsing sessions found.',
    sessions: mappedSessions,
  };
}
