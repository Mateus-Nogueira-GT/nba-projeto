import { and, eq, inArray, isNull } from 'drizzle-orm'

import { apitos, fireLiveExecucoes, greens, jogadores, times } from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import { montarFatosDoJogo } from '../../dominio/fatos-ao-vivo'
import { gravarApitos } from '../../dominio/repositorios/apitos'
import { gravarGreens } from '../../dominio/repositorios/greens'
import { avaliarFireLive } from '../../motor/fire-live/avaliar'
import type { Green } from '../../motor/fire-live/avaliar'
import { origemDoAtributo } from '../../motor'
import { montarChave } from '../../motor/tipos'
import type { Apito, Nivel } from '../../motor/tipos'
import type { Ruleset } from '../../motor/ruleset/schema'
import type { MensagemPush, PortaFila } from '../fila/porta'
import { mensagemDeApito, mensagemDeGreen } from './push'
import { materializarFeedFireLive } from './feed'
import { calendarioDoRuleset } from '../../dominio/temporada'

/**
 * Estado observado no ciclo anterior: valor por (jogador, atributo).
 *
 * Serve à EFICIÊNCIA — decidir quem mudou e portanto quem reavaliar. Não
 * participa da deduplicação. Se este estado se perder, o ciclo seguinte
 * reavalia todo mundo e o resultado continua correto, porque quem barra push
 * repetido é a UNIQUE no banco.
 */
export type EstadoObservado = Record<string, number>

export type MotivoEncerramento =
  'fim-do-primeiro-quarto' | 'jogo-encerrado' | 'jogo-nao-encontrado' | 'limite-de-tempo'

export type ResultadoCiclo =
  | { encerrar: true; motivo: MotivoEncerramento; ciclou: false }
  | {
      encerrar: false
      ciclou: true
      estado: EstadoObservado
      /** Quantos jogadores mudaram e foram efetivamente reavaliados. */
      avaliados: number
      apitosNovos: number
      greensNovos: number
      pushes: MensagemPush[]
    }

function chaveEstado(jogadorId: string, atributo: string): string {
  return `${jogadorId}|${atributo}`
}

/**
 * Achata as estatísticas do quarto observado em pares chave→valor.
 *
 * Só o quarto do Fire Live entra. Estatística de 2Q em diante não pode sequer
 * influenciar a detecção de mudança.
 */
function estadoDosFatos(
  estatisticas: {
    jogadorId: string
    quarto: number
    pontos: number
    rebotes: number
    assistencias: number
  }[],
  quarto: number,
): EstadoObservado {
  const estado: EstadoObservado = {}
  for (const e of estatisticas) {
    if (e.quarto !== quarto) continue
    estado[chaveEstado(e.jogadorId, 'PONTOS')] = e.pontos
    estado[chaveEstado(e.jogadorId, 'REBOTES')] = e.rebotes
    estado[chaveEstado(e.jogadorId, 'ASSISTENCIAS')] = e.assistencias
  }
  return estado
}

/** Jogadores cujo número mudou entre dois estados. */
function jogadoresAfetados(anterior: EstadoObservado, atual: EstadoObservado): Set<string> {
  const afetados = new Set<string>()
  for (const [chave, valor] of Object.entries(atual)) {
    if (anterior[chave] !== valor) afetados.add(chave.split('|')[0] as string)
  }
  return afetados
}

/**
 * UM CICLO DO FIRE LIVE.
 *
 *   observa → detecta mudança → avalia SÓ os afetados → grava (a UNIQUE decide
 *   o que é novo) → enfileira o que ainda não foi enfileirado
 *
 * A ordem importa. O push sai do OUTBOX — as linhas com `push_enfileirado_em`
 * nulo —, nunca do que o motor acabou de calcular. O motor recalcula os mesmos
 * apitos a cada 20 segundos por desenho; é a constraint que separa "aconteceu
 * agora" de "já tinha acontecido", e é o outbox que garante que uma falha da
 * fila não engula o push em silêncio.
 *
 * Reexecutar este ciclo inteiro é seguro — é exatamente o que o retry de um
 * passo do workflow faz.
 */
export async function executarCiclo(
  db: Db,
  ruleset: Ruleset,
  fila: PortaFila,
  opcoes: {
    jogoId: string
    estadoAnterior: EstadoObservado | null
    /** Quando o loop começou. Governa a trava dura de encerramento. */
    iniciadoEm: Date
    agora: Date
  },
): Promise<ResultadoCiclo> {
  const quarto = ruleset.fire_live.quarto

  // TRAVA DURA — encerra em qualquer hipótese, mesmo que o provedor ainda
  // diga "1º quarto". Um feed travado não pode prender o workflow pra sempre.
  const limiteMs = ruleset.fire_live.observacao.limite_minutos * 60_000
  if (opcoes.agora.getTime() - opcoes.iniciadoEm.getTime() >= limiteMs) {
    return { encerrar: true, motivo: 'limite-de-tempo', ciclou: false }
  }

  const fatos = await montarFatosDoJogo(db, opcoes.jogoId, calendarioDoRuleset(ruleset), ruleset.media.janela)
  if (fatos === null) return { encerrar: true, motivo: 'jogo-nao-encontrado', ciclou: false }

  // A GUARDA DO QUARTO. Vale para os dois lados: o jogo ainda não começou
  // (quartoAtual null) ou já passou do 1Q. Nos dois casos o Fire Live não age.
  if (fatos.jogo.quartoAtual !== quarto) {
    // Última materialização antes de encerrar: os itens ficam na tela até o
    // fim do jogo, marcados como encerrados (spec 05 / G2).
    await materializarFeedFireLive(db, ruleset, opcoes.jogoId, opcoes.agora)
    return { encerrar: true, motivo: 'fim-do-primeiro-quarto', ciclou: false }
  }

  const estado = estadoDosFatos(fatos.jogo.estatisticasQuarto, quarto)

  // Primeiro ciclo (sem estado anterior) avalia todo mundo; os seguintes,
  // apenas quem mudou. NUNCA a liga inteira — só os times deste jogo.
  const afetados =
    opcoes.estadoAnterior === null ? null : jogadoresAfetados(opcoes.estadoAnterior, estado)

  const apitosCalculados: Apito[] = []
  const greensCalculados: Green[] = []
  let avaliados = 0

  // Nada mudou: não recalcula. Mas o outbox ainda é varrido logo abaixo, para
  // que um push que ficou pendente por falha de fila saia neste ciclo.
  if (afetados === null || afetados.size > 0) {
    for (const time of fatos.times) {
      const resultado = avaliarFireLive(time, fatos.jogo, ruleset, {
        apenasJogadores: afetados ?? undefined,
        opdPreLive: fatos.opdPreLive,
      })
      apitosCalculados.push(...resultado.apitos)
      greensCalculados.push(...resultado.greens)
      // Contagem vinda de DENTRO do motor — mede trabalho real, não intenção.
      avaliados += resultado.examinados
    }
  }

  const rulesetVersao = `v${ruleset.version}`
  const [apitosGravados, greensGravados] = await Promise.all([
    gravarApitos(db, rulesetVersao, apitosCalculados),
    gravarGreens(db, greensCalculados),
  ])

  const pushes = await drenarOutbox(db, ruleset, fila, opcoes.jogoId, opcoes.agora)

  // Materializa por último, com os apitos do jogo já persistidos: a tela lê
  // este snapshot, nunca o motor. Escrita pulada quando o hash não muda.
  await materializarFeedFireLive(db, ruleset, opcoes.jogoId, opcoes.agora)

  return {
    encerrar: false,
    ciclou: true,
    estado,
    avaliados,
    apitosNovos: apitosGravados.length,
    greensNovos: greensGravados.length,
    pushes,
  }
}

/**
 * OUTBOX — enfileira o que foi gravado e ainda não saiu.
 *
 * Lê do banco em vez de reaproveitar o retorno do INSERT de propósito: assim
 * um apito que ficou para trás porque a fila estava fora do ar sai no ciclo
 * seguinte, sem depender de o processo que o gravou continuar vivo.
 *
 * A marcação acontece DEPOIS do envio. Se o processo morrer entre os dois, o
 * próximo ciclo reenvia — e a `idempotencyKey` da fila absorve a repetição.
 * O erro seguro aqui é reenviar, nunca perder.
 */
async function drenarOutbox(
  db: Db,
  ruleset: Ruleset,
  fila: PortaFila,
  jogoId: string,
  agora: Date,
): Promise<MensagemPush[]> {
  const [apitosPendentes, greensPendentes] = await Promise.all([
    db
      .select()
      .from(apitos)
      .where(
        and(
          eq(apitos.jogoId, jogoId),
          eq(apitos.estrategia, 'FIRE_LIVE'),
          isNull(apitos.pushEnfileiradoEm),
        ),
      ),
    db
      .select()
      .from(greens)
      .where(and(eq(greens.jogoId, jogoId), isNull(greens.pushEnfileiradoEm))),
  ])

  if (apitosPendentes.length === 0 && greensPendentes.length === 0) return []

  const exibicao = await dadosDeExibicao(db, [
    ...apitosPendentes.map((a) => a.jogadorId),
    ...greensPendentes.map((g) => g.jogadorId),
  ])

  const apitoSemAlvo = apitosPendentes.find((apito) => apito.alvo1q === null)
  if (apitoSemAlvo) {
    throw new Error(`apito Fire Live ${apitoSemAlvo.id} sem alvo do primeiro quarto`)
  }

  // Atributo de demonstração NÃO vira push. As tabelas de confiança e odds de
  // rebotes e assistências são nossas, não do CJ (`origem: demonstracao` no
  // ruleset), e o push é o único canal que não tem onde carregar esse aviso:
  // chega no celular do assinante sem moldura, sem tela, sem rodapé.
  // A tela pode mostrar com ressalva; o push, não.
  const apitosParaPush = apitosPendentes.filter(
    (apito) => origemDoAtributo(apito.atributo, ruleset) === 'homologado',
  )

  const mensagens: MensagemPush[] = [
    ...apitosParaPush.map((a) =>
      mensagemDeApito(
        {
          chaveDeduplicacao: montarChave(a.jogoId, a.jogadorId, a.atributo, 'FIRE_LIVE', null),
          jogoId: a.jogoId,
          jogadorId: a.jogadorId,
          atributo: a.atributo,
          estrategia: 'FIRE_LIVE',
          metodo: null,
          nivelJogador: a.nivelJogador,
          nivelApito: 1,
          turbo: a.turbo,
          modoFire: a.modoFire,
          opdOrigemNivel: (a.opdOrigemNivel ?? null) as Apito['opdOrigemNivel'],
          linha: null,
          confianca: null,
          alvo1Q: a.alvo1q!,
        },
        exibicao(a.jogadorId),
        a.geradoEm,
      ),
    ),
    ...greensPendentes.map((g) =>
      mensagemDeGreen(
        {
          jogoId: g.jogoId,
          jogadorId: g.jogadorId,
          atributo: g.atributo,
          nivelJogador: g.nivelJogador as Nivel,
          marco: g.marco,
          valor: g.valor,
        },
        exibicao(g.jogadorId),
        g.detectadoEm,
      ),
    ),
  ]

  // Envia ANTES de marcar. A ordem inversa perderia push se o processo caísse
  // entre a marcação e o envio.
  await fila.enfileirar(mensagens)

  await Promise.all([
    apitosPendentes.length > 0
      ? db
          .update(apitos)
          .set({ pushEnfileiradoEm: agora })
          .where(
            inArray(
              apitos.id,
              apitosPendentes.map((a) => a.id),
            ),
          )
      : Promise.resolve(),
    greensPendentes.length > 0
      ? db
          .update(greens)
          .set({ pushEnfileiradoEm: agora })
          .where(
            inArray(
              greens.id,
              greensPendentes.map((g) => g.id),
            ),
          )
      : Promise.resolve(),
  ])

  return mensagens
}

/** Nome e sigla do time, para o corpo do push. */
async function dadosDeExibicao(
  db: Db,
  idsJogador: string[],
): Promise<(jogadorId: string) => { nome: string; timeSigla: string }> {
  const ids = [...new Set(idsJogador)]
  if (ids.length === 0) return (id) => ({ nome: id, timeSigla: '—' })

  const [elenco, listaTimes] = await Promise.all([
    db.select().from(jogadores).where(inArray(jogadores.id, ids)),
    db.select().from(times),
  ])

  const nomePorId = new Map(elenco.map((j) => [j.id, j.nomeCompleto] as const))
  const siglaPorTime = new Map(listaTimes.map((t) => [t.id, t.sigla] as const))
  const timeDoJogador = new Map(elenco.map((j) => [j.id, j.timeId] as const))

  return (jogadorId) => ({
    nome: nomePorId.get(jogadorId) ?? jogadorId,
    timeSigla: siglaPorTime.get(timeDoJogador.get(jogadorId) ?? '') ?? '—',
  })
}

/** Persiste o estado do loop, para observabilidade e para o próximo ciclo. */
export async function registrarCiclo(
  db: Db,
  jogoId: string,
  estado: EstadoObservado,
  ciclos: number,
): Promise<void> {
  await db
    .update(fireLiveExecucoes)
    .set({ ultimoEstado: estado, ciclos, atualizadoEm: new Date() })
    .where(eq(fireLiveExecucoes.jogoId, jogoId))
}

export async function encerrarExecucao(
  db: Db,
  jogoId: string,
  motivo: MotivoEncerramento,
  agora: Date,
): Promise<void> {
  await db
    .update(fireLiveExecucoes)
    .set({
      estado: 'ENCERRADA',
      encerradoEm: agora,
      motivoEncerramento: motivo,
      leaseExpiraEm: null,
      atualizadoEm: agora,
    })
    .where(eq(fireLiveExecucoes.jogoId, jogoId))
}
