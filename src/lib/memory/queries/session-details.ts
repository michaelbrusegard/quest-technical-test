import { eq } from 'drizzle-orm';

import type { SessionDetailsResult, SessionInsight } from '@/lib/memory/domain/types';

import { getMemoryDatabase, type MemoryDatabaseSession } from '@/lib/memory/db/client';
import { sessionInsights, sessions } from '@/lib/memory/db/schema';
import { fillSessionsVisitsAndInsights, parseStringArray } from '@/lib/memory/queries/mappers';

export async function getSessionDetails(
  { sessionId }: { sessionId: string },
  db?: MemoryDatabaseSession,
): Promise<SessionDetailsResult> {
  const resolvedDb = db ?? (await getMemoryDatabase());

  const [sessionRow] = await resolvedDb
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);

  if (!sessionRow) {
    return {
      summary: `Session with ID ${sessionId} was not found.`,
      session: null,
      insight: null,
    };
  }

  const mappedSessions = await fillSessionsVisitsAndInsights([sessionRow], resolvedDb);
  const mappedSession = mappedSessions[0] ?? null;

  const [insightRow] = await resolvedDb
    .select()
    .from(sessionInsights)
    .where(eq(sessionInsights.sessionId, sessionId))
    .limit(1);

  const insight: SessionInsight | null = insightRow
    ? {
        sessionId: insightRow.sessionId,
        summary: insightRow.summary,
        themes: parseStringArray(insightRow.themesJson),
        behaviorSignals: parseStringArray(insightRow.behaviorSignalsJson),
        goalHypotheses: parseStringArray(insightRow.goalHypothesesJson),
        confidence: insightRow.confidence,
        model: insightRow.model,
        updatedAtMs: insightRow.updatedAtMs,
      }
    : null;

  return {
    summary: `Details retrieved for session: ${sessionRow.title}`,
    session: mappedSession,
    insight,
  };
}
