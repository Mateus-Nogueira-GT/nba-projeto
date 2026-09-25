import { getDb } from '@/modules/dominio/db/cliente'
import { dataDeReferencia } from '@/modules/dominio/rodada'
import { buscar, type ResultadoBusca } from '@/modules/entrega/estatisticas/busca'
import { dataValidaOuHoje } from '@/modules/entrega/estatisticas/calendario'
import { telaJogosDoDia, type TelaJogosDoDia } from '@/modules/entrega/estatisticas/jogos-do-dia'
import { telaDaClassificacao, type TelaClassificacao } from '@/modules/entrega/estatisticas/time'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import { exigirNivel } from '@/modules/plataforma/assinatura/guarda'
import { temporadaDasEstatisticas, type TemporadaDasEstatisticas } from './temporada'

export type DadosDoIndice = {
  termo: string
  resultados: ResultadoBusca[]
  data: string
  hoje: string
  fuso: string
  temporada: string
  agora: Date
  doDia: TelaJogosDoDia
  classificacao: TelaClassificacao
  /** O seletor e a escolha que viaja nos links. */
  seletor: TemporadaDasEstatisticas
}

type Params = Record<string, string | string[] | undefined>
const primeiro = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

/**
 * O índice da aba. A classificação é 100% grátis: a guarda pede login e nada
 * mais — e vem ANTES de qualquer consulta.
 */
export async function carregarIndice(params: Params): Promise<DadosDoIndice> {
  const termo = (primeiro(params.q) ?? '').trim()
  await exigirNivel('GRATIS', '/estatisticas')

  const db = getDb()
  const agora = new Date()
  const ruleset = await rulesetAtivo()
  const { fuso } = ruleset.rodada
  const hoje = dataDeReferencia(agora, fuso)
  const data = dataValidaOuHoje(primeiro(params.data), hoje)
  // A temporada que TEM dado, não a do calendário: entre o lançamento e a
  // primeira bola as duas divergem por ~um mês (spec 22/09, §5.2). Pelo cache:
  // o agregado muda poucas vezes por dia (auditoria 23/09). `?temporada=`
  // troca a classificação dentro das disponíveis.
  const seletor = await temporadaDasEstatisticas(params, ruleset, agora)
  const { temporada } = seletor

  const [doDia, classificacao, resultados] = await Promise.all([
    telaJogosDoDia(db, data, fuso),
    telaDaClassificacao(db, temporada),
    termo.length > 0 ? buscar(db, termo) : Promise.resolve([]),
  ])

  return { termo, resultados, data, hoje, fuso, temporada, agora, doDia, classificacao, seletor }
}
