import { expect, test, type Page } from '@playwright/test'

const EMAIL = process.env.E2E_EMAIL ?? ''
const SENHA = process.env.E2E_SENHA ?? ''
test.skip(!EMAIL || !SENHA, 'defina E2E_EMAIL e E2E_SENHA (conta com cortesia)')

// A sessão vem do projeto `setup` (playwright.config.ts): nenhum teste daqui
// faz login — ver `entrar.setup.ts`.

/**
 * O formulário do "Registrei" de um card. Filtra por `input[name="unidades"]`
 * em vez de `form[action]`: o atributo `action` de um form de server action
 * no HTML do servidor é detalhe do React, e o `<form method="get">` da banca
 * já fica de fora por não ter esse campo.
 */
const formularioDoCard = (page: Page) =>
  page.locator('form').filter({ has: page.locator('input[name="unidades"]') }).first()

/**
 * O valor impresso logo abaixo de um dos quatro números ("1 unidade", "Teto
 * por entrada"…). Comparar antes × depois, em vez de procurar "R$ 5,00" na
 * página: esse texto também é o valor de algum card, e o `gestao_banca` do
 * ruleset é de demonstração — vai mudar.
 */
const valorDoNumero = (page: Page, rotulo: string) =>
  page
    .locator('p', { hasText: new RegExp(`^${rotulo}$`) })
    .locator('xpath=following-sibling::p[1]')
    .innerText()

test.describe('Gestão de banca — botão a botão', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/gestao')
    await expect(page).toHaveURL(/\/gestao/)
  })

  test('assinante vê o formulário, não a silhueta', async ({ page }) => {
    await expect(page.locator('input[name="unidades"]').first()).toBeVisible()
    await expect(page.getByText('Registrar entradas é do plano MVP')).toHaveCount(0)
  })

  test('chips e Aplicar mudam a banca pela URL', async ({ page }) => {
    const padrao = await valorDoNumero(page, '1 unidade')

    await page.getByRole('link', { name: /R\$\s?500,00/ }).click()
    await expect(page).toHaveURL(/banca=500/)
    const em500 = await valorDoNumero(page, '1 unidade')
    expect(em500).toMatch(/R\$/)
    expect(em500).not.toBe(padrao)

    await page.fill('input[name="banca"]', '750')
    await page.getByRole('button', { name: 'Aplicar' }).click()
    await expect(page).toHaveURL(/banca=750/)
    const em750 = await valorDoNumero(page, '1 unidade')
    expect(em750).toMatch(/R\$/)
    expect(em750).not.toBe(em500)
  })

  test('registrar, registrar de novo, e ver uma entrada só', async ({ page }) => {
    const primeira = formularioDoCard(page)

    await primeira.locator('input[name="unidades"]').fill('1.5')
    await primeira.locator('input[name="odd"]').fill('1.62')
    await primeira.getByRole('button', { name: 'Registrei' }).click()
    await expect(page).toHaveURL(/ver=realizadas/)
    await expect(page.getByText('1.5 unidades')).toBeVisible()
    await expect(page.getByText('odd 1.62')).toBeVisible()

    await page.goto('/gestao')
    const mesma = formularioDoCard(page)
    await mesma.locator('input[name="unidades"]').fill('3')
    await mesma.locator('input[name="odd"]').fill('2.10')
    await mesma.getByRole('button', { name: 'Registrei' }).click()
    await expect(page).toHaveURL(/ver=realizadas/)
    // Uma entrada só: a antiga sumiu e a nova está lá — é o upsert visto da tela.
    await expect(page.getByText('3 unidades')).toHaveCount(1)
    await expect(page.getByText('1.5 unidades')).toHaveCount(0)
  })

  test('odd inválida passa do navegador e é recusada no servidor', async ({ page }) => {
    const form = formularioDoCard(page)
    await form.evaluate((f) => ((f as HTMLFormElement).noValidate = true))
    await form.locator('input[name="odd"]').fill('0.5')
    await form.getByRole('button', { name: 'Registrei' }).click()
    await expect(page).toHaveURL(/erro=entrada-invalida/)
    // Filtrado pelo texto: o anunciador de rotas do Next também é um
    // `role="alert"` (no shadow DOM, que o Playwright atravessa).
    await expect(page.getByRole('alert').filter({ hasText: 'Confira unidades e odd.' })).toBeVisible()
  })
})

test.describe('sem JavaScript', () => {
  // A sessão salva vale aqui também: o login precisa de JavaScript, a Gestão
  // não — e é a Gestão que a tela promete funcionar sem ele.
  test.use({ javaScriptEnabled: false })

  test('Aplicar e Registrei funcionam por formulário puro', async ({ page }) => {
    await page.goto('/gestao')
    await expect(page).toHaveURL(/\/gestao/)
    await page.fill('input[name="banca"]', '800')
    await page.getByRole('button', { name: 'Aplicar' }).click()
    await expect(page).toHaveURL(/banca=800/)

    const form = formularioDoCard(page)
    await form.locator('input[name="unidades"]').fill('2')
    await form.getByRole('button', { name: 'Registrei' }).click()
    await expect(page).toHaveURL(/ver=realizadas/)
    await expect(page.getByText('2 unidades')).toBeVisible()
  })
})
