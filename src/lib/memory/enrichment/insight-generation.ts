import { createOpenAI } from '@ai-sdk/openai';
import { generateObject, jsonSchema } from 'ai';

import type { MemorySession, SessionInsight } from '@/lib/memory/domain/types';

const MEMORY_MODEL = 'gpt-oss-120b';

type SessionInsightObject = {
  summary: string;
  themes: string[];
  behaviorSignals: string[];
  goalHypotheses: string[];
  confidence: number;
};

export async function generateSessionInsight(
  session: MemorySession,
  cerebrasApiKey: string,
): Promise<SessionInsight> {
  const fallback = buildFallbackInsight(session);
  if (!cerebrasApiKey) {
    return fallback;
  }

  try {
    const openai = createOpenAI({
      apiKey: cerebrasApiKey,
      baseURL: 'https://api.cerebras.ai/v1',
    });
    const { object } = await generateObject({
      model: openai.chat(MEMORY_MODEL),
      schema: jsonSchema<SessionInsightObject>({
        type: 'object',
        additionalProperties: false,
        required: ['summary', 'themes', 'behaviorSignals', 'goalHypotheses', 'confidence'],
        properties: {
          summary: { type: 'string' },
          themes: { type: 'array', items: { type: 'string' }, maxItems: 5 },
          behaviorSignals: {
            type: 'array',
            items: { type: 'string' },
            maxItems: 5,
          },
          goalHypotheses: {
            type: 'array',
            items: { type: 'string' },
            maxItems: 5,
          },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
        },
      }),
      prompt: [
        'You are enriching a browser-memory session for a mentoring agent.',
        'Return compact, concrete JSON only.',
        `Session title: ${session.title}`,
        `Primary domain: ${session.primaryDomain ?? 'unknown'}`,
        `Visit count: ${session.visitCount}`,
        `Top domains: ${session.evidence.topDomains.map((entry) => `${entry.domain} (${entry.count})`).join(', ')}`,
        `Titles: ${session.evidence.titles.join(' | ')}`,
        `URLs: ${session.evidence.canonicalUrls.join(' | ')}`,
      ].join('\n'),
    });

    return {
      sessionId: session.id,
      summary: object.summary.trim() || fallback.summary,
      themes: normalizeStrings(object.themes, fallback.themes),
      behaviorSignals: normalizeStrings(object.behaviorSignals, fallback.behaviorSignals),
      goalHypotheses: normalizeStrings(object.goalHypotheses, fallback.goalHypotheses),
      confidence: clampConfidence(object.confidence),
      model: MEMORY_MODEL,
      updatedAtMs: Date.now(),
    };
  } catch {
    return fallback;
  }
}

export function buildFallbackInsight(session: MemorySession): SessionInsight {
  const themeCandidates = [
    ...(session.primaryDomain ? [session.primaryDomain] : []),
    ...extractKeywords(session.evidence.titles),
  ];
  const themes = uniqueStrings(themeCandidates).slice(0, 4);
  const behaviorSignals = [
    session.visitCount >= 5 ? 'sustained browsing session' : 'short exploratory session',
    session.evidence.topDomains.length > 1 ? 'cross-site comparison' : 'single-site deepening',
  ];
  const primaryTheme = themes[0] ?? 'the current topic';
  const goalHypotheses = [`Understand ${primaryTheme}`, `Decide next steps for ${primaryTheme}`];

  return {
    sessionId: session.id,
    summary: `Spent time reviewing ${themes.slice(0, 2).join(' and ') || 'recent browsing activity'} across ${session.visitCount} visits.`,
    themes,
    behaviorSignals: uniqueStrings(behaviorSignals),
    goalHypotheses: uniqueStrings(goalHypotheses),
    confidence: 0.45,
    model: 'heuristic-v1',
    updatedAtMs: Date.now(),
  };
}

function extractKeywords(titles: string[]): string[] {
  const stopWords = new Set(['and', 'for', 'from', 'into', 'that', 'this', 'with', 'your']);
  return titles
    .flatMap((title) => title.toLowerCase().split(/[^a-z0-9]+/))
    .filter((part) => part.length >= 4 && !stopWords.has(part));
}

function normalizeStrings(values: string[], fallback: string[]): string[] {
  const normalized = uniqueStrings(values.map((value) => value.trim()).filter(Boolean));
  return normalized.length > 0 ? normalized : fallback;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function clampConfidence(confidence: number): number {
  if (!Number.isFinite(confidence)) {
    return 0.5;
  }

  return Math.max(0, Math.min(1, confidence));
}
