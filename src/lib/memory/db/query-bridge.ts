export type MemoryQueryMethod = 'run' | 'all' | 'values' | 'get';

export type MemoryQueryRequest = {
  sql: string;
  params: unknown[];
  method: MemoryQueryMethod;
};

export type MemoryQueryResult = {
  rows?: unknown[][];
};

export type MemoryQueryExecutor = {
  execute: (request: MemoryQueryRequest) => Promise<MemoryQueryResult>;
  batch: (batch: MemoryQueryRequest[]) => Promise<MemoryQueryResult[]>;
};
