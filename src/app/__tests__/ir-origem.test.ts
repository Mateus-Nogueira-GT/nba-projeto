import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { eq } from 'drizzle-orm'

import { bancoDeTeste } from '../../modules/dominio/__tests__/ajuda-banco'
import {
  apitos,
  eventosAfiliados,
  jogadores,
  jogos,
  ofertasAfiliados,
  times,
  usuarios,
} from '../../modules/dominio/db/schema'
import {
  criarCampanhaComLink,
  criarCasaComercial,
  criarOferta,
  criarParceiro,
  type AtorAfiliados,
} from '../../modules/plataforma/afiliados/servico'

/**
 * A COLA entre a tela do apito e a rota de saída (Task 3, "a tela manda a
 * chave, a rota repassa"). `telas-04-detalhe.test.ts` já prova a METADE de
 * ida — o `href` que a tela renderiza carrega `?apito=<chave>` — mas nenhum
 * teste chamava o handler `GET` de `src/app/ir/[codigo]/route.ts` de
 * verdade: se o nome do parâmetro na tela e o nome lido pela rota
 * divergissem, aquela bateria continuaria toda verde. Este teste fecha o
 * circuito: um `Request` de verdade, na rota de verdade, contra o banco de
 * verdade — e confere que o evento gravado carrega o apito real.
 */

let banco: Awaited<ReturnType<typeof bancoDeTeste>>

vi.mock('../../modules/dominio/db/cliente', () => ({
  getDb: () => banco.db,
  fecharDb: async () => {},
}))
// A rota não tem sessão para resolver neste teste — só o caminho anônimo
// importa aqui, o mesmo que qualquer clique de assinante deslogado.
vi.mock('../../modules/plataforma/auth/cookies', () => ({
  sessaoAtual: async () => null,
}))
// `cookies()` do App Router exige o contexto de requisição do Next, que não
// existe ao chamar o handler direto no teste. Armário vazio força
// `novoTokenVisitante()` — o caminho do primeiro clique, sem cookie prévio.
vi.mock('next/headers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/headers')>()),
  cookies: async () => ({ get: () => undefined }),
}))

import { GET } from '../ir/[codigo]/route'

beforeAll(async () => {
  process.env.DATABASE_URL = 'postgres://demo'
  banco = await bancoDeTeste()
})

afterAll(async () => {
  await banco.fechar()
})

/**
 * Parceiro → oferta ATIVA → campanha → link, mesma cadeia do CTA em
 * `telas-04-detalhe.test.ts`. `hostDestino` único por teste para poder
 * afirmar que o redirect vai para ESTA oferta, não para outra do banco.
 */
async function cenario() {
  const sufixo = Math.random().toString(36).slice(2)
  const [admin] = await banco.db
    .insert(usuarios)
    .values({ email: `admin-ir-${sufixo}@teste.com`, senhaHash: 'x', papel: 'ADMIN' })
    .returning()
  const ator: AtorAfiliados = { usuarioId: admin!.id, papel: 'ADMIN' }
  const agora = new Date('2026-09-15T00:00:00.000Z')
  const casa = await criarCasaComercial(banco.db, ator, `Casa Ir ${sufixo}`, agora)
  const oferta = await criarOferta(
    banco.db,
    ator,
    {
      casaId: casa.id,
      nome: `Oferta Ir ${sufixo}`,
      modalidade: 'HIBRIDO',
      moeda: 'BRL',
      urlDestino: `https://casa-ir-${sufixo}.test/nba`,
      hostDestino: `casa-ir-${sufixo}.test`,
    },
    agora,
  )
  await banco.db
    .update(ofertasAfiliados)
    .set({ status: 'ATIVA' })
    .where(eq(ofertasAfiliados.id, oferta.id))
  const parceiro = await criarParceiro(
    banco.db,
    ator,
    { codigo: `parceiro-ir-${sufixo}`, nomePublico: 'Parceiro Ir' },
    agora,
  )
  const link = await criarCampanhaComLink(
    banco.db,
    ator,
    {
      parceiroId: parceiro.id,
      ofertaId: oferta.id,
      nome: `Campanha Ir ${sufixo}`,
      canal: 'SOCIAL',
      codigo: `ir-link-${sufixo}`,
      tipoDestino: 'CASA',
    },
    agora,
  )
  return { link, oferta }
}

/**
 * Mesmo formato de `montarChave` (`src/modules/motor/tipos.ts`), reproduzido
 * aqui em vez de importado: a regra `tela-nao-chama-o-motor` (dependency-cruiser)
 * proíbe `src/app/**` de importar o motor como VALOR — só como tipo. Este
 * teste não está pedindo ao motor para decidir nada; está fabricando, por
 * fora, a mesma chave que o motor grava no apito, para simular o que a tela
 * recebe pronto no feed materializado.
 */
function chaveDeTeste(
  jogoId: string,
  jogadorId: string,
  atributo: string,
  estrategia: string,
  linha: number | null,
): string {
  return [jogoId, jogadorId, atributo, estrategia, linha ?? ''].join('|')
}

/**
 * Cadeia mínima de FKs para um apito real — mesmo desenho de `servico.test.ts`.
 * `estrategia`/`linha` parametrizados como na Task 2: Fire Live não tem
 * linha (`linha: null`), e é exatamente esse segmento final vazio da chave
 * que precisa sobreviver a `encodeURIComponent`/`URLSearchParams.get` sem
 * truncar.
 */
async function apitoDeTeste(
  opcoes: { estrategia?: 'LISTA_SECRETA' | 'FIRE_LIVE'; linha?: number | null } = {},
) {
  const estrategia = opcoes.estrategia ?? 'LISTA_SECRETA'
  const linha = opcoes.linha === undefined ? 25 : opcoes.linha
  const sufixo = Math.random().toString(36).slice(2, 8)
  const [casa, fora] = await banco.db
    .insert(times)
    .values([
      { sigla: `C${sufixo.slice(0, 2)}`.toUpperCase(), nome: `Casa ${sufixo}` },
      { sigla: `F${sufixo.slice(0, 2)}`.toUpperCase(), nome: `Fora ${sufixo}` },
    ])
    .returning()
  const [jogador] = await banco.db
    .insert(jogadores)
    .values({ nomeCompleto: `Jogador ${sufixo}`, timeId: casa!.id })
    .returning()
  const [jogo] = await banco.db
    .insert(jogos)
    .values({
      dataHoraUtc: new Date('2026-09-15T23:00:00.000Z'),
      dataReferencia: '2026-09-15',
      timeCasaId: casa!.id,
      timeVisitanteId: fora!.id,
      status: 'AGENDADO',
    })
    .returning()
  const [apito] = await banco.db
    .insert(apitos)
    .values({
      rulesetVersao: 'v1',
      jogoId: jogo!.id,
      jogadorId: jogador!.id,
      atributo: 'PONTOS',
      estrategia,
      nivelJogador: 'MVP',
      nivelApito: 3,
      linha,
    })
    .returning()
  return {
    apito: apito!,
    chave: chaveDeTeste(jogo!.id, jogador!.id, 'PONTOS', estrategia, linha),
  }
}

describe('GET /ir/[codigo] — a rota repassa a chave que a tela mandou', () => {
  it('uma requisição de navegador com ?apito=<chave> grava o evento com o apito real e redireciona para a casa', async () => {
    const { link, oferta } = await cenario()
    const { apito, chave } = await apitoDeTeste()

    const resposta = await GET(
      new Request(`http://localhost/ir/${link.codigo}?apito=${encodeURIComponent(chave)}`, {
        method: 'GET',
        // Precisa parecer navegador: `requisicaoAutomatizada` (ROBO) desviaria
        // para o caminho `registrar: false`, que nem chama `registrarSaidaParaCasa`.
        headers: { 'user-agent': 'Mozilla/5.0 (Teste NIP; navegador)' },
      }),
      { params: Promise.resolve({ codigo: link.codigo }) },
    )

    // Quem clicou não pode receber erro: sempre um redirect, e para a CASA
    // certa — não para `/oferta-indisponivel`, que também é um 3xx e
    // esconderia uma falha no meio do caminho (mock errado, exceção engolida
    // pelo catch-all da rota).
    expect(resposta.status).toBeGreaterThanOrEqual(300)
    expect(resposta.status).toBeLessThan(400)
    const destino = resposta.headers.get('location')
    expect(destino).not.toBeNull()
    expect(new URL(destino!).host).toBe(oferta.hostDestino)

    const [evento] = await banco.db
      .select()
      .from(eventosAfiliados)
      .where(eq(eventosAfiliados.linkId, link.id))
    expect(evento, 'a rota não gravou evento nenhum para este link').toBeDefined()
    expect(evento!.tipo).toBe('SAIDA_CASA')
    expect(evento!.apitoId).toBe(apito.id)
  })

  it('a chave de Fire Live (sem linha, termina em "|") sobrevive à volta completa pela URL', async () => {
    // Fire Live não tem linha (spec §10): `chaveDeTeste` produz o último
    // segmento vazio, e é aí que uma truncagem se esconderia — um `|` final
    // perdido no meio do caminho (encode na tela, parse na rota) resolve
    // para apito nenhum, e a origem some em silêncio, sem erro. A revisão
    // conferiu isso à mão; este teste é a trava que sobrevive no CI.
    const { link, oferta } = await cenario()
    const { apito, chave } = await apitoDeTeste({ estrategia: 'FIRE_LIVE', linha: null })
    expect(chave.endsWith('|')).toBe(true)

    const resposta = await GET(
      new Request(`http://localhost/ir/${link.codigo}?apito=${encodeURIComponent(chave)}`, {
        method: 'GET',
        headers: { 'user-agent': 'Mozilla/5.0 (Teste NIP; navegador)' },
      }),
      { params: Promise.resolve({ codigo: link.codigo }) },
    )

    expect(resposta.status).toBeGreaterThanOrEqual(300)
    expect(resposta.status).toBeLessThan(400)
    const destino = resposta.headers.get('location')
    expect(destino).not.toBeNull()
    expect(new URL(destino!).host).toBe(oferta.hostDestino)

    const [evento] = await banco.db
      .select()
      .from(eventosAfiliados)
      .where(eq(eventosAfiliados.linkId, link.id))
    expect(evento, 'a rota não gravou evento nenhum para este link').toBeDefined()
    expect(evento!.apitoId).toBe(apito.id)
  })
})
