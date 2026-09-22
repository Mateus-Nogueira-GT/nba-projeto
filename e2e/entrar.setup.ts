import { expect, test as setup } from '@playwright/test'

import { SESSAO_SALVA } from './sessao'

const EMAIL = process.env.E2E_EMAIL ?? ''
const SENHA = process.env.E2E_SENHA ?? ''
setup.skip(!EMAIL || !SENHA, 'defina E2E_EMAIL e E2E_SENHA (conta com cortesia)')

/**
 * UM login real pela tela, COM JavaScript, e a sessão salva para todas as specs.
 *
 * Por que uma vez só, e não um login por teste:
 * - o formulário de login é uma função de CLIENTE (`useActionState` em
 *   `entrar/formulario.tsx`), que sem JavaScript não envia nada — o teste
 *   "sem JavaScript" nunca passaria da tela de entrada;
 * - cada contexto novo nasce com `localStorage` vazio, o que gera outra
 *   impressão de aparelho e outra linha em `dispositivos`; com o limite de
 *   aparelhos, cinco logins derrubariam as outras sessões da conta.
 */
setup('entrar e salvar a sessão', async ({ page }) => {
  await page.goto('/entrar?destino=/')
  await page.fill('input[name="email"]', EMAIL)
  await page.fill('input[name="senha"]', SENHA)
  await page.locator('form button[type="submit"]').first().click()
  // O login é uma server action: navegar antes de ela voltar a abortaria
  // antes de o cookie chegar. Senha errada fica em /entrar — falha em 15 s
  // dizendo isso, em vez de esperar o timeout do teste.
  await page
    .waitForURL((url) => !url.pathname.startsWith('/entrar'), { timeout: 15_000 })
    .catch(() => {
      throw new Error('o login não saiu de /entrar — confira E2E_EMAIL e E2E_SENHA')
    })

  // `/gestao` não está na lista de destinos pós-login: o login termina em `/`.
  await page.goto('/gestao')
  if (page.url().includes('/metodologia')) {
    await page.locator('form button[type="submit"]').first().click()
    await page.waitForURL((url) => !url.pathname.startsWith('/metodologia'))
    await page.goto('/gestao')
  }
  await expect(page).toHaveURL(/\/gestao/)
  await page.context().storageState({ path: SESSAO_SALVA })
})
