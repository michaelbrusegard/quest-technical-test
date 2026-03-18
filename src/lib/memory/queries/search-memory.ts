import type { MemorySearchResult } from '@/lib/memory/domain/types';

import { getMemoryDatabase, type MemoryDatabaseSession } from '@/lib/memory/db/client';
import { searchMemoryHybrid } from '@/lib/memory/search/hybrid-search';

export type SearchMemoryArgs = {
  query: string;
  limit?: number;
};

export async function searchMemory(
  { query, limit = 5 }: SearchMemoryArgs,
  db?: MemoryDatabaseSession,
): Promise<MemorySearchResult> {
  const resolvedDb = db ?? (await getMemoryDatabase());
  return searchMemoryHybrid(query, limit, resolvedDb);
}
