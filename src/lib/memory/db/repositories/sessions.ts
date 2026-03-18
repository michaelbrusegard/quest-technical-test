import { desc, inArray, notInArray, sql } from 'drizzle-orm';

import type { MemorySession, SessionInsight } from '@/lib/memory/domain/types';

import { getMemoryDatabase, type MemoryDatabaseSession } from '@/lib/memory/db/client';
import { sessionInsights, sessions, sessionVisits } from '@/lib/memory/db/schema';

export type SessionBundle = {
  session: Omit<MemorySession, 'visits'>;
  insight: SessionInsight | null;
};

export async function syncSessions(
  nextSessions: MemorySession[],
  db?: MemoryDatabaseSession,
): Promise<void> {
  const resolvedDb = db ?? (await getMemoryDatabase());
  const sessionIds = nextSessions.map((session) => session.id);

  await resolvedDb.transaction(async (tx) => {
    await tx.delete(sessionVisits);

    if (sessionIds.length === 0) {
      await tx.delete(sessions);
      return;
    }

    await tx.delete(sessions).where(notInArray(sessions.id, sessionIds));

    for (const session of nextSessions) {
      await tx
        .insert(sessions)
        .values({
          id: session.id,
          startedAtMs: session.startedAtMs,
          endedAtMs: session.endedAtMs,
          visitCount: session.visitCount,
          primaryDomain: session.primaryDomain,
          title: session.title,
          importanceScore: session.importanceScore,
          evidenceJson: JSON.stringify(session.evidence),
        })
        .onConflictDoUpdate({
          target: sessions.id,
          set: {
            startedAtMs: sql`excluded.started_at_ms`,
            endedAtMs: sql`excluded.ended_at_ms`,
            visitCount: sql`excluded.visit_count`,
            primaryDomain: sql`excluded.primary_domain`,
            title: sql`excluded.title`,
            importanceScore: sql`excluded.importance_score`,
            evidenceJson: sql`excluded.evidence_json`,
          },
        });
    }

    const visitJoins = nextSessions.flatMap((session) =>
      session.visits.map((visit, position) => ({
        sessionId: session.id,
        sourceId: visit.sourceId,
        visitId: visit.visitId,
        position,
      })),
    );

    if (visitJoins.length > 0) {
      await tx.insert(sessionVisits).values(visitJoins);
    }
  });
}

export async function loadSessionBundles(db?: MemoryDatabaseSession): Promise<SessionBundle[]> {
  const resolvedDb = db ?? (await getMemoryDatabase());
  const [sessionRows, insightRows] = await Promise.all([
    resolvedDb.select().from(sessions).orderBy(desc(sessions.startedAtMs)),
    resolvedDb.select().from(sessionInsights),
  ]);

  const insightsBySessionId = new Map(
    insightRows.map((row) => [
      row.sessionId,
      {
        sessionId: row.sessionId,
        summary: row.summary,
        themes: parseStringArray(row.themesJson),
        behaviorSignals: parseStringArray(row.behaviorSignalsJson),
        goalHypotheses: parseStringArray(row.goalHypothesesJson),
        confidence: row.confidence,
        model: row.model,
        updatedAtMs: row.updatedAtMs,
      } satisfies SessionInsight,
    ]),
  );

  return sessionRows.map((row) => ({
    session: {
      id: row.id,
      startedAtMs: row.startedAtMs,
      endedAtMs: row.endedAtMs,
      visitCount: row.visitCount,
      primaryDomain: row.primaryDomain,
      title: row.title,
      importanceScore: row.importanceScore,
      evidence: parseEvidence(row.evidenceJson),
    },
    insight: insightsBySessionId.get(row.id) ?? null,
  }));
}

export async function loadSessionsByIds(
  sessionIds: string[],
  db?: MemoryDatabaseSession,
): Promise<Array<Omit<MemorySession, 'visits'>>> {
  if (sessionIds.length === 0) {
    return [];
  }

  const resolvedDb = db ?? (await getMemoryDatabase());
  const rows = await resolvedDb
    .select()
    .from(sessions)
    .where(inArray(sessions.id, sessionIds))
    .orderBy(desc(sessions.startedAtMs));

  return rows.map((row) => ({
    id: row.id,
    startedAtMs: row.startedAtMs,
    endedAtMs: row.endedAtMs,
    visitCount: row.visitCount,
    primaryDomain: row.primaryDomain,
    title: row.title,
    importanceScore: row.importanceScore,
    evidence: parseEvidence(row.evidenceJson),
  }));
}

function parseEvidence(evidenceJson: string): MemorySession['evidence'] {
  try {
    return JSON.parse(evidenceJson) as MemorySession['evidence'];
  } catch {
    return {
      topDomains: [],
      titles: [],
      canonicalUrls: [],
    };
  }
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
