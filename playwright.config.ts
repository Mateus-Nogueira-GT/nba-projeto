import { defineConfig } from '@playwright/test'

import { SESSAO_SALVA } from './e2e/sessao'

/**
 * E2E da Gestão — fora do CI. Precisa de `npm run dev` no ar, da temporada
 * simulada carregada e de uma conta com cortesia (runbook pente-fino-gestao).
 *
 * `@playwright/test` fica FIXO em 1.62.x: é a versão cujo Chromium (revisão
 * 1234) já está em ~/Library/Caches/ms-playwright. A 1.63 pede outra revisão
 * e baixa ~170 MB num disco que vive cheio.
 *
 * O projeto `setup` entra uma vez e salva a sessão; `gestao` depende dele e
 * nasce com ela (ver `e2e/entrar.setup.ts` para o porquê).
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  retries: 0,
  workers: 1, // as specs escrevem na MESMA conta; em paralelo uma apagaria a outra
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    {
      name: 'gestao',
      testMatch: /gestao\.spec\.ts/,
      dependencies: ['setup'],
      use: { storageState: SESSAO_SALVA },
    },
    // `front-v2` cuida do próprio login (se `E2E_EMAIL`/`E2E_SENHA` existirem):
    // não depende de `setup` porque a varredura roda também sem sessão, contra
    // a referência do cliente, onde essa conta não existe. Sem `storageState`
    // fixo por isso — cada `browser.newContext()` no spec decide o seu.
    { name: 'front-v2', testMatch: /front-v2\.spec\.ts/ },
  ],
})
