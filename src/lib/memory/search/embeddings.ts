import { tokenizeText } from '@/lib/memory/search/text';

export const FALLBACK_EMBEDDING_DIMENSIONS = 384;

type EmbedMode = 'passage' | 'query';

type MemoryEmbeddingResponse = {
  embeddings: number[][];
  model: string;
};

export function embedMemoryTexts(texts: string[], mode: EmbedMode): MemoryEmbeddingResponse {
  if (texts.length === 0) {
    return { embeddings: [], model: 'none' };
  }

  return {
    embeddings: texts.map((text) => buildHashEmbedding(text, mode)),
    model: 'hashing-v1',
  };
}

export function cosineSimilarity(left: number[], right: number[]): number {
  const dimensions = Math.min(left.length, right.length);
  if (dimensions === 0) {
    return 0;
  }

  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < dimensions; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dot += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return 0;
  }

  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

function buildHashEmbedding(text: string, mode: EmbedMode): number[] {
  const vector = Array.from({ length: FALLBACK_EMBEDDING_DIMENSIONS }, () => 0);
  const terms = tokenizeText(text, { keepStopWords: true });
  const weightedTerms = [
    ...terms.map((term) => ({ term, weight: mode === 'query' ? 1.2 : 1 })),
    ...buildBigrams(terms).map((term) => ({ term, weight: 1.4 })),
  ];

  for (const { term, weight } of weightedTerms) {
    const bucket = hashToBucket(term, FALLBACK_EMBEDDING_DIMENSIONS);
    vector[bucket] = (vector[bucket] ?? 0) + weight;
  }

  return normalizeVector(vector);
}

function buildBigrams(tokens: string[]): string[] {
  const bigrams: string[] = [];
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const current = tokens[index];
    const next = tokens[index + 1];
    if (!current || !next) {
      continue;
    }
    bigrams.push(`${current}:${next}`);
  }
  return bigrams;
}

function hashToBucket(value: string, buckets: number): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return Math.abs(hash) % buckets;
}

function normalizeVector(values: number[]): number[] {
  const magnitude = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  if (magnitude === 0) {
    return values;
  }

  return values.map((value) => Number((value / magnitude).toFixed(8)));
}
