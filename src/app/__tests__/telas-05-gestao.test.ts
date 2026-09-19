import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { gravarConferencia } from './conferencia'
import { bancoDeTeste } from '../../modules/dominio/__tests__/ajuda-banco'
import { dataDeReferencia } from '../../modules/dominio/rodada'
import { lerFeed } from '../../modules/entrega/lista-secreta'
import { registrarEntradaRealizada } from '../../modules/entrega/gestao-realizadas'
import { rulesetAtivo } from '../../modules/entrega/ruleset-ativo'
import { simularAte } from '../../modules/ingestao/demo/temporada'
import { LLMFake } from '../../modules/ingestao/llm'

/**
 * GESTÃO — SUGERIDAS × REALIZADAS (spec 12/09, §5.5, Task 10).
 *
 * O print de produção mostrava só "Entradas sugeridas para hoje" — o que a
 * NIP sugeriu. A call de 08/09 pediu separar isso do que o usuário REALMENTE
 * fez: uma visão nova, trocada por URL, e a fronteira de somente leitura
 * escrita na tela (o usuário digita o que já fez em outro lugar).
 *
 * Mesmo arnês de `telas-demo.test.ts` — o componente de servidor de verdade
 * sobre um PGlite semeado pela temporada simulada; só sessão e direito de
 * acesso são simulados. NENHUMA asserção nomeia jogador, time ou horário: o
 * sujeito é lido do banco (ou do feed) e a afirmação é sobre ele.
 */

const FUSO = 'America/Sao_Paulo'
const AGORA = new Date('2026-01-15T18:00:00.000Z')
const HOJE = dataDeReferencia(AGORA, FUSO)

let banco: Awaited<ReturnType<typeof bancoDeTeste>>

const USUARIO_DEMO = '00000000-0000-4000-8000-000000000001'
vi.mock('../../modules/plataforma/auth/cookies', () => ({
  sessaoAtual: async () => ({ usuarioId: USUARIO_DEMO, email: 'demo@teste.com' }),
}))
vi.mock('../../modules/plataforma/assinatura/direito', async () => {
  const { acessoDeTeste } = await import('../../modules/plataforma/__tests__/acesso-de-teste')
  return { avaliarAcesso: async () => acessoDeTeste('ALL_STAR') }
})
vi.mock('next/cache', () => ({
  // `unstable_cache` fora do runtime do Next não tem store: no teste ele é a
  // própria função. `revalidateTag`/`revalidatePath` viram no-op.
  unstable_cache: (fn: (...args: never[]) => unknown) => fn,
  revalidateTag: () => {},
  revalidatePath: () => {},
}))
vi.mock('../../modules/dominio/db/cliente', () => ({
  getDb: () => banco.db,
  fecharDb: async () => {},
}))

beforeAll(async () => {
  process.env.DATABASE_URL = 'postgres://demo'
  banco = await bancoDeTeste()
  await simularAte(banco.db, await rulesetAtivo(), AGORA, {
    diasDeHistorico: 21,
    llm: new LLMFake(),
  })
  const { usuarios } = await import('../../modules/dominio/db/schema')
  await banco.db
    .insert(usuarios)
    .values({ id: USUARIO_DEMO, email: 'demo@teste.com', senhaHash: 'x' })
    .onConflictDoNothing()

  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AGORA)
}, 180_000)

afterAll(async () => {
  vi.useRealTimers()
  await banco.fechar()
})

function semEntidades(texto: string): string {
  return texto
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

/** O texto que o assinante lê, sem marcação e sem entidade — nunca o CSS. */
const textoDaTela = (html: string) => semEntidades(html.replace(/<[^>]+>/g, ''))

describe('duas visões, sugeridas e realizadas', () => {
  it('duas visões, SUGERIDAS e REALIZADAS, por URL; a sugerida tem o botão "registrei" com unidades e odd', async () => {
    const { default: Pagina } = await import('../(app)/gestao/page')
    const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
    await gravarConferencia('gestao', html)
    expect(html).toContain('href="/gestao?ver=realizadas"')
    // Escopado ao próprio link do seletor de visão: `aria-current="page"`
    // solto no HTML também aparece no atalho de banca de R$ 1.000 (o padrão
    // da tela), e essa asserção passaria mesmo com o seletor quebrado.
    expect(html).toMatch(/<a[^>]*aria-current="page"[^>]*>Sugeridas<\/a>/)
    expect(html).not.toMatch(/<a[^>]*aria-current="page"[^>]*>Realizadas<\/a>/)
    expect(html).toContain('name="unidades"')
    expect(html).toContain('name="odd"')
    expect(html).toContain('>Registrei<')
  })

  // Antes de qualquer registro: prova o vazio. Roda ANTES do teste seguinte
  // de propósito — os dois dividem o mesmo banco, e o próximo grava uma
  // entrada para HOJE que tornaria este vazio impossível de observar depois.
  it('sem nada registrado, a visão REALIZADAS explica onde registrar em vez de uma lista vazia muda', async () => {
    const { default: Pagina } = await import('../(app)/gestao/page')
    const html = renderToStaticMarkup(
      await Pagina({ searchParams: Promise.resolve({ ver: 'realizadas' }) }),
    )
    expect(html.toLowerCase()).toContain('nada registrado hoje')
  })

  it('a visão REALIZADAS lista o que foi registrado e repete a fronteira de somente leitura', async () => {
    const feed = await lerFeed(banco.db, HOJE)
    const item = feed!.conteudo.itens.find((i) => i.linha !== null)!
    await registrarEntradaRealizada(banco.db, {
      usuarioId: USUARIO_DEMO,
      dataReferencia: HOJE,
      jogadorId: item.jogadorId,
      atributo: item.atributo,
      linha: item.linha!,
      unidades: 1,
      odd: null,
      agora: AGORA,
    })
    const { default: Pagina } = await import('../(app)/gestao/page')
    const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({ ver: 'realizadas' }) }))
    // Nome cru do jogador, não a marcação: `renderToStaticMarkup` escapa texto
    // (apóstrofo vira `&#x27;`), e a NBA tem vários nomes com apóstrofo
    // ("Kel'el Ware", "De'Aaron Fox"...). Comparar contra o HTML bruto falha
    // sempre que o sorteio da temporada demo escolhe um desses — não é flake,
    // é bug determinístico no teste.
    expect(textoDaTela(html)).toContain(item.nome)
    expect(html).toMatch(/1 unidade/)
    expect(html.toLowerCase()).toContain('somente leitura')
  })

  // ACHADO 4 DA REVISÃO FINAL: a ação (`acoes.ts`) redirecionava com a frase
  // por extenso em `?erro=`, sem dicionário — mesma correção de `conta/`.
  it('?erro= passa por dicionário: código conhecido vira texto em português, texto forjado não aparece', async () => {
    const { default: Pagina } = await import('../(app)/gestao/page')
    const comCodigoConhecido = renderToStaticMarkup(
      await Pagina({ searchParams: Promise.resolve({ erro: 'entrada-invalida' }) }),
    )
    expect(comCodigoConhecido).toContain('Confira unidades e odd.')

    const fraseDoAtacante = 'sua conta foi comprometida, ligue agora para 0800-000-000'
    const comTextoForjado = renderToStaticMarkup(
      await Pagina({ searchParams: Promise.resolve({ erro: fraseDoAtacante }) }),
    )
    expect(comTextoForjado).not.toContain(fraseDoAtacante)
  })

  it('a maior parte do que se clica responde ao mouse (auditoria de UX para web)', async () => {
    // A auditoria de 19/09 mediu 520 de 794 elementos interativos sem classe —
    // logo sem :hover e sem o anel de foco do app. `<summary>` de <details>
    // nativo é a exceção aceita: ele É o controle do disclosure e o browser o
    // marca sozinho.
    const { default: Pagina } = await import('../(app)/gestao/page')
    const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
    const corpo = html
      .replace(/<nav aria-label="Seções do app[\s\S]*?<\/nav>/g, '')
      // A linha responde pelo invólucro `.linha-alvo`; o link que a cobre não
      // precisa de estado próprio, como a cobertura do card na Lista.
      .replace(/(<div class="linha-alvo"[^>]*>)\s*<a\b[^>]*>/g, '$1')
    const tags = corpo.match(/<(?:a|button|summary)\b[^>]*>/g) ?? []
    // A COBERTURA do card (`position:absolute;inset:0`) fica de fora: ela não
    // tem classe porque quem responde é o invólucro `.card-alvo` em volta dela
    // — dar estado à cobertura desenharia o realce por cima do card, não nele.
    const sem = tags.filter(
      (t) =>
        !t.includes('class=') &&
        !t.startsWith('<summary') &&
        !t.includes('position:absolute;inset:0'),
    )
    expect(
      sem.length / tags.length,
      `${sem.length} de ${tags.length} sem estado:\n${sem.slice(0, 8).join('\n')}`,
    ).toBeLessThan(0.12)
  }, 60_000)

  it('"Registrei" é secundário — trinta e sete primários não são primário nenhum', async () => {
    const { default: Pagina } = await import('../(app)/gestao/page')
    const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
    const registrei = [...html.matchAll(/<button[^>]*>Registrei<\/button>/g)].map((m) => m[0])
    expect(registrei.length).toBeGreaterThan(1)
    for (const b of registrei) {
      expect(b).toContain('botao-secundario')
      expect(b).not.toContain('botao-primario')
    }
    // e o primário da tela continua existindo: Aplicar, que se faz uma vez
    expect(html).toMatch(/<button[^>]*botao-primario[^>]*>Aplicar<\/button>/)
  }, 60_000)

  it('as sugeridas agrupam por time, e nenhuma linha se perde no caminho', async () => {
    const { default: Pagina } = await import('../(app)/gestao/page')
    const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
    const linhas = (html.match(/>Registrei</g) ?? []).length
    const grupos = (html.match(/<section style="display:grid;gap:8px"/g) ?? []).length
    expect(grupos).toBeGreaterThan(1)
    expect(linhas).toBeGreaterThanOrEqual(grupos)
  }, 60_000)

  it('a linha escreve o nível do jogador — a faixa colorida não pode ser o único sinal', async () => {
    const { default: Pagina } = await import('../(app)/gestao/page')
    const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
    const texto = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
    expect(texto).toMatch(/(MVP|All Star|Suporte|Randola) · [A-Z]{3} · /)
  }, 60_000)
})
