import type { MemoryOverview } from '@/lib/memory/domain/types';

export function createMemoryContext(overview: MemoryOverview): string {
  if (overview.visitCount === 0) {
    return 'The local memory database is enabled but does not contain imported browsing sessions yet.';
  }

  return [
    "The assistant is grounded in a local memory database built from the user's browser history.",
    `Known browser profiles: ${overview.sources.map((source) => `${source.browserName} (${source.profileName})`).join(', ') || 'none detected'}`,
    `Stored visits: ${overview.visitCount}`,
    `Stored sessions: ${overview.sessionCount}`,
    overview.lastSyncedAtMs
      ? `Last synced at: ${new Date(overview.lastSyncedAtMs).toISOString()}`
      : null,
    overview.recentThemes.length > 0
      ? `Recent themes: ${overview.recentThemes.join(', ')}`
      : 'Recent themes: not enough data yet',
    'Use the memory tools for claims about patterns, goals, or examples. Cite uncertainty when evidence is sparse.',
  ]
    .filter(Boolean)
    .join('\n');
}
