import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/lib/memory/db/schema.ts',
  out: './drizzle/memory',
  dialect: 'sqlite',
  strict: true,
});
