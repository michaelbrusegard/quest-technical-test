import type { BrowserSource, StandardHistoryVisit } from '@/lib/browser-history';

export type MemorySettings = {
  enabled: boolean;
  autoEnrich: boolean;
  sessionGapMinutes: number;
  retentionDays: number;
  excludedDomains: string[];
};

export const DEFAULT_MEMORY_SETTINGS: MemorySettings = {
  enabled: true,
  autoEnrich: true,
  sessionGapMinutes: 30,
  retentionDays: 180,
  excludedDomains: ['localhost', '127.0.0.1'],
};

export type StoredVisit = StandardHistoryVisit & {
  canonicalUrl: string;
  importedAtMs: number;
};

export type SessionEvidence = {
  topDomains: Array<{ domain: string; count: number }>;
  titles: string[];
  canonicalUrls: string[];
};

export type MemorySession = {
  id: string;
  startedAtMs: number;
  endedAtMs: number;
  visitCount: number;
  primaryDomain: string | null;
  title: string;
  importanceScore: number;
  evidence: SessionEvidence;
  visits: StoredVisit[];
};

export type SessionInsight = {
  sessionId: string;
  summary: string;
  themes: string[];
  behaviorSignals: string[];
  goalHypotheses: string[];
  confidence: number;
  model: string;
  updatedAtMs: number;
};

export type MemoryOverview = {
  sources: BrowserSource[];
  visitCount: number;
  sessionCount: number;
  lastSyncedAtMs: number | null;
  lastEnrichedAtMs: number | null;
  recentThemes: string[];
};

export type MemorySearchResult = {
  summary: string;
  sessions: MemorySession[];
};

export type RecentSessionsResult = {
  summary: string;
  sessions: MemorySession[];
};

export type SessionDetailsResult = {
  summary: string;
  session: MemorySession | null;
  insight: SessionInsight | null;
};

export type DomainActivityResult = {
  summary: string;
  sessions: MemorySession[];
};
