import { index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const MEMORY_DATABASE_PATH = 'memory/memory.sqlite';

export const memoryConfig = sqliteTable('memory_config', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAtMs: integer('updated_at_ms').notNull(),
});

export const syncState = sqliteTable('sync_state', {
  sourceId: text('source_id').primaryKey(),
  lastVisitTime: text('last_visit_time').notNull(),
  lastVisitId: text('last_visit_id').notNull(),
  lastSyncedAtMs: integer('last_synced_at_ms').notNull(),
});

export const visits = sqliteTable(
  'visits',
  {
    sourceId: text('source_id').notNull(),
    visitId: text('visit_id').notNull(),
    browserFamily: text('browser_family').notNull(),
    browserName: text('browser_name').notNull(),
    profileName: text('profile_name').notNull(),
    url: text('url').notNull(),
    canonicalUrl: text('canonical_url').notNull(),
    title: text('title'),
    visitedAtMs: integer('visited_at_ms').notNull(),
    domain: text('domain'),
    visitCount: integer('visit_count'),
    typedCount: integer('typed_count'),
    referrerVisitId: text('referrer_visit_id'),
    transitionType: text('transition_type'),
    rawVisitTime: text('raw_visit_time').notNull(),
    importedAtMs: integer('imported_at_ms').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.sourceId, table.visitId] }),
    index('idx_visits_visited_at_ms').on(table.visitedAtMs),
    index('idx_visits_domain').on(table.domain),
    index('idx_visits_canonical_url').on(table.canonicalUrl),
  ],
);

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    startedAtMs: integer('started_at_ms').notNull(),
    endedAtMs: integer('ended_at_ms').notNull(),
    visitCount: integer('visit_count').notNull(),
    primaryDomain: text('primary_domain'),
    title: text('title').notNull(),
    importanceScore: real('importance_score').notNull(),
    evidenceJson: text('evidence_json').notNull(),
  },
  (table) => [
    index('idx_sessions_started_at_ms').on(table.startedAtMs),
    index('idx_sessions_primary_domain').on(table.primaryDomain),
  ],
);

export const sessionVisits = sqliteTable(
  'session_visits',
  {
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    sourceId: text('source_id').notNull(),
    visitId: text('visit_id').notNull(),
    position: integer('position').notNull(),
  },
  (table) => [primaryKey({ columns: [table.sessionId, table.sourceId, table.visitId] })],
);

export const sessionInsights = sqliteTable('session_insights', {
  sessionId: text('session_id')
    .primaryKey()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  summary: text('summary').notNull(),
  themesJson: text('themes_json').notNull(),
  behaviorSignalsJson: text('behavior_signals_json').notNull(),
  goalHypothesesJson: text('goal_hypotheses_json').notNull(),
  confidence: real('confidence').notNull(),
  model: text('model').notNull(),
  updatedAtMs: integer('updated_at_ms').notNull(),
});

export const searchDocuments = sqliteTable(
  'search_documents',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    sourceType: text('source_type').notNull(),
    title: text('title').notNull(),
    primaryDomain: text('primary_domain'),
    searchText: text('search_text').notNull(),
    embeddingJson: text('embedding_json'),
    contentHash: text('content_hash').notNull(),
    embeddingModel: text('embedding_model'),
    startedAtMs: integer('started_at_ms').notNull(),
    endedAtMs: integer('ended_at_ms').notNull(),
    updatedAtMs: integer('updated_at_ms').notNull(),
  },
  (table) => [
    index('idx_search_documents_session_id').on(table.sessionId),
    index('idx_search_documents_source_type').on(table.sourceType),
    index('idx_search_documents_started_at_ms').on(table.startedAtMs),
  ],
);

export const schema = {
  memoryConfig,
  syncState,
  visits,
  sessions,
  sessionVisits,
  sessionInsights,
  searchDocuments,
};
