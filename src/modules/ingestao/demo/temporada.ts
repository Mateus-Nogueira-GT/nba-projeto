import { and, eq, gte, inArray, lte } from 'drizzle-orm'

import {
  apitos,
  estatisticasJogo,
  feedSnapshot,
  jogos,
  lesoesEscalacao,
  niveis,
  niveisVersao,
} from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import { montarFatosDoJogo } from '../../dominio/fatos-ao-vivo'
import { dataDeReferencia, intervaloDoDia, somarDias } from '../../dominio/rodada'
import { calendarioDoRuleset, temporadaDe } from '../../dominio/temporada'
import { executarCiclo } from '../../entrega/fire-live/ciclo'
import { FilaEmMemoria } from '../../entrega/fila/memoria'
import { publicarListaSecreta } from '../../entrega/lista-secreta'
import { avaliarFireLive } from '../../motor/fire-live/avaliar'
import type { Ruleset } from '../../motor/ruleset/schema'
import { NIVEIS } from '../../motor/tipos'
import type { Atributo } from '../../motor/tipos'
import type { PortaLLM } from '../llm'
import { recalcularMedias } from '../sincronizar/medias'
import { excluded } from '../sincronizar/upsert'
import { semearJogoAoVivo } from './ao-vivo'
import type { JogadorAoVivo } from './ao-vivo'
import { chaveDeNome, semearCadastro } from './cadastro'
import type { Cadastro } from './cadastro'
import { boxComplementar, decomporPontos } from './dados'
import {
  semearBoxScoreDoTime,
  semearClassificacao,
  semearPlacares,
  upsertJogoDemo,
} from './jogos'
import { semearOdds } from './odds'
import {
  boxScoreDoTime,
  criarSorteio,
  desempatar,
  desfalquesDoDia,
  elencosDaLista,
  gerarCalendario,
  SEMENTE_TEMPORADA,
} from './simulacao'
import type { Calendario, JogadorSim, JogoSim, LinhaBox } from './simulacao'

/**
 * A TEMPORADA SIMULADA — sete semanas de história que o motor produziu.
 *
 * A demonstração não escreve apito nenhum: para cada dia da janela ela agenda
 * a rodada, publica a Lista Secreta daquele dia pelo caminho REAL com o que se
 * sabia na véspera, e só DEPOIS joga os jogos. É essa ordem que faz a taxa de
 * acerto da tela de Resultados ser consequência das regras do CJ, e não uma
 * escolha de quem escreveu o seed.
 *
 * O gerador dos números é puro e mora em `./simulacao`; aqui só há orquestração
 * contra o banco.
 */

/** Sete semanas — a janela da spec §1. */
export const DIAS_DE_HISTORICO_PADRAO = 49

export type OpcoesTemporada = {
  /** Só o dia de HOJE recebe a porta. Dias passados publicam sem narrativa. */
  llm?: PortaLLM
  diasDeHistorico?: number
  /**
   * Para entre dias quando estoura. O bloco de HOJE espera o passado inteiro
   * ficar pronto — ver `produzirHoje`.
   */
  orcamentoMs?: number
  semente?: string
  aoProduzirDia?: (dia: string, indice: number, total: number) => void
}

export type ResumoTemporada = {
  inicio: string
  hoje: string
  diasProduzidos: number
  diasRestantes: number
  /** Jogos e box dos dias PASSADOS produzidos nesta execução. */
  jogosCriados: number
  boxScores: number
  /** Listas de dias PASSADOS publicadas nesta execução. Hoje conta à parte. */
  publicacoes: number
  /**
   * O bloco de HOJE, em contagem de ESTADO, não de novidade: são os números
   * que a rodada de hoje TEM depois desta execução. É o que o cron reporta, e
   * é o que faz a segunda execução do dia dizer a mesma coisa que a primeira
   * em vez de "zero" — reexecutar não desfaz a rodada.
   */
  jogosHoje: number
  itensListaSecreta: number
  apitosFireLive: number
  linhasComOdd: number
  classificados: number
  /** Jogos encerrados empatados fora da conta da tabela — ver `semearClassificacao`. */
  empates: number
  times: number
  jogadores: number
  versaoNiveis: string
}

type Contexto = {
  db: Db
  ruleset: Ruleset
  cadastro: Cadastro
  elencos: Map<string, JogadorSim[]>
  /** jogadores.id → times.id, pela LISTA ativa do CJ. Ver `timeDaLista`. */
  timeDoJogador: Map<string, string>
  calendario: Calendario
  semente: string
  fuso: string
}

/**
 * O VÍNCULO QUE VALE — `niveis.time_id` da versão ATIVA, nunca a sigla que o
 * parser leu, e nunca `jogadores.time_id`.
 *
 * Parecem a mesma coisa e não são. A lista do CJ tem DOIS "Wiggins" (MIA e
 * ATL): são duas pessoas, mas o cadastro casa jogador por nome em caixa baixa
 * e os dois viram uma linha só em `jogadores`; `niveis` tem UNIQUE por
 * (versão, jogador, atributo) e guarda o primeiro, o do MIA. Sem esta
 * consulta, o elenco do ATL produzia um box score para um jogador que, para o
 * resto da plataforma, é do MIA — e aí `semearPlacares` (que soma por
 * `niveis.time_id`) deixava esses pontos de fora do placar enquanto o box os
 * mostrava, e `estatisticas_time_jogo` ganhava uma TERCEIRA linha de time
 * naquele jogo.
 *
 * O motor, a tela e a classificação leem daqui. A simulação também tem de ler.
 */
async function timeDaLista(db: Db): Promise<Map<string, string>> {
  const linhas = await db
    .select({ jogadorId: niveis.jogadorId, timeId: niveis.timeId })
    .from(niveis)
    .innerJoin(niveisVersao, eq(niveis.niveisVersaoId, niveisVersao.id))
    .where(and(eq(niveisVersao.ativa, true), eq(niveis.atributo, 'PONTOS')))
  return new Map(linhas.map((l) => [l.jogadorId, l.timeId] as const))
}

/**
 * Para cada dia entre o início da janela e hoje que ainda não existe no
 * banco, produza-o; depois pare. Rodar de novo não faz nada. Se o cron perder
 * três dias, a próxima execução produz os três. Ver spec §3.
 */
export async function simularAte(
  db: Db,
  ruleset: Ruleset,
  agora: Date,
  opcoes: OpcoesTemporada = {},
): Promise<ResumoTemporada> {
  const inicioDaExecucao = Date.now()
  const orcamento = opcoes.orcamentoMs ?? Number.POSITIVE_INFINITY
  const semente = opcoes.semente ?? SEMENTE_TEMPORADA
  const { fuso } = ruleset.rodada
  const config = calendarioDoRuleset(ruleset)

  const cadastro = await semearCadastro(db, agora)
  const elencos = elencosDaLista(cadastro.analise.jogadores, ruleset)
  const timeDoJogador = await timeDaLista(db)
  const siglas = [...elencos.keys()].sort()

  const hoje = dataDeReferencia(agora, fuso)
  const inicio = inicioDaJanela(
    hoje,
    agora,
    opcoes.diasDeHistorico ?? DIAS_DE_HISTORICO_PADRAO,
    config,
  )
  const dias: string[] = []
  for (let d = inicio; d <= hoje; d = somarDias(d, 1)) dias.push(d)
  // O calendário é função de (semente, DIA absoluto), nunca da janela: pedir a
  // janela inteira ou um dia solto devolve a mesma rodada. É o que deixa o cron
  // tapar buraco sem reescrever o passado.
  const calendario = gerarCalendario({ siglas, dias, semente })

  const contexto: Contexto = {
    db,
    ruleset,
    cadastro,
    elencos,
    timeDoJogador,
    calendario,
    semente,
    fuso,
  }

  const passados = dias.filter((d) => d < hoje)
  const completos = await diasCompletos(contexto, passados)
  const pendentes = passados.filter((d) => !completos.has(d))

  let diasProduzidos = 0
  let jogosCriados = 0
  let boxScores = 0
  let publicacoes = 0
  let classificados = 0
  let empates = 0
  for (const [indice, dia] of pendentes.entries()) {
    if (Date.now() - inicioDaExecucao > orcamento) break
    opcoes.aoProduzirDia?.(dia, indice, pendentes.length)
    const r = await produzirDiaPassado(contexto, dia)
    diasProduzidos += 1
    jogosCriados += r.jogos
    boxScores += r.boxScores
    publicacoes += r.publicou ? 1 : 0
    classificados = r.classificados
    // ESTADO, não novidade: cada dia recomputa a tabela inteira, então este é o
    // número de empates que o banco TEM agora — somar contaria o mesmo empate
    // uma vez por dia produzido.
    empates = r.empates
  }

  /*
   * O DIA DE HOJE SÓ NASCE COM O PASSADO INTEIRO NO LUGAR.
   *
   * A Lista Secreta de hoje lê `medias_jogador`, e média com buraco não é a
   * média que o motor leria na véspera: publicar hoje por cima de uma janela
   * pela metade daria um apito explicado por um histórico que não existe. Se
   * o orçamento cortou a execução no meio do passado, hoje espera — a próxima
   * chamada fecha os dias que faltam e só então abre a rodada. É também o que
   * protege o `maxDuration` do cron: o bloco de hoje é o passo mais caro da
   * função (publicação com LLM, ciclo do Fire Live, odds e republicação).
   */
  const deHoje =
    diasProduzidos === pendentes.length
      ? await produzirHoje(contexto, hoje, agora, opcoes.llm)
      : HOJE_POR_FAZER

  return {
    inicio,
    hoje,
    diasProduzidos,
    diasRestantes: pendentes.length - diasProduzidos,
    jogosCriados,
    boxScores,
    publicacoes,
    jogosHoje: deHoje.jogos,
    itensListaSecreta: deHoje.itens,
    apitosFireLive: deHoje.apitosFireLive,
    linhasComOdd: deHoje.linhasComOdd,
    classificados,
    empates,
    times: cadastro.timePorSigla.size,
    jogadores: cadastro.jogadorPorChave.size,
    versaoNiveis: cadastro.versaoNiveis,
  }
}

/** hoje − N dias, nunca antes da abertura da temporada corrente (spec §1). */
function inicioDaJanela(
  hoje: string,
  agora: Date,
  diasDeHistorico: number,
  config: ReturnType<typeof calendarioDoRuleset>,
): string {
  const temporada = temporadaDe(agora, config)
  const anoBase = temporada.slice(0, 4)
  const abertura = `${anoBase}-${String(config.mesInicio).padStart(2, '0')}-01`
  const recuado = somarDias(hoje, -diasDeHistorico)
  return recuado < abertura ? abertura : recuado
}

/** Chave de um confronto, em ids de time — a identidade de um jogo dentro do dia. */
const confronto = (timeCasaId: string, timeVisitanteId: string) =>
  `${timeCasaId}|${timeVisitanteId}`

/**
 * OS CONFRONTOS QUE A SIMULAÇÃO MARCOU PARA O DIA — em ids de time.
 *
 * É esta a definição de "jogo da simulação". O calendário é função fechada de
 * (semente, dia absoluto), então esta resposta não muda com a janela nem com
 * o dia em que o cron roda: um jogo que não está aqui é de outra origem, e o
 * gerador não manda nele.
 */
function confrontosDoDia(c: Contexto, dia: string): Set<string> {
  const chaves = new Set<string>()
  for (const jogo of c.calendario.get(dia) ?? []) {
    const timeCasaId = c.cadastro.timePorSigla.get(jogo.casa)
    const timeVisitanteId = c.cadastro.timePorSigla.get(jogo.visitante)
    if (timeCasaId && timeVisitanteId) chaves.add(confronto(timeCasaId, timeVisitanteId))
  }
  return chaves
}

/**
 * "Dia pronto" = todo CONFRONTO que o calendário marcou para aquele dia está
 * ENCERRADO e com box score. Um dia pela metade é refeito inteiro (spec §3).
 *
 * A conta é sobre CONJUNTO de confrontos, não sobre contagem de linhas — e a
 * diferença não é de estilo. Um banco que já rodou o seed roteirizado (ou
 * qualquer outra ingestão) tem jogos naquelas datas que a simulação não
 * marcou; com igualdade de contagem, `total` nunca mais batia com o esperado,
 * o dia ficava pendente para SEMPRE, e cada execução do cron reescrevia o box
 * inteiro daquele dia. Jogo alheio na data não é assunto do gerador: o que ele
 * precisa saber é se os SEUS confrontos já aconteceram — e comparar o conjunto
 * (em vez de só contar os prontos) ainda recusa um dia cujos confrontos
 * mudaram.
 */
async function diasCompletos(c: Contexto, passados: readonly string[]): Promise<Set<string>> {
  if (passados.length === 0) return new Set()
  const linhas = await c.db
    .select({
      id: jogos.id,
      dia: jogos.dataReferencia,
      status: jogos.status,
      timeCasaId: jogos.timeCasaId,
      timeVisitanteId: jogos.timeVisitanteId,
    })
    .from(jogos)
    .where(
      and(
        gte(jogos.dataReferencia, passados[0]!),
        lte(jogos.dataReferencia, passados[passados.length - 1]!),
      ),
    )
  if (linhas.length === 0) return new Set()

  const comBox = new Set(
    (
      await c.db
        .selectDistinct({ jogoId: estatisticasJogo.jogoId })
        .from(estatisticasJogo)
        .where(
          inArray(
            estatisticasJogo.jogoId,
            linhas.map((l) => l.id),
          ),
        )
    ).map((l) => l.jogoId),
  )

  const prontosPorDia = new Map<string, Set<string>>()
  for (const l of linhas) {
    if (l.status !== 'ENCERRADO' || !comBox.has(l.id)) continue
    const doDia = prontosPorDia.get(l.dia) ?? new Set<string>()
    doDia.add(confronto(l.timeCasaId, l.timeVisitanteId))
    prontosPorDia.set(l.dia, doDia)
  }

  const completos = new Set<string>()
  for (const dia of passados) {
    const esperados = confrontosDoDia(c, dia)
    if (esperados.size === 0) continue
    const prontos = prontosPorDia.get(dia) ?? new Set<string>()
    if ([...esperados].every((chave) => prontos.has(chave))) completos.add(dia)
  }
  return completos
}

type JogoAgendado = {
  jogo: JogoSim
  jogoId: string
  quandoUtc: Date
  timeCasaId: string
  timeVisitanteId: string
}

function instanteLocal(dia: string, horaLocal: string, fuso: string): Date {
  const [h, m] = horaLocal.split(':').map(Number)
  return new Date(intervaloDoDia(dia, fuso).inicio.getTime() + (h! * 60 + m!) * 60_000)
}

/** Agenda a rodada do dia (upsert) e devolve os jogos com ids. Ordem: horário, depois casa. */
async function agendarRodada(
  c: Contexto,
  dia: string,
  status: 'AGENDADO' | 'ENCERRADO' = 'AGENDADO',
): Promise<JogoAgendado[]> {
  const agendados: JogoAgendado[] = []
  const doDia = [...(c.calendario.get(dia) ?? [])].sort((a, b) =>
    a.horaLocal === b.horaLocal
      ? a.casa.localeCompare(b.casa)
      : a.horaLocal.localeCompare(b.horaLocal),
  )
  for (const jogo of doDia) {
    const timeCasaId = c.cadastro.timePorSigla.get(jogo.casa)
    const timeVisitanteId = c.cadastro.timePorSigla.get(jogo.visitante)
    if (!timeCasaId || !timeVisitanteId) continue
    const quandoUtc = instanteLocal(dia, jogo.horaLocal, c.fuso)
    const jogoId = await upsertJogoDemo(c.db, {
      timeCasaId,
      timeVisitanteId,
      quandoUtc,
      dataReferencia: dia,
      status,
    })
    agendados.push({ jogo, jogoId, quandoUtc, timeCasaId, timeVisitanteId })
  }
  return agendados
}

/**
 * Sorteia os desfalques do dia, grava-os e devolve, por sigla, quem está fora
 * — UNIÃO do sorteio com o que já estava gravado para aqueles jogos. Assim um
 * desfalque forçado ontem (a OPD garantida de hoje) continua valendo quando o
 * dia é refeito amanhã.
 */
async function registrarDesfalques(
  c: Contexto,
  dia: string,
  agendados: readonly JogoAgendado[],
  forcados: ReadonlyMap<string, string[]> = new Map(),
): Promise<Map<string, string[]>> {
  const sorteados = desfalquesDoDia({
    dia,
    jogos: agendados.map((a) => a.jogo),
    elencos: c.elencos,
    semente: c.semente,
  })

  for (const a of agendados) {
    for (const sigla of [a.jogo.casa, a.jogo.visitante]) {
      const nomes = [...(sorteados.get(sigla) ?? []), ...(forcados.get(sigla) ?? [])]
      for (const nome of nomes) {
        const jogadorId = c.cadastro.jogadorPorChave.get(chaveDeNome(nome))
        if (!jogadorId) continue
        await c.db
          .insert(lesoesEscalacao)
          .values({
            jogoId: a.jogoId,
            jogadorId,
            status: 'FORA',
            motivo: 'temporada simulada',
            confirmado: true,
          })
          .onConflictDoUpdate({
            target: [lesoesEscalacao.jogoId, lesoesEscalacao.jogadorId],
            set: { status: 'FORA' },
          })
      }
    }
  }

  const gravados = await c.db
    .select({ jogoId: lesoesEscalacao.jogoId, jogadorId: lesoesEscalacao.jogadorId })
    .from(lesoesEscalacao)
    .where(
      and(
        inArray(
          lesoesEscalacao.jogoId,
          agendados.map((a) => a.jogoId),
        ),
        eq(lesoesEscalacao.status, 'FORA'),
      ),
    )

  // A comparação é por UUID, nunca pela grafia. `jogadorPorChave` é
  // muitos-para-um desde que a curadoria passou a fundir as grafias do mesmo
  // jogador entre as listas ("Hart" em pontos, "Josh Hart" em rebotes): virar
  // o Map deixava UMA chave por id — a última — e o elenco, que usa a grafia
  // da lista de PONTOS, deixava de se reconhecer no desfalque. O jogador
  // ficava FORA em `lesoes_escalacao` e ganhava linha de box assim mesmo.
  const foraPorJogo = new Map<string, Set<string>>()
  for (const g of gravados) {
    const ids = foraPorJogo.get(g.jogoId) ?? new Set<string>()
    ids.add(g.jogadorId)
    foraPorJogo.set(g.jogoId, ids)
  }

  const fora = new Map<string, string[]>()
  for (const a of agendados) {
    const ids = foraPorJogo.get(a.jogoId) ?? new Set<string>()
    for (const sigla of [a.jogo.casa, a.jogo.visitante]) {
      const elenco = c.elencos.get(sigla) ?? []
      fora.set(
        sigla,
        elenco
          .filter((j) => {
            const id = c.cadastro.jogadorPorChave.get(chaveDeNome(j.nome))
            return id !== undefined && ids.has(id)
          })
          .map((j) => j.nome),
      )
    }
  }
  return fora
}

/**
 * O DIA JÁ PODE PUBLICAR A SUA LISTA? — a pergunta que mantém a demo honesta.
 *
 * Duas condições, e as duas são sobre CONHECIMENTO, não sobre estado do banco:
 *
 * 1. **A lista de um dia é publicada uma vez só.** Quando o cron reprocessa
 *    ontem (ontem era o "hoje" da execução anterior: rodada agendada, um jogo
 *    AO_VIVO, box parcial — logo, incompleto), a lista de ontem já existe, e
 *    foi publicada no momento certo, com narrativa. Republicá-la agora não
 *    acrescenta nada e arrisca reescrever o snapshot sem as narrativas.
 * 2. **Nada dali em diante pode ter acontecido.** `montarFatos` corta o
 *    histórico em `data_hora_utc < início do dia`, mas as médias vêm da tabela
 *    `medias_jogador`, que não tem corte de data: ela é o retrato do último
 *    `recalcularMedias`. Enquanto nenhum jogo daquele dia em diante estiver
 *    ENCERRADO, esse retrato só pode conter jogos anteriores — que é
 *    exatamente o que se sabia na véspera. Se algum já aconteceu (o próprio
 *    dia numa versão anterior, ou os dias seguintes), publicar agora daria ao
 *    motor uma média com o futuro dentro, e o green da tela de Resultados
 *    viraria ficção. Então não se publica: lista faltando é um buraco
 *    visível; lista com hindsight é mentira que ninguém tem como notar.
 *
 * "Aconteceu" é sobre os jogos DA SIMULAÇÃO, não sobre qualquer linha
 * ENCERRADA da janela. A distinção é o que separa "o passado que eu produzi"
 * de "o que já estava no banco": num banco que rodou o seed roteirizado antes
 * da troca, a segunda leitura dava verdadeiro para TODO dia pendente logo na
 * primeira execução, e a temporada nascia com centenas de jogos e nenhuma
 * Lista Secreta — `feed_snapshot` vazio, Resultados sem green nem red, e o
 * resumo devolvendo `diasProduzidos` como se estivesse tudo feito. Só entram
 * na conta os confrontos que o calendário marcou (`confrontosDoDia`).
 *
 * O próprio dia entra na conta antes de `agendarRodada` devolvê-lo a AGENDADO
 * — por isso a consulta roda ANTES do agendamento. E o próprio dia conta tanto
 * quanto os seguintes: o dia refeito cujos OUTROS jogos continuam ENCERRADOS
 * já está dentro de `medias_jogador`.
 */
async function algoJaAconteceuDe(c: Contexto, dia: string): Promise<boolean> {
  const daSimulacao = new Set<string>()
  for (const outroDia of c.calendario.keys()) {
    if (outroDia < dia) continue
    for (const chave of confrontosDoDia(c, outroDia)) daSimulacao.add(`${outroDia}|${chave}`)
  }
  if (daSimulacao.size === 0) return false

  const linhas = await c.db
    .select({
      dia: jogos.dataReferencia,
      timeCasaId: jogos.timeCasaId,
      timeVisitanteId: jogos.timeVisitanteId,
    })
    .from(jogos)
    .where(and(gte(jogos.dataReferencia, dia), eq(jogos.status, 'ENCERRADO')))
  return linhas.some((l) =>
    daSimulacao.has(`${l.dia}|${confronto(l.timeCasaId, l.timeVisitanteId)}`),
  )
}

async function jaTemLista(db: Db, dia: string): Promise<boolean> {
  const [linha] = await db
    .select({ id: feedSnapshot.id })
    .from(feedSnapshot)
    .where(
      and(eq(feedSnapshot.dataReferencia, dia), eq(feedSnapshot.estrategia, 'LISTA_SECRETA')),
    )
    .limit(1)
  return linha !== undefined
}

/**
 * UM DIA PASSADO, na ordem que torna o resultado honesto:
 * agendar → publicar → jogar → recalcular.
 *
 * Inverter os dois do meio faria o motor apitar sabendo o placar. Não é
 * estilo: é a diferença entre uma taxa de acerto e uma fraude.
 */
async function produzirDiaPassado(
  c: Contexto,
  dia: string,
): Promise<{
  jogos: number
  boxScores: number
  publicou: boolean
  classificados: number
  empates: number
}> {
  // 0 · O que o banco já sabe deste dia em diante — perguntado antes de mexer
  //     em nada, porque o passo 1 devolve os jogos do dia a AGENDADO.
  const jaAconteceu = await algoJaAconteceuDe(c, dia)

  // 1 · Agendar a rodada e sortear os desfalques. O upsert devolve os jogos ao
  //     estado "por acontecer": refazer um dia começa por desfazê-lo.
  const agendados = await agendarRodada(c, dia)
  if (agendados.length === 0)
    return { jogos: 0, boxScores: 0, publicou: false, classificados: 0, empates: 0 }
  const idsDoDia = agendados.map((a) => a.jogoId)
  const fora = await registrarDesfalques(c, dia, agendados)

  // 1b · O box do dia é APAGADO antes de ser reescrito, não sobrescrito. Um
  //      upsert deixaria para trás a linha de quem jogou na versão anterior e
  //      hoje está fora (o box parcial do AO_VIVO de ontem é o caso real), e
  //      essa linha fantasma entraria na média e no "últimos 5" do card.
  await c.db.delete(estatisticasJogo).where(inArray(estatisticasJogo.jogoId, idsDoDia))

  // 2 · Publicar a Lista Secreta com o que se sabia na véspera — 1h antes do
  //     primeiro jogo, sem LLM (spec §3: 50 dias × 50 itens de narrativa
  //     seriam 2.500 chamadas pagas por textos que ninguém abre).
  const primeiro = agendados[0]!.quandoUtc
  const antecedenciaMs = c.ruleset.publicacao.lista_secreta.antecedencia_minutos * 60_000
  const quandoPublicar = new Date(primeiro.getTime() - antecedenciaMs)

  let publicou = false
  if (!jaAconteceu && !(await jaTemLista(c.db, dia))) {
    const publicacao = await publicarListaSecreta(c.db, c.ruleset, {
      dataReferencia: dia,
      agora: quandoPublicar,
      ignorarAntecedencia: true,
    })
    publicou = publicacao.publicou
  }

  // 3 · Jogar. Só agora os números do dia existem.
  let boxScores = 0
  for (const a of agendados) {
    // As linhas FILTRADAS de cada lado (sem vínculo e homônimo já descartados):
    // são elas que `semearPlacares` soma, então é sobre elas que se desempata.
    const porLado: Record<'casa' | 'visitante', Array<LinhaBox & { jogadorId: string }>> = {
      casa: [],
      visitante: [],
    }
    for (const lado of ['casa', 'visitante'] as const) {
      const sigla = a.jogo[lado]
      const timeId = lado === 'casa' ? a.timeCasaId : a.timeVisitanteId
      const box = boxScoreDoTime({
        // CONVENÇÃO DE CHAVE — é ela que faz a temporada ser reproduzível em
        // qualquer banco. Mudar este formato reescreve a temporada inteira.
        chave: `${c.semente}|${dia}|${a.jogo.casa}x${a.jogo.visitante}|${sigla}`,
        elenco: c.elencos.get(sigla) ?? [],
        fora: fora.get(sigla) ?? [],
      })
      for (const l of box) {
        // `LinhaBox.nome` é o nome CRU da lista do CJ ('shai', 'jokic').
        const jogadorId = c.cadastro.jogadorPorChave.get(chaveDeNome(l.nome))
        if (!jogadorId) continue
        // Homônimo em dois elencos: só joga por quem a LISTA diz (ver
        // `timeDaLista`). A linha é descartada DEPOIS de gerada, nunca antes —
        // o gerador é uma sequência, e tirar um jogador do meio dela mudaria
        // os números de todos os que vêm atrás.
        if (c.timeDoJogador.get(jogadorId) !== timeId) continue
        porLado[lado].push({ ...l, jogadorId })
      }
    }
    // DESEMPATE antes da inserção — a NBA não empata; a demo também não. A
    // chave é a do jogo mais `|desempate`: o reparo do passado reproduz a
    // mesma escolha (ver `reparo-empates.ts`).
    const decidido = desempatar(
      porLado.casa,
      porLado.visitante,
      criarSorteio(`${c.semente}|${dia}|${a.jogo.casa}x${a.jogo.visitante}|desempate`),
    )
    // O desdobramento em 2C/3C/LL sai do valor FINAL de pontos: é o que mantém
    // `2·doisC + 3·tresC + lanceC = pontos` na linha que recebeu a cesta.
    const linhas: (typeof estatisticasJogo.$inferInsert)[] = [
      ...decidido.casa,
      ...decidido.visitante,
    ].map((l) => ({
      jogoId: a.jogoId,
      jogadorId: l.jogadorId,
      minutos: l.minutos.toFixed(2),
      pontos: l.pontos,
      rebotesTotal: l.rebotes,
      assistencias: l.assistencias,
      ...decomporPontos(l.pontos),
      ...boxComplementar(`${c.semente}|${dia}|${l.nome}`, l.rebotes),
    }))
    if (linhas.length > 0) {
      // O passo 1b já esvaziou o dia, então o conflito só aparece se duas
      // execuções se cruzarem (o cron e a carga à mão, por exemplo). O upsert
      // faz a segunda reescrever em vez de morrer com 23505.
      await c.db
        .insert(estatisticasJogo)
        .values(linhas)
        .onConflictDoUpdate({
          target: [estatisticasJogo.jogoId, estatisticasJogo.jogadorId],
          set: {
            minutos: excluded('minutos'),
            pontos: excluded('pontos'),
            rebotesTotal: excluded('rebotes_total'),
            rebotesOf: excluded('rebotes_of'),
            rebotesDef: excluded('rebotes_def'),
            assistencias: excluded('assistencias'),
            cestasC: excluded('cestas_c'),
            cestasT: excluded('cestas_t'),
            doisC: excluded('dois_c'),
            doisT: excluded('dois_t'),
            tresC: excluded('tres_c'),
            tresT: excluded('tres_t'),
            lanceC: excluded('lance_c'),
            lanceT: excluded('lance_t'),
            roubos: excluded('roubos'),
            bloqueios: excluded('bloqueios'),
            turnovers: excluded('turnovers'),
            faltas: excluded('faltas'),
          },
        })
      boxScores += linhas.length
    }
    await c.db
      .update(jogos)
      .set({ status: 'ENCERRADO', quartoAtual: null })
      .where(eq(jogos.id, a.jogoId))
  }

  // 3b · Placar e box do TIME — derivados do box dos jogadores pelas mesmas
  //      funções de sempre, restritas aos jogos do dia. O placar sai do
  //      vínculo da LISTA do CJ (`niveis.time_id`), exatamente como o box do
  //      time: os dois números da tela nascem da mesma soma.
  await semearPlacares(c.db, idsDoDia)
  await semearBoxScoreDoTime(c.db, agendados[agendados.length - 1]!.quandoUtc, idsDoDia)

  // 4 · Recalcular as médias (função real da ingestão, janela do ruleset) e
  //     reescrever a classificação. A partir daqui o dia faz parte do passado.
  await recalcularMedias(c.db, {
    janela: c.ruleset.media.janela,
    configTemporada: calendarioDoRuleset(c.ruleset),
    agora: primeiro,
  })
  const resultado = await semearClassificacao(c.db, c.ruleset, dia)

  return {
    jogos: agendados.length,
    boxScores,
    publicou,
    classificados: resultado.linhas,
    empates: resultado.empates,
  }
}

// ---------------------------------------------------------------------------
// HOJE — a rodada que ainda vai acontecer
// ---------------------------------------------------------------------------

type BlocoDeHoje = {
  jogos: number
  itens: number
  apitosFireLive: number
  linhasComOdd: number
}

const HOJE_POR_FAZER: BlocoDeHoje = { jogos: 0, itens: 0, apitosFireLive: 0, linhasComOdd: 0 }

/**
 * HOJE: rodada agendada, o primeiro jogo AO VIVO no 1º quarto, Lista Secreta
 * com narrativa real e odds das casas fictícias.
 *
 * OS DOIS CENÁRIOS FORÇADOS da spec §3 vivem aqui, e só aqui — o resto da
 * temporada inteira é sorteio:
 *
 *   (a) um desfalque em PREFIXO da hierarquia, para a OPD acontecer;
 *   (b) o modo fire aceso no jogo ao vivo.
 *
 * Está escrito na spec e está escrito aqui para que ninguém descubra depois:
 * o que a apresentação mostra nestes dois pontos foi escolhido, e o que ela
 * mostra em todo o resto foi sorteado e avaliado pelo motor.
 */
async function produzirHoje(
  c: Contexto,
  hoje: string,
  agora: Date,
  llm: PortaLLM | undefined,
): Promise<BlocoDeHoje> {
  const agendados = await agendarRodada(c, hoje)
  if (agendados.length === 0) return HOJE_POR_FAZER

  // O primeiro jogo da rodada é o que está acontecendo — é isso que dá à
  // demonstração um Fire Live e uma Lista Secreta ao mesmo tempo (spec §1).
  const aoVivo = agendados[0]!

  // (a) O desfalque forçado vai junto do sorteio, e `registrarDesfalques`
  //     grava a UNIÃO dos dois: quando este dia for refeito amanhã — quando
  //     ninguém mais forçar nada —, o que foi forçado hoje continua gravado, e
  //     a OPD que a lista publicou continua batendo com o box do jogo.
  const fora = await registrarDesfalques(c, hoje, agendados, desfalqueQueAbreAOpd(c, agendados))

  await c.db
    .update(jogos)
    .set({ status: 'AO_VIVO', quartoAtual: c.ruleset.fire_live.quarto })
    .where(eq(jogos.id, aoVivo.jogoId))

  await semearPrimeiroQuarto(c, aoVivo, fora, hoje, agora)

  // O MOTOR calcula. Nada abaixo desta linha escreve apito à mão.
  const publicacao = await publicarListaSecreta(c.db, c.ruleset, {
    dataReferencia: hoje,
    agora,
    ignorarAntecedencia: true,
    llm,
  })

  // Depois da lista: o cruzamento do card ao vivo ("já estava apitado em OPD")
  // lê a OPD COMO PUBLICADA, da tabela de apitos (ver `montarFatosDoJogo`).
  await executarCiclo(c.db, c.ruleset, new FilaEmMemoria(), {
    jogoId: aoVivo.jogoId,
    estadoAnterior: null,
    iniciadoEm: agora,
    agora,
  })

  // As odds vêm DEPOIS da lista — a cotação é por LINHA, e quem decide quais
  // linhas existem é o motor.
  const linhasComOdd = await semearOdds(c.db, c.ruleset, hoje, agora)

  /*
   * E a lista é REPUBLICADA. A ordem acima é obrigatória e o efeito colateral
   * era o card sem odd no rodapé: o snapshot foi materializado quando
   * `odds_agregada` ainda estava vazia. O hash cobre o item inteiro, então a
   * regravação só acontece se algo mudou de verdade.
   *
   * A porta de LLM vai nas DUAS publicações, e isso é deliberado. A narrativa
   * só é gerada na transição de hash (ver `publicarListaSecreta`): publicar a
   * primeira vez sem porta gravaria o hash novo sem texto, e a republicação
   * seguinte — que muitas vezes chega ao MESMO hash — nunca mais chamaria a
   * LLM. A lista do dia ficaria sem narrativa para sempre. O custo é uma
   * segunda passada sobre a lista de UM dia, e só quando algo mudou; é outra
   * ordem de grandeza do que a spec §3 recusou (50 dias × ~50 itens).
   */
  const comOdds = await publicarListaSecreta(c.db, c.ruleset, {
    dataReferencia: hoje,
    agora,
    ignorarAntecedencia: true,
    llm,
  })

  const noAr = comOdds.publicou ? comOdds : publicacao
  const doFireLive = await c.db
    .select({ id: apitos.id })
    .from(apitos)
    .where(and(eq(apitos.jogoId, aoVivo.jogoId), eq(apitos.estrategia, 'FIRE_LIVE')))

  return {
    jogos: agendados.length,
    itens: noAr.publicou ? noAr.itens : 0,
    apitosFireLive: doFireLive.length,
    linhasComOdd,
  }
}

/**
 * (a) O DESFALQUE QUE ABRE A OPD — o nº 1 de um time que joga hoje.
 *
 * A regra do CJ exige desfalque em PREFIXO da hierarquia: com o nº 1 fora, os
 * três seguintes recebem o apito, e é `avaliarOpd` que decide o nível de cada
 * um. Tirar o nº 2 sozinho não produziria nada.
 *
 * O alvo é procurado do ÚLTIMO jogo do dia para trás, e o jogo AO VIVO fica de
 * fora: tirar o topo dali derrubaria justamente o protagonista do modo fire.
 * Com um jogo só na rodada, sobra o visitante — o modo fire prefere a casa.
 *
 * O nº 1 precisa ser do time pela LISTA ATIVA (`timeDaLista`): há dois
 * "Wiggins" na lista do CJ e eles são uma linha só em `jogadores`, então o nº 1
 * de um dos dois times não existe na hierarquia daquele time para o motor — e
 * marcá-lo como fora não abriria prefixo nenhum.
 */
function desfalqueQueAbreAOpd(
  c: Contexto,
  agendados: readonly JogoAgendado[],
): Map<string, string[]> {
  const candidatas: string[] = []
  for (let i = agendados.length - 1; i >= 1; i--) {
    candidatas.push(agendados[i]!.jogo.casa, agendados[i]!.jogo.visitante)
  }
  candidatas.push(agendados[0]!.jogo.visitante)

  for (const sigla of candidatas) {
    const [primeiro] = c.elencos.get(sigla) ?? []
    if (primeiro === undefined) continue
    const timeId = c.cadastro.timePorSigla.get(sigla)
    const jogadorId = c.cadastro.jogadorPorChave.get(chaveDeNome(primeiro.nome))
    if (!timeId || !jogadorId || c.timeDoJogador.get(jogadorId) !== timeId) continue
    return new Map([[sigla, [primeiro.nome]]])
  }
  return new Map()
}

/** Quem entra em quadra por um time, já casado com o `jogadores.id` da lista ativa. */
function emQuadra(
  c: Contexto,
  sigla: string,
  fora: ReadonlyMap<string, string[]>,
): { jogador: JogadorSim; jogadorId: string }[] {
  const timeId = c.cadastro.timePorSigla.get(sigla)
  const desfalcados = fora.get(sigla) ?? []
  const emCampo: { jogador: JogadorSim; jogadorId: string }[] = []
  for (const jogador of c.elencos.get(sigla) ?? []) {
    if (desfalcados.includes(jogador.nome)) continue
    const jogadorId = c.cadastro.jogadorPorChave.get(chaveDeNome(jogador.nome))
    // Homônimo em dois elencos: só joga por quem a LISTA diz (ver `timeDaLista`).
    if (!jogadorId || !timeId || c.timeDoJogador.get(jogadorId) !== timeId) continue
    emCampo.push({ jogador, jogadorId })
  }
  return emCampo
}

/**
 * (b) O 1º QUARTO DO JOGO AO VIVO, COM O MODO FIRE ACESO.
 *
 * `semearJogoAoVivo` força o protagonista de cada atributo a cruzar o primeiro
 * marco do ruleset — em pontos, ao menos o percentual da média que acende o
 * modo fire. Só que o marco é calculado sobre a média-ALVO do jogador
 * (`mediaDe`), e o motor compara contra a média AMOSTRAL que a temporada
 * produziu: quem jogou acima do próprio alvo nestas semanas pode não acender.
 *
 * Em vez de reimplementar a conta aqui — regra do CJ não se digita duas vezes
 * —, o candidato é semeado e a pergunta é feita AO MOTOR, com os mesmos fatos
 * que o ciclo do Fire Live vai ler. Se não acendeu, entra o próximo candidato;
 * a semeadura é upsert, então a tentativa anterior é sobrescrita inteira.
 */
async function semearPrimeiroQuarto(
  c: Contexto,
  aoVivo: JogoAgendado,
  fora: ReadonlyMap<string, string[]>,
  hoje: string,
  agora: Date,
): Promise<void> {
  const casa = emQuadra(c, aoVivo.jogo.casa, fora)
  const visitante = emQuadra(c, aoVivo.jogo.visitante, fora)
  const elenco: JogadorAoVivo[] = [
    ...casa.map(({ jogador, jogadorId }) => ({
      nome: jogador.nome,
      jogadorId,
      nivel: jogador.nivel,
      timeId: aoVivo.timeCasaId,
    })),
    ...visitante.map(({ jogador, jogadorId }) => ({
      nome: jogador.nome,
      jogadorId,
      nivel: jogador.nivel,
      timeId: aoVivo.timeVisitanteId,
    })),
  ]

  const noJogo = [...casa, ...visitante].map(({ jogador }) => jogador)
  const candidatos = candidatosAoModoFire(c, casa, visitante)

  for (const candidato of candidatos.length > 0 ? candidatos : [null]) {
    await semearJogoAoVivo(c.db, c.ruleset, {
      jogoId: aoVivo.jogoId,
      timeCasaId: aoVivo.timeCasaId,
      timeVisitanteId: aoVivo.timeVisitanteId,
      elenco,
      protagonistas: protagonistasDoJogo(noJogo, candidato),
      // CONVENÇÃO DE CHAVE do 1º quarto — o dia entra para que a rodada de
      // amanhã não repita, número por número, o quarto de hoje.
      chave: `${c.semente}|1Q|${hoje}`,
      agora,
    })
    if (candidato !== null && (await modoFireAceso(c, aoVivo.jogoId))) break
  }
}

/**
 * Quem pode acender o modo fire, na ordem em que a demonstração prefere.
 *
 * `modo_fire.aplica_a` (do ruleset) decide quem é elegível — Suporte e Randola
 * nunca entram em modo fire, e forçá-los seria mentir na tela. Entre os
 * elegíveis, a ordem é a do BLOCO DE TOPO (ADR-0006): nível primeiro, depois a
 * hierarquia do CJ, a casa antes do visitante. O primeiro que o motor
 * confirmar fica.
 */
function candidatosAoModoFire(
  c: Contexto,
  casa: readonly { jogador: JogadorSim }[],
  visitante: readonly { jogador: JogadorSim }[],
): JogadorSim[] {
  const elegiveis = c.ruleset.fire_live.modo_fire.aplica_a
  return [
    ...casa.map(({ jogador }) => ({ jogador, lado: 0 })),
    ...visitante.map(({ jogador }) => ({ jogador, lado: 1 })),
  ]
    .filter(({ jogador }) => elegiveis.includes(jogador.nivel))
    .sort(
      (a, b) =>
        NIVEIS.indexOf(a.jogador.nivel) - NIVEIS.indexOf(b.jogador.nivel) ||
        a.jogador.posicaoHierarquia - b.jogador.posicaoHierarquia ||
        a.lado - b.lado,
    )
    .map(({ jogador }) => jogador)
}

/**
 * Um protagonista POR ATRIBUTO — os três canais de push aparecem na
 * demonstração, não só o de pontos.
 *
 * Pontos é o candidato ao modo fire; rebotes e assistências vão para o melhor
 * nível DERIVADO em quadra, excluindo quem já é o protagonista de pontos, com
 * a hierarquia desempatando.
 */
function protagonistasDoJogo(
  noJogo: readonly JogadorSim[],
  pontos: JogadorSim | null,
): Record<Atributo, string | null> {
  const melhorEm = (atributo: Atributo): string | null =>
    [...noJogo]
      .filter((j) => j.nome !== pontos?.nome)
      .sort(
        (a, b) =>
          NIVEIS.indexOf(a.niveis[atributo]) - NIVEIS.indexOf(b.niveis[atributo]) ||
          a.posicaoHierarquia - b.posicaoHierarquia,
      )[0]?.nome ?? null

  return {
    PONTOS: pontos?.nome ?? null,
    REBOTES: melhorEm('REBOTES'),
    ASSISTENCIAS: melhorEm('ASSISTENCIAS'),
  }
}

/**
 * O modo fire acendeu? Pergunta feita AO MOTOR, sobre os mesmos fatos que o
 * ciclo do Fire Live vai ler daqui a pouco — nenhum limiar, percentual ou
 * multiplicador é recalculado aqui.
 *
 * `opdPreLive` entra vazio de propósito: ele só decora o card com a OPD já
 * publicada e não participa de nenhuma decisão de apito.
 */
async function modoFireAceso(c: Contexto, jogoId: string): Promise<boolean> {
  const fatos = await montarFatosDoJogo(c.db, jogoId, calendarioDoRuleset(c.ruleset), c.ruleset.media.janela)
  if (fatos === null) return false
  return fatos.times.some((time) =>
    avaliarFireLive(time, fatos.jogo, c.ruleset, { opdPreLive: new Map() }).apitos.some(
      (a) => a.modoFire,
    ),
  )
}
