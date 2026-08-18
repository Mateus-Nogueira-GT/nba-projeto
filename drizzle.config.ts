import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/modules/dominio/db/schema/index.ts',
  out: './drizzle',
  casing: 'snake_case',
  dbCredentials: {
    // Nunca hardcoded: vem de `vercel env pull`.
    url: process.env.DATABASE_URL ?? '',
  },
})
