import { notFound } from 'next/navigation'
import { z } from 'zod'
import { getDb } from '@/modules/dominio/db/cliente'
import { calendarioDoRuleset, temporadaDe } from '@/modules/dominio/temporada'
import { telaDoJogo, type TelaDoJogo } from '@/modules/entrega/estatisticas/jogo'
import {
  BASE_ESTATISTICAS,
  comTemporada,
  contextoEstatisticas,
  rotaDoJogador,
  rotaDoJogo,
} from '@/modules/entrega/estatisticas/rotas'
import { ehTemporadaAnterior } from '@/modules/entrega/retroativo/temporada'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import { exigirCookieDeSessao, exigirNivel } from '@/modules/plataforma/assinatura/guarda'
import { atende } from '@/modules/plataforma/assinatura/nivel-do-plano'
import { temporadaDasEstatisticas } from './temporada'

export const ABAS_DO_JOGO = ['geral', 'box', 'confrontos'] as const
export type AbaDoJogo = (typeof ABAS_DO_JOGO)[number]

export type DadosDoJogo = {
  id: string
  tela: TelaDoJogo
  fuso: string
  agora: Date
  aba: AbaDoJogo
  voltar: { href: string; rotulo: string }
  /** A consulta original sem `aba` — as abas a preservam (data, jogador, período). */
  consultaBase: string
  /**
   * Box score e confrontos anteriores são MVP; o resto da tela é grátis. Jogo
   * de temporada ANTERIOR à do calendário: aberto para todo plano (spec 25/09,
   * decisão 6).
   */
  profundidade: boolean
  /**
   * A temporada ESCOLHIDA e válida — viaja nos links de saída (times, líderes,
   * box score), como no jogador e no time. Sem escolha, nenhum link muda.
   */
  escolhida: string | undefined
}

type Params = Record<string, string | string[] | undefined>
const primeiro = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

/**
 * A partida. UUID inválido → 404; sem cookie de sessão → /entrar, ANTES de
 * qualquer consulta (I3, auditoria 23/09); o "não encontrado" do banco vem
 * antes de `exigirNivel`.
 */
export async function carregarJogo(id: string, params: Params): Promise<DadosDoJogo> {
  if (!z.uuid().safeParse(id).success) notFound()
  await exigirCookieDeSessao(rotaDoJogo(id))

  const agora = new Date()
  const ruleset = await rulesetAtivo()
  // Só a escolha VÁLIDA do seletor viaja: a crua da URL nunca é ecoada num link.
  const seletor = await temporadaDasEstatisticas(params, ruleset, agora)
  const { escolhida } = seletor

  // O "voltar" pousa de onde a pessoa veio: o jogador (com o mesmo recorte)
  // ou o MESMO dia navegado na lista de jogos. Sem validar a data aqui —
  // /estatisticas já cai para hoje diante de qualquer lixo.
  const { temporada: _crua, ...contexto } = contextoEstatisticas(params)
  const jogador = primeiro(params.jogador)
  const data = primeiro(params.data)
  const voltar =
    jogador && z.uuid().safeParse(jogador).success
      ? { href: rotaDoJogador(jogador, escolhida ? { ...contexto, temporada: escolhida } : contexto), rotulo: 'Jogador' }
      : data
        ? { href: comTemporada(`${BASE_ESTATISTICAS}?data=${encodeURIComponent(data)}`, escolhida), rotulo: 'Jogos do dia' }
        : { href: comTemporada(BASE_ESTATISTICAS, escolhida), rotulo: 'Estatísticas' }

  const tela = await telaDoJogo(getDb(), id, {})
  if (tela === null) notFound()

  // Login depois do "não encontrado": um id que não existe responde 404 sem tocar sessão.
  const { acesso } = await exigirNivel('GRATIS', rotaDoJogo(id))

  // A temporada do JOGO sai da data dele, não da URL: um `?temporada=` forjado
  // não abre o box score de uma partida da temporada paga. Partida de
  // temporada ANTERIOR à do calendário é aberta para todo plano (decisão 6);
  // uma futura (rótulo adiantado) não.
  const { doCalendario } = seletor
  const daTemporadaAnterior = ehTemporadaAnterior(
    temporadaDe(tela.dataHoraUtc, calendarioDoRuleset(ruleset)),
    doCalendario,
  )

  const consulta = new URLSearchParams()
  for (const [chave, valor] of Object.entries(params)) {
    const v = primeiro(valor)
    // A temporada só volta à URL se for a escolha válida (abaixo).
    if (v !== undefined && chave !== 'aba' && chave !== 'temporada') consulta.set(chave, v)
  }
  if (escolhida) consulta.set('temporada', escolhida)

  return {
    id,
    tela,
    fuso: ruleset.rodada.fuso,
    agora,
    aba: ABAS_DO_JOGO.find((a) => a === primeiro(params.aba)) ?? 'geral',
    voltar,
    consultaBase: consulta.toString(),
    profundidade: daTemporadaAnterior || atende(acesso.nivel, 'MVP'),
    escolhida,
  }
}
