import { sql } from 'drizzle-orm';

import type { SessionInsight } from '@/lib/memory/domain/types';

import { getMemoryDatabase, type MemoryDatabaseSession } from '@/lib/memory/db/client';
import { sessionInsights } from '@/lib/memory/db/schema';

export async function saveSessionInsight(
  insight: SessionInsight,
  db?: MemoryDatabaseSession,
): Promise<void> {
  const resolvedDb = db ?? (await getMemoryDatabase());
  await resolvedDb
    .insert(sessionInsights)
    .values({
      sessionId: insight.sessionId,
      summary: insight.summary,
      themesJson: JSON.stringify(insight.themes),
      behaviorSignalsJson: JSON.stringify(insight.behaviorSignals),
      goalHypothesesJson: JSON.stringify(insight.goalHypotheses),
      confidence: insight.confidence,
      model: insight.model,
      updatedAtMs: insight.updatedAtMs,
    })
    .onConflictDoUpdate({
      target: sessionInsights.sessionId,
      set: {
        summary: sql`excluded.summary`,
        themesJson: sql`excluded.themes_json`,
        behaviorSignalsJson: sql`excluded.behavior_signals_json`,
        goalHypothesesJson: sql`excluded.goal_hypotheses_json`,
        confidence: sql`excluded.confidence`,
        model: sql`excluded.model`,
        updatedAtMs: sql`excluded.updated_at_ms`,
      },
    });
}
