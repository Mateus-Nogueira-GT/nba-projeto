import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.{test,spec}.ts'],
    environment: 'node',
    // Concessão de andaime: no prompt 1 ainda não existe regra de negócio para testar.
    // Os 15 testes-âncora chegam no prompt 2.
    passWithNoTests: true,
  },
})
