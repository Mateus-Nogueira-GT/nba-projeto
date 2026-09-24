import { notFound } from 'next/navigation'
import { z } from 'zod'
import { getDb } from '@/modules/dominio/db/cliente'
import { telaDoJogo, type TelaDoJogo } from '@/modules/entrega/estatisticas/jogo'
import {
  BASE_ESTATISTICAS,
  contextoEstatisticas,
  rotaDoJogador,
  rotaDoJogo,
} from '@/modules/entrega/estatisticas/rotas'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import { exigirCookieDeSessao, exigirNivel } from '@/modules/plataforma/assinatura/guarda'
import { atende } from '@/modules/plataforma/assinatura/nivel-do-plano'

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
  /** Box score e confrontos anteriores são MVP; o resto da tela é grátis. */
  profundidade: boolean
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

  // O "voltar" pousa de onde a pessoa veio: o jogador (com o mesmo recorte)
  // ou o MESMO dia navegado na lista de jogos. Sem validar a data aqui —
  // /estatisticas já cai para hoje diante de qualquer lixo.
  const contexto = contextoEstatisticas(params)
  const jogador = primeiro(params.jogador)
  const data = primeiro(params.data)
  const voltar =
    jogador && z.uuid().safeParse(jogador).success
      ? { href: rotaDoJogador(jogador, contexto), rotulo: 'Jogador' }
      : data
        ? { href: `${BASE_ESTATISTICAS}?data=${encodeURIComponent(data)}`, rotulo: 'Jogos do dia' }
        : { href: BASE_ESTATISTICAS, rotulo: 'Estatísticas' }

  const agora = new Date()
  const ruleset = await rulesetAtivo()
  const tela = await telaDoJogo(getDb(), id, {})
  if (tela === null) notFound()

  // Login depois do "não encontrado": um id que não existe responde 404 sem tocar sessão.
  const { acesso } = await exigirNivel('GRATIS', rotaDoJogo(id))

  const consulta = new URLSearchParams()
  for (const [chave, valor] of Object.entries(params)) {
    const v = primeiro(valor)
    if (v !== undefined && chave !== 'aba') consulta.set(chave, v)
  }

  return {
    id,
    tela,
    fuso: ruleset.rodada.fuso,
    agora,
    aba: ABAS_DO_JOGO.find((a) => a === primeiro(params.aba)) ?? 'geral',
    voltar,
    consultaBase: consulta.toString(),
    profundidade: atende(acesso.nivel, 'MVP'),
  }
}
