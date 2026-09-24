import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { NivelDoPlano } from '@/modules/plataforma/assinatura/nivel-do-plano'

/**
 * FUMAÇA DO RETORNO DO MERCADO PAGO DO V2.
 *
 * O navegador volta do checkout com o que o Mercado Pago (ou qualquer um que
 * forje o link) quiser na query. Nada disso é prova de pagamento: quem diz
 * "confirmado" é o DIREITO que o servidor gravou a partir do webhook assinado
 * — aqui, o `acesso` de `exigirNivel`. A query só pode PIORAR a mensagem
 * (`estado=processando` segura o "confirmado" de quem já era pago e está
 * fazendo upgrade), nunca melhorá-la.
 */

let nivelDoTeste: NivelDoPlano = 'GRATIS'

vi.mock('@/modules/plataforma/auth/cookies', () => ({
  tokenDaSessaoAtual: async () => 'token-de-teste',
  sessaoAtual: async () => ({ usuarioId: '00000000-0000-4000-8000-000000000001', email: 'x@teste.com' }),
}))
vi.mock('@/modules/plataforma/assinatura/direito', async () => {
  const { acessoDeTeste } = await import('@/modules/plataforma/__tests__/acesso-de-teste')
  return { avaliarAcesso: async () => acessoDeTeste(nivelDoTeste) }
})
vi.mock('@/modules/dominio/db/cliente', () => ({ getDb: () => ({}) }))

type Busca = Record<string, string | string[] | undefined>

async function retorno(nivel: NivelDoPlano, busca: Busca = {}): Promise<string> {
  nivelDoTeste = nivel
  const { default: Pagina } = await import('@/app/(app)/retorno/mercadopago/page')
  return renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve(busca) }))
}

/** Tudo o que um link forjado poria na volta do checkout para "provar" que pagou. */
const QUERY_FORJADA: Busca = {
  status: 'approved',
  collection_status: 'approved',
  payment_id: '123456',
  preference_id: 'pref-1',
  preapproval_id: 'pre-1',
  estado: 'confirmado',
  nivel: 'ALL_STAR',
}

describe('retorno do Mercado Pago — a query do navegador nunca comprova pagamento', () => {
  it('grátis com a query de "aprovado" continua em "confirmação em andamento"', async () => {
    const html = await retorno('GRATIS', QUERY_FORJADA)
    expect(html).toContain('Confirmação em andamento')
    expect(html).not.toContain('Pagamento confirmado')
    expect(html).toContain('href="/conta"')
    // Nenhum valor da query volta para a tela.
    for (const valor of ['approved', '123456', 'pref-1', 'pre-1']) expect(html).not.toContain(valor)
  })

  it('só o direito gravado no servidor diz "confirmado"', async () => {
    const html = await retorno('MVP')
    expect(html).toContain('Pagamento confirmado')
    expect(html).toContain('Seu direito de acesso já foi confirmado pelo servidor.')
    expect(html).toContain('href="/"')
  })

  it('upgrade em processamento: quem já era pago NÃO vê "confirmado" antes da hora', async () => {
    const html = await retorno('MVP', { estado: 'processando' })
    expect(html).toContain('Confirmação em andamento')
    expect(html).not.toContain('Pagamento confirmado')
  })
})
