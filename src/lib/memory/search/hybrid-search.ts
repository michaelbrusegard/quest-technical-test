import { desc, inArray } from 'drizzle-orm';

import type { MemoryDatabaseSession } from '@/lib/memory/db/client';
import type { MemorySearchResult } from '@/lib/memory/domain/types';

import { getMemoryDatabase, getMemoryQueryExecutor } from '@/lib/memory/db/client';
import { sessions } from '@/lib/memory/db/schema';
import { fillSessionsVisitsAndInsights } from '@/lib/memory/queries/mappers';
import { cosineSimilarity, embedMemoryTexts } from '@/lib/memory/search/embeddings';
import { ensureMemorySearchIndex } from '@/lib/memory/search/indexing';
import { buildMemorySearchPlan } from '@/lib/memory/search/query-plan';
import { tokenizeText } from '@/lib/memory/search/text';

type SearchDocumentRow = {
  id: string;
  sessionId: string;
  title: string;
  primaryDomain: string | null;
  searchText: string;
  embeddingJson: string | null;
  startedAtMs: number;
  endedAtMs: number;
};

type RankedDocument = {
  documentId: string;
  sessionId: string;
  rank: number;
  kind: 'lexical' | 'semantic';
};

const MAX_DOCUMENT_CANDIDATES = 24;
const RRF_SMOOTHING = 60;

export async function searchMemoryHybrid(
  query: string,
  limit = 5,
  db?: MemoryDatabaseSession,
): Promise<MemorySearchResult> {
  const resolvedLimit = Number.isFinite(limit) && limit >= 1 ? Math.floor(limit) : 5;
  const resolvedDb = db ?? (await getMemoryDatabase());
  await ensureMemorySearchIndex(resolvedDb);

  const plan = buildMemorySearchPlan(query);
  const [lexicalResults, semanticResults] = await Promise.all([
    searchLexicalDocuments(plan.lexicalQuery, plan.timeWindow, resolvedDb),
    searchSemanticDocuments(plan.semanticQuery, plan.timeWindow, resolvedDb),
  ]);

  const rankedSessionIds = rankSessions({
    lexicalResults,
    semanticResults,
    lexicalWeight: plan.lexicalWeight,
    semanticWeight: plan.semanticWeight,
    broadQuery: plan.broadQuery,
  }).slice(0, resolvedLimit);

  const finalSessionIds =
    rankedSessionIds.length > 0
      ? rankedSessionIds
      : await loadFallbackSessionIds(resolvedLimit, plan.timeWindow, resolvedDb);

  const mappedSessions = await loadRankedSessions(finalSessionIds, resolvedDb);

  return {
    summary:
      mappedSessions.length > 0
        ? `Found ${mappedSessions.length} browsing sessions matching "${query}".`
        : `No browsing sessions matched the search for "${query}".`,
    sessions: mappedSessions,
  };
}

async function searchLexicalDocuments(
  lexicalQuery: string | null,
  timeWindow: { startMs: number; endMs?: number; strict: boolean } | null,
  db: MemoryDatabaseSession,
): Promise<RankedDocument[]> {
  if (!lexicalQuery) {
    return [];
  }

  const executor = getMemoryQueryExecutor(db);
  const timeFilter = buildTimeFilterSql(timeWindow);
  const sql = `
    SELECT f.document_id, d.session_id
    FROM search_documents_fts f
    INNER JOIN search_documents d ON d.id = f.document_id
    WHERE search_documents_fts MATCH ?${timeFilter.sql}
    ORDER BY bm25(search_documents_fts, 4.0, 3.0, 1.0), d.started_at_ms DESC
    LIMIT ?
  `;

  try {
    const result = await executor.execute({
      sql,
      params: [lexicalQuery, ...timeFilter.params, MAX_DOCUMENT_CANDIDATES],
      method: 'all',
    });

    return (result.rows ?? []).flatMap((row, index) => {
      const [documentId, sessionId] = row;
      return typeof documentId === 'string' && typeof sessionId === 'string'
        ? [
            {
              documentId,
              sessionId,
              rank: index + 1,
              kind: 'lexical' as const,
            },
          ]
        : [];
    });
  } catch {
    const fallbackRows = await loadSearchDocuments(timeWindow, db);
    const lexicalTerms = tokenizeText(lexicalQuery, { keepStopWords: true });

    return fallbackRows
      .map((row) => ({
        row,
        score: scoreLexicalFallback(row, lexicalTerms),
      }))
      .filter((entry) => entry.score > 0)
      .toSorted(
        (left, right) => right.score - left.score || right.row.startedAtMs - left.row.startedAtMs,
      )
      .slice(0, MAX_DOCUMENT_CANDIDATES)
      .map((entry, index) => ({
        documentId: entry.row.id,
        sessionId: entry.row.sessionId,
        rank: index + 1,
        kind: 'lexical' as const,
      }));
  }
}

async function searchSemanticDocuments(
  semanticQuery: string,
  timeWindow: { startMs: number; endMs?: number; strict: boolean } | null,
  db: MemoryDatabaseSession,
): Promise<RankedDocument[]> {
  const trimmedQuery = semanticQuery.trim();
  if (!trimmedQuery) {
    return [];
  }

  const { embeddings } = embedMemoryTexts([trimmedQuery], 'query');
  const [queryEmbedding] = embeddings;
  if (!queryEmbedding) {
    return [];
  }

  const rows = await loadSearchDocuments(timeWindow, db);

  return rows
    .map((row) => ({
      row,
      score: cosineSimilarity(queryEmbedding, parseEmbedding(row.embeddingJson)),
    }))
    .filter((entry) => entry.score > 0)
    .toSorted(
      (left, right) => right.score - left.score || right.row.startedAtMs - left.row.startedAtMs,
    )
    .slice(0, MAX_DOCUMENT_CANDIDATES)
    .map((entry, index) => ({
      documentId: entry.row.id,
      sessionId: entry.row.sessionId,
      rank: index + 1,
      kind: 'semantic' as const,
    }));
}

function rankSessions(args: {
  lexicalResults: RankedDocument[];
  semanticResults: RankedDocument[];
  lexicalWeight: number;
  semanticWeight: number;
  broadQuery: boolean;
}): string[] {
  const documentScores = new Map<string, number>();
  const sessionScores = new Map<string, number>();
  const sessionSupport = new Map<string, number>();

  for (const result of args.lexicalResults) {
    const score = args.lexicalWeight / (RRF_SMOOTHING + result.rank);
    documentScores.set(result.documentId, (documentScores.get(result.documentId) ?? 0) + score);
    sessionScores.set(result.sessionId, Math.max(sessionScores.get(result.sessionId) ?? 0, score));
    sessionSupport.set(result.sessionId, (sessionSupport.get(result.sessionId) ?? 0) + 1);
  }

  for (const result of args.semanticResults) {
    const score = args.semanticWeight / (RRF_SMOOTHING + result.rank);
    documentScores.set(result.documentId, (documentScores.get(result.documentId) ?? 0) + score);
    sessionScores.set(result.sessionId, Math.max(sessionScores.get(result.sessionId) ?? 0, score));
    sessionSupport.set(result.sessionId, (sessionSupport.get(result.sessionId) ?? 0) + 1);
  }

  return [...sessionScores.entries()]
    .map(([sessionId, score]) => ({
      sessionId,
      score: score + Math.min((sessionSupport.get(sessionId) ?? 1) - 1, 3) * 0.0025,
    }))
    .filter((entry) => args.broadQuery || entry.score >= 0.01)
    .toSorted((left, right) => right.score - left.score)
    .map((entry) => entry.sessionId);
}

async function loadFallbackSessionIds(
  limit: number,
  timeWindow: { startMs: number; endMs?: number; strict: boolean } | null,
  db: MemoryDatabaseSession,
): Promise<string[]> {
  const rows = await db
    .select()
    .from(sessions)
    .orderBy(desc(sessions.importanceScore), desc(sessions.startedAtMs));

  return rows
    .filter((row) => matchesTimeWindow(row.startedAtMs, timeWindow))
    .slice(0, limit)
    .map((row) => row.id);
}

async function loadRankedSessions(
  sessionIds: string[],
  db: MemoryDatabaseSession,
): Promise<MemorySearchResult['sessions']> {
  if (sessionIds.length === 0) {
    return [];
  }

  const rows = await db.select().from(sessions).where(inArray(sessions.id, sessionIds));
  const mappedSessions = await fillSessionsVisitsAndInsights(rows, db);
  const sessionsById = new Map(mappedSessions.map((session) => [session.id, session]));

  return sessionIds.flatMap((sessionId) => {
    const session = sessionsById.get(sessionId);
    return session ? [session] : [];
  });
}

async function loadSearchDocuments(
  timeWindow: { startMs: number; endMs?: number; strict: boolean } | null,
  db: MemoryDatabaseSession,
): Promise<SearchDocumentRow[]> {
  const executor = getMemoryQueryExecutor(db);
  const timeFilter = buildTimeFilterSql(timeWindow);
  const result = await executor.execute({
    sql: `
      SELECT id, session_id, title, primary_domain, search_text, embedding_json, started_at_ms, ended_at_ms
      FROM search_documents
      WHERE 1 = 1${timeFilter.sql}
      ORDER BY started_at_ms DESC
    `,
    params: timeFilter.params,
    method: 'all',
  });

  return (result.rows ?? []).flatMap((row) => {
    const [id, sessionId, title, primaryDomain, searchText, embeddingJson, startedAtMs, endedAtMs] =
      row;
    return typeof id === 'string' &&
      typeof sessionId === 'string' &&
      typeof title === 'string' &&
      typeof searchText === 'string' &&
      typeof startedAtMs === 'number' &&
      typeof endedAtMs === 'number'
      ? [
          {
            id,
            sessionId,
            title,
            primaryDomain: typeof primaryDomain === 'string' ? primaryDomain : null,
            searchText,
            embeddingJson: typeof embeddingJson === 'string' ? embeddingJson : null,
            startedAtMs,
            endedAtMs,
          } satisfies SearchDocumentRow,
        ]
      : [];
  });
}

function buildTimeFilterSql(
  timeWindow: { startMs: number; endMs?: number; strict: boolean } | null,
): {
  sql: string;
  params: unknown[];
} {
  if (!timeWindow) {
    return { sql: '', params: [] };
  }

  if (typeof timeWindow.endMs === 'number') {
    return {
      sql: ' AND started_at_ms >= ? AND started_at_ms <= ?',
      params: [timeWindow.startMs, timeWindow.endMs],
    };
  }

  if (timeWindow.strict) {
    return {
      sql: ' AND started_at_ms >= ?',
      params: [timeWindow.startMs],
    };
  }

  return {
    sql: '',
    params: [],
  };
}

function matchesTimeWindow(
  startedAtMs: number,
  timeWindow: { startMs: number; endMs?: number; strict: boolean } | null,
): boolean {
  if (!timeWindow) {
    return true;
  }

  if (timeWindow.strict && startedAtMs < timeWindow.startMs) {
    return false;
  }

  if (typeof timeWindow.endMs === 'number' && startedAtMs > timeWindow.endMs) {
    return false;
  }

  return true;
}

function scoreLexicalFallback(row: SearchDocumentRow, lexicalTerms: string[]): number {
  if (lexicalTerms.length === 0) {
    return 0;
  }

  const haystack = `${row.title} ${row.primaryDomain ?? ''} ${row.searchText}`.toLowerCase();
  let score = 0;

  for (const term of lexicalTerms) {
    if (row.primaryDomain?.toLowerCase().includes(term)) {
      score += 4;
    }
    if (row.title.toLowerCase().includes(term)) {
      score += 3;
    }
    if (haystack.includes(term)) {
      score += 1;
    }
  }

  return score;
}

function parseEmbedding(value: string | null): number[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.flatMap((entry) => (typeof entry === 'number' ? [entry] : []))
      : [];
  } catch {
    return [];
  }
}
