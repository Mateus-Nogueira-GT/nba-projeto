import { createHash } from 'node:crypto'
import { and, eq, inArray } from 'drizzle-orm'

import {
  apitos,
  estatisticasQuarto,
  feedSnapshot,
  jogadores,
  jogos,
  times,
} from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import { identidadesDeApresentacao } from '../../dominio/identidade-apresentacao'
import type { Ruleset } from '../../motor/ruleset/schema'
import type { Atributo, NivelApito } from '../../motor/tipos'
import { montarChave } from '../../motor/tipos'
import type { ItemFeed } from '../lista-secreta'
import type { MatchupDoItem } from '../tipos-feed'
import { calculadoraDeMatchup, type MatchupDoDia } from '../matchup'

/**
 * Os perfis do matchup por (data, temporada), entre ciclos. O feed ao vivo é
 * materializado a cada ~20 s por jogo, e os perfis só mudam quando um jogo
 * ANTERIOR à data encerra: refazer a varredura da temporada a cada ciclo seria
 * pagar a mesma conta centenas de vezes por noite. Um banco por chave fraca
 * (os testes abrem vários) e validade de uma hora contada pelo `agora` do
 * ciclo — a mesma janela do cache do painel (`app/_cache/matchup.ts`).
 */
const VALIDADE_MATCHUP_MS = 60 * 60 * 1000
const memoMatchup = new WeakMap<Db, { desde: number; memo: Map<string, Promise<MatchupDoDia>> }>()

function memoDoMatchup(db: Db, agora: Date): Map<string, Promise<MatchupDoDia>> {
  const atual = memoMatchup.get(db)
  if (atual && agora.getTime() - atual.desde < VALIDADE_MATCHUP_MS) return atual.memo
  const novo = { desde: agora.getTime(), memo: new Map<string, Promise<MatchupDoDia>>() }
  memoMatchup.set(db, novo)
  return novo.memo
}

/**
 * Item do feed ao vivo. O apito é o REGISTRO do momento em que a marca foi
 * cruzada (congelado pela UNIQUE); `valorNoQuarto` é o progresso vivo contra
 * o alvo — é ele que muda a cada ciclo.
 */
export type ItemFireLive = ItemFeed & {
  adversarioSigla: string
  quartoAtual: number | null
  /** O 1Q acabou. O item permanece até o fim do jogo, marcado. (G2 — proposta enviada ao CJ) */
  encerrado: boolean
  valorNoQuarto: number
  /** Instante em que a marca foi cruzada (geradoEm do apito). ISO. */
  apitadoEm: string
}

export type ConteudoFeedFireLive = {
  dataReferencia: string
  geradoEm: string
  rulesetVersao: string
  jogoId: string
  itens: ItemFireLive[]
}

function hashDe(conteudo: ConteudoFeedFireLive): string {
  // geradoEm fica FORA do hash, como na Lista Secreta: senão toda execução
  // pareceria mudança. Ele mora em `conteudo.geradoEm`, fora do item, então
  // hashear os ITENS INTEIROS já o exclui — e é o que se faz aqui, pelo mesmo
  // motivo da Lista Secreta: a tupla escolhida a dedo deixava `fotoUrl` de
  // fora, e todo campo novo entrava mudo.
  //
  // `apitadoEm` fica DENTRO e não gera regravação à toa: é o `geradoEm` do
  // apito, fixo depois de gravado — não o instante desta materialização.
  // `valorNoQuarto` e `encerrado` seguem dentro; são o que a tela ao vivo
  // existe para mostrar.
  const estavel = JSON.stringify(conteudo.itens)
  return createHash('sha256').update(estavel).digest('hex').slice(0, 16)
}

/**
 * Materializa o snapshot do Fire Live — POR JOGO (spec 05).
 *
 * Chamado pelo ciclo, na mesma passagem que gravou os apitos: a tela lê este
 * snapshot, nunca o motor (regra `tela-nao-chama-o-motor`). Snapshot vazio
 * também é informação: "observando, ninguém cruzou alvo ainda".
 *
 * A escrita é pulada quando o hash não muda — a mesma proteção da Lista
 * Secreta contra regravar o idêntico a cada 20 segundos.
 */
export async function materializarFeedFireLive(
  db: Db,
  ruleset: Ruleset,
  jogoId: string,
  agora: Date,
): Promise<{ mudou: boolean; itens: number } | null> {
  const [partida] = await db.select().from(jogos).where(eq(jogos.id, jogoId)).limit(1)
  if (!partida) return null

  const quartoFireLive = ruleset.fire_live.quarto
  const encerrado = partida.quartoAtual !== quartoFireLive

  const linhasApito = await db
    .select()
    .from(apitos)
    .where(and(eq(apitos.jogoId, jogoId), eq(apitos.estrategia, 'FIRE_LIVE')))

  const idsJogador = [...new Set(linhasApito.map((a) => a.jogadorId))]
  const [elenco, listaTimes, estatisticas, identidades] = await Promise.all([
    idsJogador.length > 0
      ? db.select().from(jogadores).where(inArray(jogadores.id, idsJogador))
      : Promise.resolve([]),
    db
      .select()
      .from(times)
      .where(inArray(times.id, [partida.timeCasaId, partida.timeVisitanteId])),
    idsJogador.length > 0
      ? db
          .select()
          .from(estatisticasQuarto)
          .where(
            and(
              eq(estatisticasQuarto.jogoId, jogoId),
              eq(estatisticasQuarto.quarto, quartoFireLive),
            ),
          )
      : Promise.resolve([]),
    identidadesDeApresentacao(db, idsJogador),
  ])

  const jogadorPorId = new Map(elenco.map((j) => [j.id, j] as const))
  const timePorId = new Map(listaTimes.map((t) => [t.id, t] as const))
  const valorPorJogador = new Map(
    estatisticas.map((e) => [
      e.jogadorId,
      { PONTOS: e.pontos, REBOTES: e.rebotes, ASSISTENCIAS: e.assistencias } as Record<
        Atributo,
        number
      >,
    ]),
  )

  // MATCHUP EM ESTRELAS (CJ, 09/10): o adversário é o MESMO `adversarioSigla`
  // do item — o Fire Live lê o elenco canônico, e as estrelas seguem o lado
  // que o card mostra. Só se calcula quando há apito.
  //
  // Falha ao ler o matchup NÃO derruba o ciclo (pente fino de 09/10, achado 3):
  // o snapshot ao vivo é o que a tela mostra, e congelá-lo por uma estrela é
  // trocar o principal pelo acessório. Todos os itens do ciclo vão com
  // `matchup: null` e o próximo ciclo tenta de novo (a falha não fica no memo).
  const adversarioDe = (jogadorId: string): string => {
    const jogador = jogadorPorId.get(jogadorId)
    const adversarioId =
      jogador?.timeId === partida.timeCasaId ? partida.timeVisitanteId : partida.timeCasaId
    return timePorId.get(adversarioId)?.sigla ?? '—'
  }
  const matchupPorApito = new Map<string, MatchupDoItem | null>()
  if (linhasApito.length > 0) {
    const calcularMatchup = calculadoraDeMatchup(db, ruleset, memoDoMatchup(db, agora))
    try {
      const calculados = await Promise.all(
        linhasApito.map(async (a) => {
          const adversarioSigla = adversarioDe(a.jogadorId)
          return adversarioSigla !== '—'
            ? await calcularMatchup(partida, adversarioSigla, a.atributo)
            : null
        }),
      )
      linhasApito.forEach((a, i) => matchupPorApito.set(a.id, calculados[i] ?? null))
    } catch (erro) {
      matchupPorApito.clear()
      console.error(
        JSON.stringify({
          evento: 'matchup_indisponivel',
          jogoId,
          dataReferencia: partida.dataReferencia,
          erro: String(erro),
        }),
      )
    }
  }

  const itens: ItemFireLive[] = await Promise.all(
    linhasApito.map(async (a) => {
      const jogador = jogadorPorId.get(a.jogadorId)
      const time = jogador?.timeId ? timePorId.get(jogador.timeId) : undefined
      const adversarioSigla = adversarioDe(a.jogadorId)
      return {
        chave: montarChave(a.jogoId, a.jogadorId, a.atributo, 'FIRE_LIVE', null),
        jogoId: a.jogoId,
        jogadorId: a.jogadorId,
        nome: identidades.get(a.jogadorId)?.nome ?? jogador?.nomeCompleto ?? a.jogadorId,
        timeSigla: time?.sigla ?? '—',
        timeNome: time?.nome ?? '—',
        fotoUrl: jogador?.fotoUrl ?? null,
        // O card do Fire Live usa a BarraAlvo na zona 2, não as barrinhas — e o
        // rodapé quente mostra alvo, não média/odd. Os campos existem no tipo
        // (ItemFireLive herda ItemFeed) e viajam vazios de propósito.
        ultimos5: [],
        mediaTemporada: null,
        oddFaixa: null,
        atributo: a.atributo,
        nivelJogador: a.nivelJogador,
        nivelApito: a.nivelApito as NivelApito,
        turbo: a.turbo,
        modoFire: a.modoFire,
        opdOrigemNivel: (a.opdOrigemNivel ?? null) as ItemFeed['opdOrigemNivel'],
        linha: null,
        confianca: null, // Fire Live não tem nota — e o card não inventa número
        // Sem nota não há faixa: a pílula sai neutra, e isso é a REGRA do
        // produto (confiança é conceito pré-live), não dado faltando.
        grauConfianca: null,
        alvo1Q: a.alvo1q,
        // O Fire Live é estratégia própria: não nasce de oscilação nem de OPD.
        metodo: null,
        posicao: jogador?.posicao ?? null,
        matchup: matchupPorApito.get(a.id) ?? null,
        adversarioSigla,
        quartoAtual: partida.quartoAtual,
        encerrado,
        valorNoQuarto: valorPorJogador.get(a.jogadorId)?.[a.atributo] ?? 0,
        apitadoEm: a.geradoEm.toISOString(),
      }
    }),
  )
  // Ordem estável pela chave: snapshot determinístico independente do banco.
  itens.sort((a, b) => a.chave.localeCompare(b.chave))

  const conteudo: ConteudoFeedFireLive = {
    dataReferencia: partida.dataReferencia,
    geradoEm: agora.toISOString(),
    rulesetVersao: `v${ruleset.version}`,
    jogoId,
    itens,
  }
  const hash = hashDe(conteudo)

  const [existente] = await db
    .select({ hash: feedSnapshot.hash })
    .from(feedSnapshot)
    .where(
      and(
        eq(feedSnapshot.dataReferencia, partida.dataReferencia),
        eq(feedSnapshot.estrategia, 'FIRE_LIVE'),
        eq(feedSnapshot.jogoId, jogoId),
      ),
    )
    .limit(1)

  const mudou = existente?.hash !== hash
  if (mudou) {
    await db
      .insert(feedSnapshot)
      .values({
        dataReferencia: partida.dataReferencia,
        estrategia: 'FIRE_LIVE',
        jogoId,
        conteudoJson: conteudo,
        geradoEm: agora,
        hash,
      })
      .onConflictDoUpdate({
        target: [feedSnapshot.dataReferencia, feedSnapshot.estrategia, feedSnapshot.jogoId],
        set: { conteudoJson: conteudo, geradoEm: agora, hash },
      })
  }

  return { mudou, itens: itens.length }
}
