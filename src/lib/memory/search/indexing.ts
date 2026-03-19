import { desc, sql } from 'drizzle-orm';

import type { MemoryDatabaseSession } from '@/lib/memory/db/client';
import type { MemorySession, SessionInsight, StoredVisit } from '@/lib/memory/domain/types';

import { getMemoryDatabase, getMemoryQueryExecutor } from '@/lib/memory/db/client';
import { searchDocuments, sessionInsights, sessions } from '@/lib/memory/db/schema';
import { fillSessionsVisitsAndInsights, parseStringArray } from '@/lib/memory/queries/mappers';
import { embedMemoryTexts } from '@/lib/memory/search/embeddings';
import { buildSearchText, extractUrlTerms, uniqueStrings } from '@/lib/memory/search/text';

export type IndexedSearchDocument = {
  id: string;
  sessionId: string;
  sourceType: 'session_summary' | 'insight' | 'session_chunk';
  title: string;
  primaryDomain: string | null;
  searchText: string;
  embeddingText: string;
  embeddingJson: string | null;
  contentHash: string;
  embeddingModel: string | null;
  startedAtMs: number;
  endedAtMs: number;
  updatedAtMs: number;
};

type SearchSessionBundle = {
  session: MemorySession;
  insight: SessionInsight | null;
};

export async function rebuildMemorySearchIndex(db?: MemoryDatabaseSession): Promise<void> {
  const resolvedDb = db ?? (await getMemoryDatabase());
  const bundles = await loadSearchSessionBundles(resolvedDb);
  const documents = bundles.flatMap((bundle) => buildSearchDocuments(bundle));
  const embeddings = embedMemoryTexts(
    documents.map((document) => document.embeddingText),
    'passage',
  );

  const indexedDocuments = documents.map((document, index) => ({
    ...document,
    embeddingJson: JSON.stringify(embeddings.embeddings[index] ?? []),
    embeddingModel: embeddings.model,
  }));

  await resolvedDb.transaction(async (tx) => {
    await tx.delete(searchDocuments);

    if (indexedDocuments.length > 0) {
      await tx.insert(searchDocuments).values(
        indexedDocuments.map((document) => ({
          id: document.id,
          sessionId: document.sessionId,
          sourceType: document.sourceType,
          title: document.title,
          primaryDomain: document.primaryDomain,
          searchText: document.searchText,
          embeddingJson: document.embeddingJson,
          contentHash: document.contentHash,
          embeddingModel: document.embeddingModel,
          startedAtMs: document.startedAtMs,
          endedAtMs: document.endedAtMs,
          updatedAtMs: document.updatedAtMs,
        })),
      );
    }
  });

  await replaceFtsDocuments(indexedDocuments, resolvedDb);
}

export async function ensureMemorySearchIndex(db?: MemoryDatabaseSession): Promise<void> {
  const resolvedDb = db ?? (await getMemoryDatabase());
  const [[searchDocumentCountRow], [sessionCountRow]] = await Promise.all([
    resolvedDb.select({ count: sql<number>`count(*)` }).from(searchDocuments),
    resolvedDb.select({ count: sql<number>`count(*)` }).from(sessions),
  ]);

  if ((sessionCountRow?.count ?? 0) > 0 && (searchDocumentCountRow?.count ?? 0) === 0) {
    await rebuildMemorySearchIndex(resolvedDb);
  }
}

export function buildSearchDocuments(bundle: SearchSessionBundle): IndexedSearchDocument[] {
  const updatedAtMs = bundle.insight?.updatedAtMs ?? bundle.session.endedAtMs;
  const documents: IndexedSearchDocument[] = [
    buildDocument({
      id: `${bundle.session.id}:summary`,
      sessionId: bundle.session.id,
      sourceType: 'session_summary',
      title: bundle.session.title,
      primaryDomain: bundle.session.primaryDomain,
      searchText: buildSearchText([
        bundle.session.title,
        bundle.session.primaryDomain,
        bundle.session.evidence.topDomains.map((entry) => entry.domain).join(' '),
        bundle.session.evidence.titles.join(' '),
        bundle.session.evidence.canonicalUrls.flatMap((url) => extractUrlTerms(url)).join(' '),
      ]),
      embeddingText: buildSearchText([
        bundle.session.title,
        bundle.session.primaryDomain,
        bundle.session.evidence.titles.join(' '),
      ]),
      startedAtMs: bundle.session.startedAtMs,
      endedAtMs: bundle.session.endedAtMs,
      updatedAtMs,
    }),
  ];

  if (bundle.insight) {
    documents.push(
      buildDocument({
        id: `${bundle.session.id}:insight`,
        sessionId: bundle.session.id,
        sourceType: 'insight',
        title: `${bundle.session.title} insight`,
        primaryDomain: bundle.session.primaryDomain,
        searchText: buildSearchText([
          bundle.session.title,
          bundle.insight.summary,
          bundle.insight.themes.join(' '),
          bundle.insight.goalHypotheses.join(' '),
          bundle.insight.behaviorSignals.join(' '),
        ]),
        embeddingText: buildSearchText([
          bundle.insight.summary,
          bundle.insight.themes.join(' '),
          bundle.insight.goalHypotheses.join(' '),
        ]),
        startedAtMs: bundle.session.startedAtMs,
        endedAtMs: bundle.session.endedAtMs,
        updatedAtMs: bundle.insight.updatedAtMs,
      }),
    );
  }

  buildVisitChunks(bundle.session.visits).forEach((chunk, index) => {
    const title = chunk[0]?.title?.trim() || chunk[0]?.domain || bundle.session.title;
    const domains = uniqueStrings(chunk.map((visit) => visit.domain ?? '').filter(Boolean));
    const titles = chunk.map((visit) => visit.title?.trim()).filter(Boolean);
    const urls = chunk.flatMap((visit) => extractUrlTerms(visit.canonicalUrl));

    documents.push(
      buildDocument({
        id: `${bundle.session.id}:chunk:${index}`,
        sessionId: bundle.session.id,
        sourceType: 'session_chunk',
        title,
        primaryDomain: domains[0] ?? bundle.session.primaryDomain,
        searchText: buildSearchText([
          bundle.session.title,
          title,
          domains.join(' '),
          titles.join(' '),
          urls.join(' '),
        ]),
        embeddingText: buildSearchText([
          bundle.session.title,
          title,
          domains.join(' '),
          titles.join(' '),
        ]),
        startedAtMs: chunk[0]?.visitedAtMs ?? bundle.session.startedAtMs,
        endedAtMs: chunk.at(-1)?.visitedAtMs ?? bundle.session.endedAtMs,
        updatedAtMs,
      }),
    );
  });

  return documents;
}

async function replaceFtsDocuments(
  documents: IndexedSearchDocument[],
  db: MemoryDatabaseSession,
): Promise<void> {
  const executor = getMemoryQueryExecutor(db);

  try {
    await executor.execute({
      sql: `CREATE VIRTUAL TABLE IF NOT EXISTS search_documents_fts USING fts5(
        document_id UNINDEXED,
        session_id UNINDEXED,
        title,
        primary_domain,
        search_text,
        tokenize = 'unicode61 remove_diacritics 1'
      )`,
      params: [],
      method: 'run',
    });

    await executor.execute({
      sql: 'DELETE FROM search_documents_fts',
      params: [],
      method: 'run',
    });

    if (documents.length === 0) {
      return;
    }

    await executor.batch(
      documents.map((document) => ({
        sql: `
          INSERT INTO search_documents_fts (
            document_id,
            session_id,
            title,
            primary_domain,
            search_text
          ) VALUES (?, ?, ?, ?, ?)
        `,
        params: [
          document.id,
          document.sessionId,
          document.title,
          document.primaryDomain,
          document.searchText,
        ],
        method: 'run' as const,
      })),
    );
  } catch (error) {
    console.warn(
      '[search] FTS index update failed; lexical search will fall back to search_documents scan.',
      error,
    );
  }
}

async function loadSearchSessionBundles(db: MemoryDatabaseSession): Promise<SearchSessionBundle[]> {
  const [sessionRows, insightRows] = await Promise.all([
    db.select().from(sessions).orderBy(desc(sessions.startedAtMs)),
    db.select().from(sessionInsights),
  ]);
  const fullSessions = await fillSessionsVisitsAndInsights(sessionRows, db);
  const insightsBySessionId = new Map(
    insightRows.map((row) => [
      row.sessionId,
      {
        sessionId: row.sessionId,
        summary: row.summary,
        themes: parseStringArray(row.themesJson),
        behaviorSignals: parseStringArray(row.behaviorSignalsJson),
        goalHypotheses: parseStringArray(row.goalHypothesesJson),
        confidence: row.confidence,
        model: row.model,
        updatedAtMs: row.updatedAtMs,
      } satisfies SessionInsight,
    ]),
  );

  return fullSessions.map((session) => ({
    session,
    insight: insightsBySessionId.get(session.id) ?? null,
  }));
}

function buildDocument(
  document: Omit<IndexedSearchDocument, 'embeddingJson' | 'embeddingModel' | 'contentHash'>,
): IndexedSearchDocument {
  return {
    ...document,
    embeddingJson: null,
    embeddingModel: null,
    contentHash: hashContent(
      `${document.sourceType}:${document.searchText}:${document.embeddingText}`,
    ),
  };
}

function buildVisitChunks(visits: StoredVisit[]): StoredVisit[][] {
  const chunks: StoredVisit[][] = [];
  let currentChunk: StoredVisit[] = [];

  for (const visit of visits) {
    const previous = currentChunk.at(-1);
    const shouldStartNewChunk =
      currentChunk.length >= 4 ||
      (previous !== undefined && visit.domain !== previous.domain && currentChunk.length >= 2) ||
      (previous !== undefined && visit.visitedAtMs - previous.visitedAtMs > 10 * 60 * 1000);

    if (shouldStartNewChunk && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = [];
    }

    currentChunk.push(visit);
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

function hashContent(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `h${Math.abs(hash).toString(36)}`;
}
