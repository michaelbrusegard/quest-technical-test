import { asc, lt } from 'drizzle-orm';

import type { StoredVisit } from '@/lib/memory/domain/types';

import { getMemoryDatabase, type MemoryDatabaseSession } from '@/lib/memory/db/client';
import { visits } from '@/lib/memory/db/schema';

export async function upsertVisits(
  records: StoredVisit[],
  db?: MemoryDatabaseSession,
): Promise<void> {
  if (records.length === 0) {
    return;
  }

  const resolvedDb = db ?? (await getMemoryDatabase());
  await resolvedDb
    .insert(visits)
    .values(
      records.map((visit) => ({
        sourceId: visit.sourceId,
        visitId: visit.visitId,
        browserFamily: visit.browserFamily,
        browserName: visit.browserName,
        profileName: visit.profileName,
        url: visit.url,
        canonicalUrl: visit.canonicalUrl,
        title: visit.title,
        visitedAtMs: visit.visitedAtMs,
        domain: visit.domain,
        visitCount: visit.visitCount,
        typedCount: visit.typedCount,
        referrerVisitId: visit.referrerVisitId,
        transitionType: visit.transitionType,
        rawVisitTime: visit.rawVisitTime,
        importedAtMs: visit.importedAtMs,
      })),
    )
    .onConflictDoNothing();
}

export async function pruneVisitsOlderThan(
  cutoffMs: number,
  db?: MemoryDatabaseSession,
): Promise<void> {
  const resolvedDb = db ?? (await getMemoryDatabase());
  await resolvedDb.delete(visits).where(lt(visits.visitedAtMs, cutoffMs));
}

export async function loadAllVisits(db?: MemoryDatabaseSession): Promise<StoredVisit[]> {
  const resolvedDb = db ?? (await getMemoryDatabase());
  const rows = await resolvedDb
    .select()
    .from(visits)
    .orderBy(asc(visits.visitedAtMs), asc(visits.sourceId));

  return rows.map((row) => ({
    sourceId: row.sourceId,
    browserFamily: row.browserFamily as StoredVisit['browserFamily'],
    browserName: row.browserName,
    profileName: row.profileName,
    visitId: row.visitId,
    url: row.url,
    canonicalUrl: row.canonicalUrl,
    title: row.title,
    visitedAtMs: row.visitedAtMs,
    domain: row.domain,
    visitCount: row.visitCount,
    typedCount: row.typedCount,
    referrerVisitId: row.referrerVisitId,
    transitionType: row.transitionType,
    rawVisitTime: row.rawVisitTime,
    importedAtMs: row.importedAtMs,
  }));
}
