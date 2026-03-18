import { describe, expect, it } from 'vitest';

import type { StandardHistoryVisit } from '@/lib/browser-history';

import { DEFAULT_MEMORY_SETTINGS } from '@/lib/memory/domain/types';
import { canonicalizeUrl, normalizeVisit } from '@/lib/memory/ingestion/canonicalize';

const baseVisit: StandardHistoryVisit = {
  sourceId: 'chrome-default',
  browserFamily: 'chromium',
  browserName: 'Chrome',
  profileName: 'Default',
  visitId: '1',
  url: 'https://example.com/',
  title: 'Example',
  visitedAtMs: 1_000,
  domain: 'example.com',
  visitCount: 1,
  typedCount: 0,
  referrerVisitId: null,
  transitionType: 'link',
  rawVisitTime: '1000',
};

describe('canonicalizeUrl', () => {
  it('removes tracking parameters and fragments', () => {
    expect(
      canonicalizeUrl('https://example.com/docs/?utm_source=test&fbclid=1&keep=yes#section'),
    ).toBe('https://example.com/docs?keep=yes');
  });

  it('normalizes the root path', () => {
    expect(canonicalizeUrl('https://Example.com/')).toBe('https://example.com');
  });
});

describe('normalizeVisit', () => {
  it('returns null for excluded domains', () => {
    const visit = {
      ...baseVisit,
      domain: 'localhost',
      url: 'http://localhost:3000',
    };
    expect(normalizeVisit(visit, DEFAULT_MEMORY_SETTINGS, 5_000)).toBeNull();
  });

  it('returns a stored visit with canonical URL', () => {
    const visit = {
      ...baseVisit,
      url: 'https://example.com/page/?utm_campaign=test&id=42#top',
    };

    expect(normalizeVisit(visit, DEFAULT_MEMORY_SETTINGS, 5_000)).toMatchObject({
      canonicalUrl: 'https://example.com/page?id=42',
      importedAtMs: 5_000,
    });
  });
});
