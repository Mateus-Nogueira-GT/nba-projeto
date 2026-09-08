import { readFile } from 'node:fs/promises'

import { jogadores, mapaJogadores, niveis, times } from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import { ativarVersaoNiveis } from '../../dominio/repositorios/niveis'
import { ATRIBUTOS } from '../../motor/tipos'
import { importarListaDeNiveis } from '../niveis/importar'
import { lerListaDeNiveis } from '../niveis/parser'
import type { ResultadoParse } from '../niveis/parser'
import { niveisDoJogador, nomeDeExibicao, posicaoDe } from './dados'

export const ARQUIVO_LISTA = 'data/fontes/introducao-ia-nba.md'
export const PROVEDOR_DEMO = 'demo'

/**
 * A CHAVE é o nome do CJ em caixa baixa, não o nome gravado. `nomeCompleto`
 * recebe a versão de exibição ("Stephen Curry"), então casar por igualdade
 * exata faria a REEXECUÇÃO inserir todo mundo de novo — o seed precisa ser
 * idempotente (o cron diário o reexecuta).
 */
export const chaveDeNome = (nome: string): string => nome.toLowerCase()

export type Cadastro = {
  analise: ResultadoParse
  /** sigla → times.id */
  timePorSigla: Map<string, string>
  /** chaveDeNome(nomeNaLista) → jogadores.id */
  jogadorPorChave: Map<string, string>
  versaoNiveis: string
}

/**
 * TIMES, JOGADORES, VÍNCULO E NÍVEIS — a parte do seed que os DOIS seeders
 * (a fixture roteirizada e a temporada simulada) compartilham.
 *
 * Idempotente: reexecutar não insere ninguém de novo.
 */
export async function semearCadastro(db: Db, agora: Date): Promise<Cadastro> {
  const conteudo = await readFile(ARQUIVO_LISTA, 'utf8')
  const analise = lerListaDeNiveis(conteudo)

  // 1 · Times e jogadores canônicos. Na demo, a lista do CJ é a autoridade
  //     sobre quem existe — e o vínculo é confirmado aqui, no lugar da
  //     curadoria humana que a produção exige.
  const siglas = [...new Set(analise.jogadores.map((j) => j.timeSigla).filter((s): s is string => s !== null))]
  for (const sigla of siglas) {
    const nome = analise.jogadores.find((j) => j.timeSigla === sigla)?.timeNaLista ?? sigla
    await db.insert(times).values({ sigla, nome }).onConflictDoNothing({ target: times.sigla })
  }
  const timePorSigla = new Map((await db.select().from(times)).map((t) => [t.sigla, t.id] as const))

  const jaExistentes = new Map(
    (await db.select().from(jogadores)).map((j) => [chaveDeNome(j.nomeCompleto), j.id] as const),
  )
  for (const j of analise.jogadores) {
    if (jaExistentes.has(chaveDeNome(j.nomeNaLista))) continue
    const timeId = j.timeSigla ? timePorSigla.get(j.timeSigla) : undefined
    const [novo] = await db
      .insert(jogadores)
      .values({
        nomeCompleto: nomeDeExibicao(j.nomeNaLista),
        // ATENÇÃO: jogadores.time_id é o time REAL do provedor e alimenta a aba
        // de estatísticas. Na demo não há provedor, então espelha a lista.
        timeId: timeId ?? null,
        posicao: posicaoDe(j.nomeNaLista),
      })
      .returning()
    if (novo) jaExistentes.set(chaveDeNome(j.nomeNaLista), novo.id)
  }

  for (const j of analise.jogadores) {
    const jogadorId = jaExistentes.get(chaveDeNome(j.nomeNaLista))
    if (!jogadorId) continue
    await db
      .insert(mapaJogadores)
      .values({
        nomeNaLista: j.nomeNaLista,
        provedor: PROVEDOR_DEMO,
        jogadorId,
        confirmadoPor: 'demo-seed',
        confirmadoEm: agora,
      })
      .onConflictDoUpdate({
        target: [mapaJogadores.nomeNaLista, mapaJogadores.provedor],
        set: { jogadorId, confirmadoPor: 'demo-seed', confirmadoEm: agora },
      })
  }

  const relatorio = await importarListaDeNiveis(db, conteudo, {
    provedor: PROVEDOR_DEMO,
    origemArquivo: ARQUIVO_LISTA,
    importadoPor: 'demo-seed',
  })
  await ativarVersaoNiveis(db, relatorio.versaoId)

  // 1b · REBOTES e ASSISTÊNCIAS. O importador só sabe classificar PONTOS,
  //      porque é o único atributo que o CJ enviou. Estas linhas são
  //      INVENTADAS e entram na MESMA versão de níveis — o motor as trata
  //      exatamente como trataria a lista real, sem saber a diferença.
  //      Quando as listas verdadeiras chegarem, elas vêm pelo importador e
  //      este bloco desaparece.
  const niveisDerivados: (typeof niveis.$inferInsert)[] = []
  for (const j of analise.jogadores) {
    const jogadorId = jaExistentes.get(chaveDeNome(j.nomeNaLista))
    const timeId = j.timeSigla ? timePorSigla.get(j.timeSigla) : undefined
    if (!jogadorId || !timeId) continue

    const derivados = niveisDoJogador(j.nomeNaLista, j.nivel)
    for (const atributo of ATRIBUTOS) {
      if (atributo === 'PONTOS') continue
      niveisDerivados.push({
        niveisVersaoId: relatorio.versaoId,
        jogadorId,
        timeId,
        atributo,
        nivel: derivados[atributo],
        posicaoHierarquia: j.posicaoHierarquia,
      })
    }
  }
  if (niveisDerivados.length > 0) {
    await db.insert(niveis).values(niveisDerivados).onConflictDoNothing()
  }

  return {
    analise,
    timePorSigla,
    jogadorPorChave: jaExistentes,
    versaoNiveis: relatorio.versao,
  }
}
