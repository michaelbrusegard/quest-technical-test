import { describe, expect, it } from 'vitest';

import { DEFAULT_MEMORY_SETTINGS, type StoredVisit } from '@/lib/memory/domain/types';
import { sessionizeVisits } from '@/lib/memory/ingestion/sessionize';

function createVisit(overrides: Partial<StoredVisit>): StoredVisit {
  return {
    sourceId: 'chrome-default',
    browserFamily: 'chromium',
    browserName: 'Chrome',
    profileName: 'Default',
    visitId: '1',
    url: 'https://example.com',
    canonicalUrl: 'https://example.com',
    title: 'Example',
    visitedAtMs: 1_000,
    domain: 'example.com',
    visitCount: 1,
    typedCount: 0,
    referrerVisitId: null,
    transitionType: 'link',
    rawVisitTime: '1000',
    importedAtMs: 2_000,
    ...overrides,
  };
}

describe('sessionizeVisits', () => {
  it('groups visits into sessions based on the configured gap', () => {
    const visits = [
      createVisit({ visitId: '1', visitedAtMs: 0, rawVisitTime: '0' }),
      createVisit({ visitId: '2', visitedAtMs: 60_000, rawVisitTime: '60000' }),
      createVisit({
        visitId: '3',
        visitedAtMs: 2_100_000,
        rawVisitTime: '2100000',
      }),
    ];

    const sessions = sessionizeVisits(visits, DEFAULT_MEMORY_SETTINGS);

    expect(sessions).toHaveLength(2);
    expect(sessions[0]).toMatchObject({
      visitCount: 2,
      primaryDomain: 'example.com',
    });
    expect(sessions[1]).toMatchObject({
      visitCount: 1,
      id: 'session:chrome-default:3:chrome-default:3',
    });
  });

  it('captures evidence from the grouped visits', () => {
    const visits = [
      createVisit({
        visitId: '1',
        title: 'Query docs',
        canonicalUrl: 'https://example.com/docs',
      }),
      createVisit({
        visitId: '2',
        title: 'Query docs',
        canonicalUrl: 'https://example.com/docs',
      }),
      createVisit({
        visitId: '3',
        title: 'Example issue',
        domain: 'issues.example.com',
      }),
    ];

    const session = sessionizeVisits(visits, DEFAULT_MEMORY_SETTINGS)[0];

    expect(session).toBeDefined();
    expect(session?.evidence.topDomains).toEqual([
      { domain: 'example.com', count: 2 },
      { domain: 'issues.example.com', count: 1 },
    ]);
    expect(session?.evidence.titles[0]).toBe('Query docs');
  });
});
