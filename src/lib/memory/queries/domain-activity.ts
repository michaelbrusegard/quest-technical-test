import { desc, like, or } from 'drizzle-orm';

import type { DomainActivityResult } from '@/lib/memory/domain/types';

import { getMemoryDatabase, type MemoryDatabaseSession } from '@/lib/memory/db/client';
import { sessions } from '@/lib/memory/db/schema';
import { fillSessionsVisitsAndInsights } from '@/lib/memory/queries/mappers';

export async function getDomainActivity(
  { domain, limit = 5 }: { domain: string; limit?: number },
  db?: MemoryDatabaseSession,
): Promise<DomainActivityResult> {
  const resolvedDb = db ?? (await getMemoryDatabase());
  const searchPattern = `%${domain}%`;

  const results = await resolvedDb
    .select()
    .from(sessions)
    .where(
      or(like(sessions.primaryDomain, searchPattern), like(sessions.evidenceJson, searchPattern)),
    )
    .orderBy(desc(sessions.startedAtMs))
    .limit(limit);

  const mappedSessions = await fillSessionsVisitsAndInsights(results, resolvedDb);

  return {
    summary:
      mappedSessions.length > 0
        ? `Found ${mappedSessions.length} sessions related to the domain "${domain}".`
        : `No recent activity found for the domain "${domain}".`,
    sessions: mappedSessions,
  };
}
