import { readFile } from 'node:fs/promises'
import { eq, sql } from 'drizzle-orm'

import { jogadores, mapaJogadores, niveis, times } from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import { conferenciaDe } from '../../dominio/conferencias'
import { identidadeNbaPorAlias } from '../../dominio/identidades-nba'
import { ativarVersaoNiveis } from '../../dominio/repositorios/niveis'
import { normalizarTexto } from '../../dominio/texto'
import { ATRIBUTOS } from '../../motor/tipos'
import { importarListaDeNiveis } from '../niveis/importar'
import { lerListaDeNiveis } from '../niveis/parser'
import type { ResultadoParse } from '../niveis/parser'
import { niveisDoJogador, nomeDeExibicao, posicaoDe } from './dados'

export const ARQUIVO_LISTA = 'data/fontes/introducao-ia-nba.md'
export const PROVEDOR_DEMO = 'demo'

/**
 * A CHAVE é o nome do CJ normalizado (sem acento, sem caixa, pontuação
 * solta) — a mesma régua de `dominio/texto.ts` que já casa "Doncic" com
 * "doncick" na busca e resolve aliases curados em `identidades-nba.ts`.
 * Duas grafias do MESMO nome (acento ou caixa) precisam cair no mesmo
 * UUID: "Ja morant" e "Já morant" são uma pessoa só, e um `toLowerCase()`
 * puro as separava — daí o card e o mapa de fotos enxergarem dois
 * jogadores onde o CJ só quis dizer um. `nomeCompleto` recebe o nome
 * oficial quando curado; reexecuções resolvem o UUID pelo vínculo
 * confirmado em mapa_jogadores, nunca pelo nome de apresentação.
 */
export const chaveDeNome = (nome: string): string => normalizarTexto(nome)

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
  return db.transaction(async (tx) => {
    // Cadastro + aliases são atômicos; dois seeds não criam o mesmo UUID duas vezes.
    await tx.execute(sql`LOCK TABLE ${jogadores} IN SHARE ROW EXCLUSIVE MODE`)
    return cadastrar(tx, conteudo, agora)
  })
}

async function cadastrar(db: Db, conteudo: string, agora: Date): Promise<Cadastro> {
  const analise = lerListaDeNiveis(conteudo)

  // 1 · Times e jogadores canônicos. Na demo, a lista do CJ é a autoridade
  //     sobre quem existe — e o vínculo é confirmado aqui, no lugar da
  //     curadoria humana que a produção exige.
  const siglas = [
    ...new Set(analise.jogadores.map((j) => j.timeSigla).filter((s): s is string => s !== null)),
  ]
  for (const sigla of siglas) {
    const nome = analise.jogadores.find((j) => j.timeSigla === sigla)?.timeNaLista ?? sigla
    await db
      .insert(times)
      .values({ sigla, nome, conferencia: conferenciaDe(sigla) })
      .onConflictDoUpdate({ target: times.sigla, set: { conferencia: conferenciaDe(sigla) } })
  }
  const timePorSigla = new Map((await db.select().from(times)).map((t) => [t.sigla, t.id] as const))

  const canonicos = await db.select().from(jogadores)
  const vinculos = await db
    .select()
    .from(mapaJogadores)
    .where(eq(mapaJogadores.provedor, PROVEDOR_DEMO))
  const jaExistentes = new Map<string, string>()
  for (const vinculo of vinculos) {
    if (vinculo.jogadorId === null) continue
    if (!vinculo.confirmadoEm || !vinculo.confirmadoPor) {
      throw new Error(`Vínculo demo sem confirmação: ${vinculo.nomeNaLista}`)
    }
    const chave = chaveDeNome(vinculo.nomeNaLista)
    const anterior = jaExistentes.get(chave)
    if (anterior !== undefined && anterior !== vinculo.jogadorId) {
      throw new Error(`Aliases demo divergentes: ${vinculo.nomeNaLista}`)
    }
    jaExistentes.set(chave, vinculo.jogadorId)
  }
  // Duas grafias que a CURADORIA resolve na mesma pessoa são um jogador só.
  // O documento escreve "Cooper Fllag" na lista de pontos e "Cooper Flagg" nas
  // de rebotes e assistências, e `identidades-nba.ts` dá o mesmo personId às
  // duas. Sem esta memória nascem dois canônicos com o MESMO nome na tela — e,
  // no dia em que os dois apitam, dois cards do mesmo humano lado a lado.
  //
  // O que não autorizava fundir continua não autorizando: a chave é o
  // personId da curadoria, não a semelhança de nome. "Wiggins" (Andrew em
  // Miami, Aaron em Atlanta) tem personId nulo na tabela e segue separado.
  const porPersonIdCriado = new Map<number, string>()
  for (const j of analise.jogadores) {
    if (jaExistentes.has(chaveDeNome(j.nomeNaLista))) continue
    const curada = identidadeNbaPorAlias(j.nomeNaLista)
    const nomeOficial = curada?.nomeOficial ?? nomeDeExibicao(j.nomeNaLista)

    const mesmaPessoa = curada?.personId == null ? undefined : porPersonIdCriado.get(curada.personId)
    if (mesmaPessoa !== undefined) {
      jaExistentes.set(chaveDeNome(j.nomeNaLista), mesmaPessoa)
      continue
    }

    // Nome igual sem vínculo não autoriza fundir canônicos ou duplicar o cadastro.
    if (
      canonicos.some((c) =>
        [j.nomeNaLista, nomeOficial].some((n) => chaveDeNome(n) === chaveDeNome(c.nomeCompleto)),
      )
    ) {
      throw new Error(`Cadastro sem vínculo confirmado exige reconciliação: ${j.nomeNaLista}`)
    }
    const timeId = j.timeSigla ? timePorSigla.get(j.timeSigla) : undefined
    const [novo] = await db
      .insert(jogadores)
      .values({
        nomeCompleto: nomeOficial,
        // ATENÇÃO: jogadores.time_id é o time REAL do provedor e alimenta a aba
        // de estatísticas. Na demo não há provedor, então espelha a lista.
        timeId: timeId ?? null,
        posicao: posicaoDe(j.nomeNaLista),
      })
      .returning()
    if (novo) {
      jaExistentes.set(chaveDeNome(j.nomeNaLista), novo.id)
      if (curada?.personId != null) porPersonIdCriado.set(curada.personId, novo.id)
    }
  }

  for (const j of analise.jogadores) {
    const jogadorId = jaExistentes.get(chaveDeNome(j.nomeNaLista))
    if (!jogadorId) continue
    const existente = vinculos.find((v) => v.nomeNaLista === j.nomeNaLista)
    if (existente?.jogadorId) continue
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

  // 1b · REBOTES e ASSISTÊNCIAS — só o que a lista do CJ NÃO cobre.
  //
  //      O documento de 21/09 já traz as duas listas e o importador as grava
  //      (118 jogadores em rebotes, 57 em assistências). Mas a de pontos tem
  //      234: os demais ficariam sem nível nos outros dois atributos, e a demo
  //      precisa de elenco cheio para ter o que mostrar. Estas linhas são
  //      INVENTADAS e entram na MESMA versão de níveis, com
  //      `onConflictDoNothing` — a chave única é (versão, jogador, atributo),
  //      então quem já veio da lista real fica com o nível DELE; a derivação
  //      só preenche buraco.
  //
  //      ⚠️  `semear.ts` e `ao-vivo.ts` ainda calculam com a derivação para
  //      TODO MUNDO (`niveisDoJogador`), inclusive para quem tem nível real
  //      gravado aqui. Nos dois atributos, o nível que a demo usa pode não ser
  //      o que a tabela guarda — ex.: Shai é "All star" na lista de
  //      assistências do CJ e MVP na derivação. Enquanto
  //      `niveis.atributos: [PONTOS]` isso não sai do seed.
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
