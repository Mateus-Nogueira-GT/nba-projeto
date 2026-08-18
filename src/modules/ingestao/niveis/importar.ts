import { createHash } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'

import { mapaJogadores, niveis, niveisVersao, times } from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import { lerListaDeNiveis, type ProblemaDeParse } from './parser'

export type RelatorioImport = {
  versaoId: string
  versao: string
  jaExistia: boolean
  totalNaLista: number
  timesEncontrados: number
  timesSemSigla: string[]
  /** Nomes já ligados a um jogador: viraram linha em `niveis`. */
  casados: number
  /** Nomes SEM ligação. Ficam em mapa_jogadores com jogador_id NULL. */
  pendentes: string[]
  /** Linhas que pareciam entrada e não puderam ser lidas. */
  problemas: ProblemaDeParse[]
}

/**
 * Importa a lista de níveis do CJ para uma versão NOVA.
 *
 * Reexecutável de propósito: a lista é documento vivo — muda com o mercado,
 * não só por temporada (Schröder foi dispensado durante a elaboração).
 *
 * A versão é derivada do conteúdo. Reimportar o mesmo arquivo é NO-OP: devolve
 * a versão existente sem tocar em nada. Conteúdo diferente cria versão nova e
 * NUNCA sobrescreve a anterior — o histórico é o que permite o backtest.
 *
 * A versão nasce INATIVA. Ativar é ato separado e explícito
 * (`ativarVersaoNiveis`), porque ativar troca o que o motor enxerga.
 */
export async function importarListaDeNiveis(
  db: Db,
  conteudo: string,
  opcoes: { provedor: string; origemArquivo: string; importadoPor: string },
): Promise<RelatorioImport> {
  const analise = lerListaDeNiveis(conteudo)
  const hash = createHash('sha256').update(conteudo).digest('hex').slice(0, 12)
  const versao = `niveis-${hash}`

  const existente = await db
    .select()
    .from(niveisVersao)
    .where(eq(niveisVersao.versao, versao))
    .limit(1)

  if (existente[0]) {
    const pendentes = await nomesPendentes(db, opcoes.provedor)
    return {
      versaoId: existente[0].id,
      versao,
      jaExistia: true,
      totalNaLista: analise.jogadores.length,
      timesEncontrados: analise.timesEncontrados.length,
      timesSemSigla: analise.timesSemSigla,
      casados: await contarNiveis(db, existente[0].id),
      pendentes,
      problemas: analise.problemas,
    }
  }

  // 1 · Times. A lista é a autoridade sobre quais times existem no produto.
  const siglas = [...new Set(analise.jogadores.map((j) => j.timeSigla).filter((s) => s !== null))]
  for (const sigla of siglas) {
    const nome =
      analise.jogadores.find((j) => j.timeSigla === sigla)?.timeNaLista ?? sigla
    await db.insert(times).values({ sigla, nome }).onConflictDoNothing({ target: times.sigla })
  }
  const timesPorSigla = new Map(
    (await db.select().from(times)).map((t) => [t.sigla, t.id] as const),
  )

  // 2 · Toda entrada da lista ganha linha em mapa_jogadores, mesmo sem
  //     jogador ligado. É isso que impede um nome de sumir em silêncio:
  //     jogador_id NULL = pendente de confirmação humana.
  for (const j of analise.jogadores) {
    await db
      .insert(mapaJogadores)
      .values({ nomeNaLista: j.nomeNaLista, provedor: opcoes.provedor, jogadorId: null })
      .onConflictDoNothing({
        target: [mapaJogadores.nomeNaLista, mapaJogadores.provedor],
      })
  }

  const mapeados = new Map(
    (
      await db
        .select()
        .from(mapaJogadores)
        .where(eq(mapaJogadores.provedor, opcoes.provedor))
    ).map((m) => [m.nomeNaLista, m.jogadorId] as const),
  )

  // 3 · Versão nova, sempre inativa.
  const [versaoNova] = await db
    .insert(niveisVersao)
    .values({
      versao,
      origemArquivo: opcoes.origemArquivo,
      importadoPor: opcoes.importadoPor,
      ativa: false,
    })
    .returning()

  // 4 · Só entra em `niveis` quem já tem jogador confirmado — a FK exige.
  const pendentes: string[] = []
  const linhas: (typeof niveis.$inferInsert)[] = []

  for (const j of analise.jogadores) {
    const jogadorId = mapeados.get(j.nomeNaLista) ?? null
    const timeId = j.timeSigla ? timesPorSigla.get(j.timeSigla) : undefined

    if (jogadorId === null || timeId === undefined) {
      pendentes.push(j.nomeNaLista)
      continue
    }

    linhas.push({
      niveisVersaoId: versaoNova!.id,
      jogadorId,
      timeId,
      atributo: 'PONTOS',
      nivel: j.nivel,
      posicaoHierarquia: j.posicaoHierarquia,
    })
  }

  if (linhas.length > 0) {
    await db.insert(niveis).values(linhas).onConflictDoNothing()
  }

  return {
    versaoId: versaoNova!.id,
    versao,
    jaExistia: false,
    totalNaLista: analise.jogadores.length,
    timesEncontrados: analise.timesEncontrados.length,
    timesSemSigla: analise.timesSemSigla,
    casados: linhas.length,
    pendentes,
    problemas: analise.problemas,
  }
}

async function contarNiveis(db: Db, versaoId: string): Promise<number> {
  const linhas = await db.select().from(niveis).where(eq(niveis.niveisVersaoId, versaoId))
  return linhas.length
}

/** Nomes da lista ainda sem jogador confirmado — o que a tela de admin mostra. */
export async function nomesPendentes(db: Db, provedor: string): Promise<string[]> {
  const linhas = await db
    .select()
    .from(mapaJogadores)
    .where(and(eq(mapaJogadores.provedor, provedor), isNull(mapaJogadores.jogadorId)))
  return linhas.map((l) => l.nomeNaLista)
}

/** Confirmação HUMANA do vínculo. Só daqui sai `jogador_id` preenchido. */
export async function confirmarMapeamento(
  db: Db,
  opcoes: {
    nomeNaLista: string
    provedor: string
    jogadorId: string
    provedorPlayerId: string
    score: number
    confirmadoPor: string
    agora: Date
  },
): Promise<void> {
  await db
    .update(mapaJogadores)
    .set({
      jogadorId: opcoes.jogadorId,
      provedorPlayerId: opcoes.provedorPlayerId,
      scoreSimilaridade: String(opcoes.score),
      confirmadoPor: opcoes.confirmadoPor,
      confirmadoEm: opcoes.agora,
    })
    .where(
      and(
        eq(mapaJogadores.nomeNaLista, opcoes.nomeNaLista),
        eq(mapaJogadores.provedor, opcoes.provedor),
      ),
    )
}

/**
 * Completa uma versão já importada com os vínculos confirmados depois.
 *
 * Fluxo real: importa (parte fica pendente) → humano confirma na tela →
 * completa. Sem isso, o operador teria que reimportar do zero a cada
 * confirmação.
 */
export async function completarVersao(
  db: Db,
  versaoId: string,
  conteudo: string,
  provedor: string,
): Promise<{ adicionados: number; aindaPendentes: string[] }> {
  const analise = lerListaDeNiveis(conteudo)

  const jaGravados = new Set(
    (await db.select().from(niveis).where(eq(niveis.niveisVersaoId, versaoId))).map(
      (n) => n.jogadorId,
    ),
  )
  const mapeados = new Map(
    (await db.select().from(mapaJogadores).where(eq(mapaJogadores.provedor, provedor))).map(
      (m) => [m.nomeNaLista, m.jogadorId] as const,
    ),
  )
  const timesPorSigla = new Map(
    (await db.select().from(times)).map((t) => [t.sigla, t.id] as const),
  )

  const linhas: (typeof niveis.$inferInsert)[] = []
  const aindaPendentes: string[] = []

  for (const j of analise.jogadores) {
    const jogadorId = mapeados.get(j.nomeNaLista) ?? null
    const timeId = j.timeSigla ? timesPorSigla.get(j.timeSigla) : undefined

    if (jogadorId === null || timeId === undefined) {
      aindaPendentes.push(j.nomeNaLista)
      continue
    }
    if (jaGravados.has(jogadorId)) continue

    linhas.push({
      niveisVersaoId: versaoId,
      jogadorId,
      timeId,
      atributo: 'PONTOS',
      nivel: j.nivel,
      posicaoHierarquia: j.posicaoHierarquia,
    })
  }

  if (linhas.length > 0) {
    await db.insert(niveis).values(linhas).onConflictDoNothing()
  }

  return { adicionados: linhas.length, aindaPendentes }
}
