import { sql } from 'drizzle-orm';

import type { Cursor } from '@/lib/browser-history';

import { getMemoryDatabase, type MemoryDatabaseSession } from '@/lib/memory/db/client';
import { syncState } from '@/lib/memory/db/schema';

export async function loadSyncCursors(db?: MemoryDatabaseSession): Promise<Record<string, Cursor>> {
  const resolvedDb = db ?? (await getMemoryDatabase());
  const rows = await resolvedDb
    .select({
      sourceId: syncState.sourceId,
      lastVisitTime: syncState.lastVisitTime,
      lastVisitId: syncState.lastVisitId,
    })
    .from(syncState);

  return Object.fromEntries(
    rows.map((row) => [
      row.sourceId,
      {
        lastVisitTime: row.lastVisitTime,
        lastVisitId: row.lastVisitId,
      },
    ]),
  );
}

export async function upsertSyncState(
  cursors: Record<string, Cursor>,
  syncedAtMs: number,
  db?: MemoryDatabaseSession,
): Promise<void> {
  const resolvedDb = db ?? (await getMemoryDatabase());

  for (const [sourceId, cursor] of Object.entries(cursors)) {
    await resolvedDb
      .insert(syncState)
      .values({
        sourceId,
        lastVisitTime: cursor.lastVisitTime,
        lastVisitId: cursor.lastVisitId,
        lastSyncedAtMs: syncedAtMs,
      })
      .onConflictDoUpdate({
        target: syncState.sourceId,
        set: {
          lastVisitTime: sql`excluded.last_visit_time`,
          lastVisitId: sql`excluded.last_visit_id`,
          lastSyncedAtMs: sql`excluded.last_synced_at_ms`,
        },
      });
  }
}
