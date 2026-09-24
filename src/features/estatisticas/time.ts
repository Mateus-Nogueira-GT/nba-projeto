import { notFound } from 'next/navigation'
import { z } from 'zod'
import { getDb } from '@/modules/dominio/db/cliente'
import { dataDeReferencia } from '@/modules/dominio/rodada'
import { telaJogosDoDia, type JogoDoDia } from '@/modules/entrega/estatisticas/jogos-do-dia'
import { rotaDoTime } from '@/modules/entrega/estatisticas/rotas'
import { hierarquiaDoTime, telaDoTime, type LinhaHierarquia, type TelaTime } from '@/modules/entrega/estatisticas/time'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import { exigirCookieDeSessao, exigirNivel } from '@/modules/plataforma/assinatura/guarda'
import { atende } from '@/modules/plataforma/assinatura/nivel-do-plano'
import { estadoExperienciaDoUsuario } from '@/modules/plataforma/experiencia/servico'
import { temporadaParaExibirCacheada } from '@/app/_cache/temporada'

/**
 * Os atributos da hierarquia. O tipo nasce aqui e não do motor: a aba de
 * estatísticas não importa o motor, nem tipo.
 */
export const ATRIBUTOS_DA_HIERARQUIA = [
  { valor: 'PONTOS', curto: 'PTS', porExtenso: 'Pontos' },
  { valor: 'REBOTES', curto: 'REB', porExtenso: 'Rebotes' },
  { valor: 'ASSISTENCIAS', curto: 'AST', porExtenso: 'Assistências' },
] as const
export type AtributoDaHierarquia = (typeof ATRIBUTOS_DA_HIERARQUIA)[number]['valor']

export type DadosDoTime = {
  id: string
  tela: TelaTime
  temporada: string
  fuso: string
  agora: Date
  atributo: AtributoDaHierarquia
  hierarquia: LinhaHierarquia[]
  jogoDeHoje: JogoDoDia | null
  acompanhado: boolean
  /** Só o box score por jogo é MVP; campanha, Hierarquia NIP e elenco são abertos. */
  profundidade: boolean
}

type Params = Record<string, string | string[] | undefined>

/**
 * O time. UUID inválido → 404; sem cookie de sessão → /entrar, ANTES de
 * qualquer consulta (I3, auditoria 23/09); o "não encontrado" do banco vem
 * antes de `exigirNivel`. O elenco é o do PROVEDOR (`jogadores.time_id`) —
 * esta aba é dado canônico; a curadoria do CJ só entra rotulada, na hierarquia.
 */
export async function carregarTime(id: string, params: Params): Promise<DadosDoTime> {
  if (!z.uuid().safeParse(id).success) notFound()
  await exigirCookieDeSessao(rotaDoTime(id))
  const bruto = Array.isArray(params.atributo) ? params.atributo[0] : params.atributo
  // `?atributo=` é entrada de usuário: valor desconhecido cai em PONTOS.
  const atributo = ATRIBUTOS_DA_HIERARQUIA.find((a) => a.valor === bruto)?.valor ?? 'PONTOS'

  const agora = new Date()
  const ruleset = await rulesetAtivo()
  const { fuso } = ruleset.rodada
  // A temporada que TEM dado (no hiato, a passada), pelo cache.
  const temporada = await temporadaParaExibirCacheada(ruleset, agora)
  const db = getDb()
  const tela = await telaDoTime(db, id, { temporada })
  if (tela === null) notFound()

  const { sessao, acesso } = await exigirNivel('GRATIS', rotaDoTime(id))
  const [experiencia, doDia] = await Promise.all([
    estadoExperienciaDoUsuario(db, sessao.usuarioId),
    telaJogosDoDia(db, dataDeReferencia(agora, fuso), fuso),
  ])
  // O desfalque é por JOGO: sem jogo hoje, ninguém é marcado — e a tela diz isso.
  const jogoDeHoje = doDia.jogos.find((j) => j.casa.id === id || j.visitante.id === id) ?? null
  const hierarquia = await hierarquiaDoTime(db, id, atributo, jogoDeHoje?.id ?? null)

  return {
    id,
    tela,
    temporada,
    fuso,
    agora,
    atributo,
    hierarquia,
    jogoDeHoje,
    acompanhado: experiencia.timesAcompanhados.includes(id),
    profundidade: atende(acesso.nivel, 'MVP'),
  }
}
