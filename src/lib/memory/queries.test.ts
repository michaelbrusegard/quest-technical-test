import { describe, expect, it } from 'vitest';

import type { MemorySession } from '@/lib/memory/domain/types';

import { saveSessionInsight, syncSessions } from '@/lib/memory/db/repositories/index';
import { saveMemorySettings } from '@/lib/memory/domain/settings';
import {
  searchMemory,
  getRecentSessions,
  getSessionDetails,
  getDomainActivity,
} from '@/lib/memory/queries/index';
import { createTestMemoryDatabase } from '@/lib/memory/testing/test-helpers';

function createSession(overrides: Partial<MemorySession>): MemorySession {
  return {
    id: 'session:1',
    startedAtMs: 1_000,
    endedAtMs: 2_000,
    visitCount: 3,
    primaryDomain: 'example.com',
    title: 'Read docs',
    importanceScore: 2.5,
    evidence: {
      topDomains: [{ domain: 'example.com', count: 3 }],
      titles: ['Read docs'],
      canonicalUrls: ['https://example.com/docs'],
    },
    visits: [],
    ...overrides,
  };
}

describe('memory queries', () => {
  it('returns matching sessions from search and exact sessions', async () => {
    const db = await createTestMemoryDatabase();
    await saveMemorySettings({ autoEnrich: false }, db);
    await syncSessions(
      [
        createSession({
          id: 'session:1',
          startedAtMs: Date.now() - 10_000,
          title: 'Read React docs',
          primaryDomain: 'react.dev',
        }),
        createSession({
          id: 'session:2',
          startedAtMs: Date.now() - 20_000,
          title: 'Compare Vue docs',
          primaryDomain: 'vuejs.org',
        }),
      ],
      db,
    );
    await saveSessionInsight(
      {
        sessionId: 'session:1',
        summary: 'Reviewed React docs and examples.',
        themes: ['react'],
        behaviorSignals: ['sustained browsing session'],
        goalHypotheses: ['Understand react'],
        confidence: 0.6,
        model: 'heuristic-v1',
        updatedAtMs: Date.now(),
      },
      db,
    );

    const searchRes = await searchMemory({ query: 'React' }, db);
    const recentRes = await getRecentSessions({ limit: 1 }, db);
    const domainRes = await getDomainActivity({ domain: 'vuejs' }, db);
    const detailsRes = await getSessionDetails({ sessionId: 'session:1' }, db);

    expect(searchRes.sessions[0]?.title).toContain('React');
    expect(recentRes.sessions[0]?.title).toBe('Read React docs');
    expect(domainRes.sessions[0]?.title).toBe('Compare Vue docs');
    expect(detailsRes.session?.id).toBe('session:1');
    expect(detailsRes.insight?.themes).toEqual(['react']);
  });

  it('finds concept matches through indexed insights and falls back for broad queries', async () => {
    const now = Date.now();
    const db = await createTestMemoryDatabase();
    await saveMemorySettings({ autoEnrich: false }, db);
    await syncSessions(
      [
        createSession({
          id: 'session:nixos',
          startedAtMs: now - 2 * 24 * 60 * 60 * 1000,
          title: 'Flake experiments',
          primaryDomain: 'nixos.wiki',
          evidence: {
            topDomains: [{ domain: 'nixos.wiki', count: 2 }],
            titles: ['Flake experiments'],
            canonicalUrls: ['https://nixos.wiki/wiki/flakes'],
          },
        }),
        createSession({
          id: 'session:video',
          startedAtMs: now - 30 * 60 * 1000,
          title: 'Watched engineering talk',
          primaryDomain: 'youtube.com',
          evidence: {
            topDomains: [{ domain: 'youtube.com', count: 2 }],
            titles: ['Watched engineering talk'],
            canonicalUrls: ['https://www.youtube.com/watch?v=123'],
          },
        }),
      ],
      db,
    );
    await saveSessionInsight(
      {
        sessionId: 'session:nixos',
        summary: 'Configured NixOS using flakes and home-manager.',
        themes: ['nixos', 'configuration'],
        behaviorSignals: ['deep configuration work'],
        goalHypotheses: ['Finish the NixOS setup'],
        confidence: 0.75,
        model: 'heuristic-v1',
        updatedAtMs: now,
      },
      db,
    );

    const conceptRes = await searchMemory({ query: 'NixOS configuration' }, db);
    const recentRes = await searchMemory({ query: 'video I watched recently' }, db);
    const broadRes = await searchMemory({ query: 'anything' }, db);

    expect(conceptRes.sessions[0]?.id).toBe('session:nixos');
    expect(recentRes.sessions[0]?.id).toBe('session:video');
    expect(broadRes.sessions.length).toBeGreaterThan(0);
  });
});
