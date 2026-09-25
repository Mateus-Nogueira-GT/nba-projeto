import { notFound } from 'next/navigation'
import { z } from 'zod'
import { getDb } from '@/modules/dominio/db/cliente'
import { calendarioDoRuleset } from '@/modules/dominio/temporada'
import {
  apitosDoJogador,
  telaDoJogador,
  type ApitoDoJogador,
  type TelaJogador,
} from '@/modules/entrega/estatisticas/jogador'
import { contextoEstatisticas, type ContextoEstatisticas } from '@/modules/entrega/estatisticas/rotas'
import { intervaloDaTemporada } from '@/modules/entrega/estatisticas/temporadas'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import { exigirCookieDeSessao, exigirNivel } from '@/modules/plataforma/assinatura/guarda'
import { atende } from '@/modules/plataforma/assinatura/nivel-do-plano'
import { estadoExperienciaDoUsuario } from '@/modules/plataforma/experiencia/servico'
import { LIMITE_DE_APITOS_DO_JOGADOR } from './regras'
import { temporadaDasEstatisticas, type TemporadaDasEstatisticas } from './temporada'

export type DadosDoJogador = {
  id: string
  tela: TelaJogador
  contexto: ContextoEstatisticas
  temporada: string
  fuso: string
  agora: Date
  apitos: ApitoDoJogador[]
  truncado: boolean
  acompanhado: boolean
  /**
   * Apitos, jogo a jogo e números completos são MVP; o resumo é grátis. Na
   * temporada ANTERIOR, abertos para todo plano (spec 25/09, decisão 6).
   */
  profundidade: boolean
  /** O seletor, a escolha que viaja nos links, e se a temporada é anterior. */
  seletor: TemporadaDasEstatisticas
}

type Params = Record<string, string | string[] | undefined>

/**
 * O perfil do jogador. Três portões, nesta ordem:
 *
 * 1. id que não é UUID → 404, sem cookie nem banco;
 * 2. sem cookie de sessão → /entrar, sem banco (I3, auditoria 23/09) —
 *    consequência aceita: sem cookie, um id válido que não existe manda para
 *    /entrar em vez de 404;
 * 3. o "não encontrado" do banco vem ANTES de `exigirNivel`: um id que não
 *    existe responde 404 sem avaliar o acesso.
 */
export async function carregarJogador(id: string, params: Params): Promise<DadosDoJogador> {
  const { temporada: _crua, ...semTemporada } = contextoEstatisticas(params)
  if (!z.uuid().safeParse(id).success) notFound()
  await exigirCookieDeSessao(`/estatisticas/jogador/${id}`)

  const agora = new Date()
  const ruleset = await rulesetAtivo()
  const db = getDb()
  // O calendário vai junto porque a tabela jogo a jogo NOMEIA a temporada:
  // `jogos` guarda a data, não o rótulo. A temporada é a que TEM dado (no
  // hiato, a passada), pelo cache — nunca a do calendário.
  const calendario = calendarioDoRuleset(ruleset)
  // A temporada que TEM dado é o padrão; `?temporada=` troca dentro das disponíveis.
  const seletor = await temporadaDasEstatisticas(params, ruleset, agora)
  const { temporada } = seletor
  // Só a escolha VÁLIDA viaja nos links: a visita padrão não muda URL nenhuma.
  const contexto = seletor.escolhida ? { ...semTemporada, temporada: seletor.escolhida } : semTemporada
  const tela = await telaDoJogador(db, id, { temporada, calendario, periodo: contexto.periodo })
  if (tela === null) notFound()

  const { sessao, acesso } = await exigirNivel('GRATIS', `/estatisticas/jogador/${id}`)
  // A temporada anterior é aberta para todo plano (decisão 6); a do
  // calendário segue a régua de hoje.
  const profundidade = seletor.anterior || atende(acesso.nivel, 'MVP')
  const [experiencia, lista] = await Promise.all([
    estadoExperienciaDoUsuario(db, sessao.usuarioId),
    // Os apitos são profundidade (MVP): o grátis nem os lê — a tela mostra
    // silhueta, e dado pago não carregado não tem como vazar para o HTML.
    // UM a mais que o limite: é assim que a tela sabe que cortou. Numa
    // temporada anterior com retroativo, os retroativos dela — nunca os
    // publicados de hoje; sem retroativo (publicada ao vivo), os publicados
    // DELA. O intervalo é portão: a temporada passada abre para o grátis, e
    // sem o recorte a leitura de `apitos` traria o histórico pago de hoje.
    profundidade
      ? apitosDoJogador(
          db,
          id,
          LIMITE_DE_APITOS_DO_JOGADOR + 1,
          seletor.retroativa
            ? { temporadaAnterior: temporada }
            : { periodo: intervaloDaTemporada(temporada, calendario) },
        )
      : Promise.resolve([]),
  ])

  return {
    id,
    tela,
    contexto,
    temporada,
    fuso: ruleset.rodada.fuso,
    agora,
    apitos: lista.slice(0, LIMITE_DE_APITOS_DO_JOGADOR),
    truncado: lista.length > LIMITE_DE_APITOS_DO_JOGADOR,
    acompanhado: experiencia.jogadoresAcompanhados.includes(id),
    profundidade,
    seletor,
  }
}
