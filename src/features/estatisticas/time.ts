import { notFound } from 'next/navigation'
import { z } from 'zod'
import { getDb } from '@/modules/dominio/db/cliente'
import { dataDeReferencia } from '@/modules/dominio/rodada'
import { calendarioDoRuleset } from '@/modules/dominio/temporada'
import { intervaloDaTemporada } from '@/modules/entrega/estatisticas/temporadas'
import { telaJogosDoDia, type JogoDoDia } from '@/modules/entrega/estatisticas/jogos-do-dia'
import { rotaDoTime } from '@/modules/entrega/estatisticas/rotas'
import { hierarquiaDoTime, telaDoTime, type LinhaHierarquia, type TelaTime } from '@/modules/entrega/estatisticas/time'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import { exigirCookieDeSessao, exigirNivel } from '@/modules/plataforma/assinatura/guarda'
import { atende } from '@/modules/plataforma/assinatura/nivel-do-plano'
import { estadoExperienciaDoUsuario } from '@/modules/plataforma/experiencia/servico'
import { diaDaTemporada, temporadaDasEstatisticas, type TemporadaDasEstatisticas } from './temporada'

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
  /**
   * Só o box score por jogo é MVP; campanha, Hierarquia NIP e elenco são
   * abertos. Na temporada ANTERIOR, tudo aberto (spec 25/09, decisão 6).
   */
  profundidade: boolean
  /** O seletor, a escolha que viaja nos links, e se a temporada é anterior. */
  seletor: TemporadaDasEstatisticas
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
  // A temporada que TEM dado (no hiato, a passada) é o padrão, pelo cache;
  // `?temporada=` troca dentro das disponíveis.
  const seletor = await temporadaDasEstatisticas(params, ruleset, agora)
  const { temporada } = seletor
  const calendario = calendarioDoRuleset(ruleset)
  // Numa temporada que acabou, as partidas e a hierarquia são as DELA: sem o
  // recorte, "as mais recentes" seriam as de hoje debaixo do rótulo da passada.
  const periodo = seletor.anterior ? intervaloDaTemporada(temporada, calendario) : undefined
  const db = getDb()
  const tela = await telaDoTime(db, id, periodo ? { temporada, periodo } : { temporada })
  if (tela === null) notFound()

  const { sessao, acesso } = await exigirNivel('GRATIS', rotaDoTime(id))
  const [experiencia, doDia] = await Promise.all([
    estadoExperienciaDoUsuario(db, sessao.usuarioId),
    // Temporada anterior não tem "jogo de hoje": nem a consulta é feita.
    periodo ? Promise.resolve(null) : telaJogosDoDia(db, dataDeReferencia(agora, fuso), fuso),
  ])
  // O desfalque é por JOGO: sem jogo hoje, ninguém é marcado — e a tela diz isso.
  const jogoDeHoje = doDia?.jogos.find((j) => j.casa.id === id || j.visitante.id === id) ?? null
  const hierarquia = await hierarquiaDoTime(
    db,
    id,
    atributo,
    jogoDeHoje?.id ?? null,
    // Remontada pelo box só onde o motor retroativo rodou; uma temporada
    // passada publicada ao vivo mostra a lista do CJ, como na época.
    periodo && seletor.retroativa
      ? {
          // O time de cada um no ÚLTIMO dia da temporada — ou no `?data=`
          // dela, quando a URL aponta um dia (o mesmo recorte da Lista).
          temporadaAnterior: {
            temporada,
            data: diaDaTemporada(params.data, temporada, calendario) ?? periodo.ate,
            calendario,
          },
        }
      : {},
  )

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
    profundidade: seletor.anterior || atende(acesso.nivel, 'MVP'),
    seletor,
  }
}
