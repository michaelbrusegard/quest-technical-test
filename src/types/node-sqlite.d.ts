declare module 'node:sqlite' {
  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): {
      run: (...params: unknown[]) => void;
      all: (...params: unknown[]) => object[];
    };
  }
}

declare module 'node:module' {
  export function createRequire(url: string): (id: string) => unknown;
}
