type RawMigrationModule = Record<string, string>;

const migrationModules = import.meta.glob('/drizzle/memory/**/migration.sql', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as RawMigrationModule;

export type BundledMigration = {
  id: string;
  path: string;
  sql: string;
};

export const bundledMemoryMigrations = Object.entries(migrationModules)
  .map(([path, sql]) => ({
    id: getMigrationId(path),
    path,
    sql,
  }))
  .toSorted((left, right) => left.path.localeCompare(right.path));

function getMigrationId(path: string): string {
  const segments = path.split('/');
  const fileName = segments.at(-1);
  const folderName = segments.at(-2);

  if (fileName !== 'migration.sql' || !folderName) {
    throw new Error(`Unsupported Drizzle migration path: ${path}`);
  }

  return folderName;
}
