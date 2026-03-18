declare module 'sql.js' {
  export type SqlValue = string | number | bigint | Uint8Array | null;
  export type BindParams = readonly SqlValue[] | Record<string, SqlValue>;

  export type Statement = {
    bind(params?: BindParams): void;
    step(): boolean;
    getAsObject(): Record<string, unknown>;
    free(): boolean;
  };

  export type Database = {
    run(sql: string, params?: BindParams): Database;
    exec(sql: string): Array<{ columns: string[]; values: unknown[][] }>;
    prepare(sql: string, params?: BindParams): Statement;
    export(): Uint8Array;
    close(): void;
  };

  export type SqlJsStatic = {
    Database: new (data?: Uint8Array | number[]) => Database;
  };

  export default function initSqlJs(config?: {
    locateFile?: (file: string) => string;
  }): Promise<SqlJsStatic>;
}

declare module 'sql.js/dist/sql-asm.js' {
  import initSqlJs from 'sql.js';

  export default initSqlJs;
}
