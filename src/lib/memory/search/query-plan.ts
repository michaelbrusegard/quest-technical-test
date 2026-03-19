import * as chrono from 'chrono-node';

import {
  expandQueryTerms,
  normalizeText,
  tokenizeText,
  uniqueStrings,
} from '@/lib/memory/search/text';

export type SearchTimeWindow = {
  startMs: number;
  endMs?: number;
  strict: boolean;
};

export type MemorySearchPlan = {
  rawQuery: string;
  lexicalTerms: string[];
  semanticQuery: string;
  lexicalQuery: string | null;
  timeWindow: SearchTimeWindow | null;
  broadQuery: boolean;
  lexicalWeight: number;
  semanticWeight: number;
};

const VAGUE_TERMS = new Set(['anything', 'something', 'stuff', 'things']);

export function buildMemorySearchPlan(rawQuery: string, now = Date.now()): MemorySearchPlan {
  const trimmedQuery = rawQuery.trim();
  const normalized = normalizeText(trimmedQuery);
  const parsedWindow = parseTimeWindow(trimmedQuery, now);
  const queryWithoutTime = parsedWindow
    ? normalized
        .replaceAll(normalizeText(parsedWindow.matchedText), ' ')
        .replaceAll(/\s+/g, ' ')
        .trim()
    : normalized;
  const lexicalTerms = uniqueStrings(expandQueryTerms(queryWithoutTime));
  const broadQuery = lexicalTerms.every((term) => VAGUE_TERMS.has(term) || term.length <= 2);
  const hasDomainLikeTerm = /[a-z0-9-]+\.(com|org|net|io|dev|app|co)\b/i.test(queryWithoutTime);
  const lexicalWeight = hasDomainLikeTerm || lexicalTerms.length <= 2 ? 1.4 : 1.05;
  const semanticWeight = broadQuery || lexicalTerms.length > 2 ? 1.35 : 0.95;

  return {
    rawQuery: trimmedQuery,
    lexicalTerms,
    semanticQuery: queryWithoutTime || normalized,
    lexicalQuery: buildFtsQuery(lexicalTerms),
    timeWindow: parsedWindow
      ? {
          startMs: parsedWindow.startMs,
          ...(typeof parsedWindow.endMs === 'number' ? { endMs: parsedWindow.endMs } : {}),
          strict: parsedWindow.strict,
        }
      : null,
    broadQuery,
    lexicalWeight,
    semanticWeight,
  };
}

function buildFtsQuery(terms: string[]): string | null {
  const normalizedTerms = uniqueStrings(
    terms.map((term) => term.replaceAll(/[^a-z0-9]+/g, ' ').trim()),
  )
    .flatMap((term) => tokenizeText(term, { keepStopWords: true }))
    .filter((term) => term.length >= 2);

  if (normalizedTerms.length === 0) {
    return null;
  }

  return normalizedTerms.map((term) => `${term.replaceAll('"', '')}*`).join(' OR ');
}

function parseTimeWindow(
  query: string,
  now: number,
): (SearchTimeWindow & { matchedText: string }) | null {
  const normalized = normalizeText(query);
  if (normalized.includes('recently') || normalized.includes('lately')) {
    return {
      matchedText: normalized.includes('recently') ? 'recently' : 'lately',
      startMs: now - 14 * 24 * 60 * 60 * 1000,
      strict: false,
    };
  }

  const [parsed] = chrono.parse(query, new Date(now), { forwardDate: false });
  if (!parsed) {
    return null;
  }

  return {
    matchedText: parsed.text,
    startMs: parsed.start.date().getTime(),
    ...(parsed.end ? { endMs: parsed.end.date().getTime() } : {}),
    strict: true,
  };
}
