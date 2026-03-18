import { sql, inArray } from 'drizzle-orm';

import type { MemoryDatabaseSession } from '@/lib/memory/db/client';
import type { MemorySession } from '@/lib/memory/domain/types';

import { visits, sessionVisits } from '@/lib/memory/db/schema';

export async function fillSessionsVisitsAndInsights(
  sessionRows: Array<{
    id: string;
    startedAtMs: number;
    endedAtMs: number;
    visitCount: number;
    primaryDomain: string | null;
    title: string;
    importanceScore: number;
    evidenceJson: string;
  }>,
  db: MemoryDatabaseSession,
): Promise<MemorySession[]> {
  if (sessionRows.length === 0) {
    return [];
  }

  const sessionIds = sessionRows.map((s) => s.id);

  const visitsQuery = await db
    .select({
      sessionId: sessionVisits.sessionId,
      sourceId: visits.sourceId,
      visitId: visits.visitId,
      browserFamily: visits.browserFamily,
      browserName: visits.browserName,
      profileName: visits.profileName,
      url: visits.url,
      canonicalUrl: visits.canonicalUrl,
      title: visits.title,
      visitedAtMs: visits.visitedAtMs,
      domain: visits.domain,
      visitCount: visits.visitCount,
      typedCount: visits.typedCount,
      referrerVisitId: visits.referrerVisitId,
      transitionType: visits.transitionType,
      rawVisitTime: visits.rawVisitTime,
      importedAtMs: visits.importedAtMs,
    })
    .from(sessionVisits)
    .innerJoin(
      visits,
      sql`${sessionVisits.sourceId} = ${visits.sourceId} AND ${sessionVisits.visitId} = ${visits.visitId}`,
    )
    .where(inArray(sessionVisits.sessionId, sessionIds));

  const visitsBySession = new Map<string, Array<import('@/lib/memory/domain/types').StoredVisit>>();
  for (const v of visitsQuery) {
    if (!visitsBySession.has(v.sessionId)) {
      visitsBySession.set(v.sessionId, []);
    }
    visitsBySession.get(v.sessionId)!.push({
      sourceId: v.sourceId,
      visitId: v.visitId,
      browserFamily: v.browserFamily as import('@/lib/browser-history').BrowserFamily,
      browserName: v.browserName,
      profileName: v.profileName,
      url: v.url,
      canonicalUrl: v.canonicalUrl,
      title: v.title,
      visitedAtMs: v.visitedAtMs,
      domain: v.domain,
      visitCount: v.visitCount,
      typedCount: v.typedCount,
      referrerVisitId: v.referrerVisitId,
      transitionType: v.transitionType,
      rawVisitTime: v.rawVisitTime,
      importedAtMs: v.importedAtMs,
    });
  }

  return sessionRows.map((row) => ({
    id: row.id,
    startedAtMs: row.startedAtMs,
    endedAtMs: row.endedAtMs,
    visitCount: row.visitCount,
    primaryDomain: row.primaryDomain,
    title: row.title,
    importanceScore: row.importanceScore,
    evidence: parseEvidence(row.evidenceJson),
    visits: visitsBySession.get(row.id) ?? [],
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

export function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === 'string')
      : [];
  } catch {
    return [];
  }
}
