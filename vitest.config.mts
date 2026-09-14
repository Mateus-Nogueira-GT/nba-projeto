import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    environment: 'node',
    // Concessão de andaime: no prompt 1 ainda não existe regra de negócio para testar.
    // Os 15 testes-âncora chegam no prompt 2.
    passWithNoTests: true,
    // As suítes de persistência sobem um Postgres real em WASM (PGlite) e aplicam
    // TODAS as migrations. Isso custa segundos, e as suítes sobem em paralelo —
    // o padrão de 10s estoura por concorrência de CPU, não por lentidão de regra.
    hookTimeout: 60_000,
  },
})
