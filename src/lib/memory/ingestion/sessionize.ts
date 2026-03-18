import type {
  MemorySession,
  MemorySettings,
  SessionEvidence,
  StoredVisit,
} from '@/lib/memory/domain/types';

export function sessionizeVisits(visits: StoredVisit[], settings: MemorySettings): MemorySession[] {
  if (visits.length === 0) {
    return [];
  }

  const sortedVisits = [...visits].toSorted((left, right) => left.visitedAtMs - right.visitedAtMs);
  const gapMs = settings.sessionGapMinutes * 60_000;
  const groupedVisits: StoredVisit[][] = [];

  for (const visit of sortedVisits) {
    const currentGroup = groupedVisits.at(-1);
    if (!currentGroup) {
      groupedVisits.push([visit]);
      continue;
    }

    const previousVisit = currentGroup.at(-1);
    if (!previousVisit || visit.visitedAtMs - previousVisit.visitedAtMs > gapMs) {
      groupedVisits.push([visit]);
      continue;
    }

    currentGroup.push(visit);
  }

  return groupedVisits.map((group) => buildSession(group));
}

function buildSession(visits: StoredVisit[]): MemorySession {
  const firstVisit = visits[0];
  if (!firstVisit) {
    throw new Error('Cannot build a session without visits');
  }

  const lastVisit = visits.at(-1) ?? firstVisit;
  const evidence = buildEvidence(visits);
  const title =
    evidence.titles[0] ??
    evidence.topDomains[0]?.domain ??
    firstVisit.title?.trim() ??
    firstVisit.domain ??
    'Browsing session';

  return {
    id: buildSessionId(firstVisit, lastVisit),
    startedAtMs: firstVisit.visitedAtMs,
    endedAtMs: lastVisit.visitedAtMs,
    visitCount: visits.length,
    primaryDomain: evidence.topDomains[0]?.domain ?? firstVisit.domain ?? null,
    title,
    importanceScore: calculateImportanceScore(visits, evidence),
    evidence,
    visits,
  };
}

function buildEvidence(visits: StoredVisit[]): SessionEvidence {
  const domainCounts = new Map<string, number>();
  const titleCounts = new Map<string, number>();
  const canonicalUrls = new Set<string>();

  for (const visit of visits) {
    if (visit.domain) {
      domainCounts.set(visit.domain, (domainCounts.get(visit.domain) ?? 0) + 1);
    }

    const normalizedTitle = visit.title?.trim();
    if (normalizedTitle) {
      titleCounts.set(normalizedTitle, (titleCounts.get(normalizedTitle) ?? 0) + 1);
    }

    canonicalUrls.add(visit.canonicalUrl);
  }

  return {
    topDomains: [...domainCounts.entries()]
      .toSorted((left, right) => right[1] - left[1])
      .slice(0, 3)
      .map(([domain, count]) => ({ domain, count })),
    titles: [...titleCounts.entries()]
      .toSorted((left, right) => right[1] - left[1])
      .slice(0, 5)
      .map(([title]) => title),
    canonicalUrls: [...canonicalUrls].slice(0, 5),
  };
}

function calculateImportanceScore(visits: StoredVisit[], evidence: SessionEvidence): number {
  void evidence;

  const firstVisit = visits[0];
  if (!firstVisit) {
    return 0;
  }

  const uniqueDomains = new Set(visits.map((visit) => visit.domain).filter(Boolean)).size;
  const typedVisits = visits.reduce((count, visit) => count + (visit.typedCount ?? 0), 0);
  const durationMs = Math.max(0, (visits.at(-1)?.visitedAtMs ?? 0) - firstVisit.visitedAtMs);
  const durationBonus = Math.min(durationMs / 600_000, 4);

  return Number(
    (visits.length * 0.6 + uniqueDomains * 0.5 + typedVisits * 0.1 + durationBonus).toFixed(2),
  );
}

function buildSessionId(firstVisit: StoredVisit, lastVisit: StoredVisit): string {
  return [
    'session',
    firstVisit.sourceId,
    firstVisit.visitId,
    lastVisit.sourceId,
    lastVisit.visitId,
  ].join(':');
}
