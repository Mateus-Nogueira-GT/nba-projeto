import { readFileSync, writeFileSync } from 'node:fs'

import { and, eq, isNull } from 'drizzle-orm'

import { fecharDb, getDb } from '../src/modules/dominio/db/cliente'
import {
  identidadesJogador,
  jogadores,
  mapaJogadores,
  times,
} from '../src/modules/dominio/db/schema'
import type { BackupListaCj } from '../src/modules/ingestao/niveis/backup'
import { sugerir } from '../src/modules/ingestao/niveis/similaridade'

/**
 * Planilha de REVISÃO dos nomes pendentes da lista do CJ — somente leitura.
 *
 *   npx dotenv -e .env.local -- npm run lista-cj:sugestoes -- --saida=backups/revisao.csv --backup=backups/lista-cj-<data>.json
 *
 * A mesma sugestão de /admin/mapeamento (`sugerir`), numa planilha só: o
 * parceiro revisa 300 nomes de uma vez em vez de 300 buscas na tela, e marca
 * `confirmar` (sim) ou escreve o id externo certo em `id_escolhido`. Nada é
 * ligado aqui — quem liga é `lista-cj:confirmar`, com a planilha revisada.
 */
const PROVEDOR = process.env.NBA_PRIMARIO_NOME ?? 'balldontlie'

function argumento(nome: string): string | null {
  const prefixo = `--${nome}=`
  return process.argv.find((item) => item.startsWith(prefixo))?.slice(prefixo.length) ?? null
}

function celula(valor: string | number | null | undefined): string {
  const texto = valor === null || valor === undefined ? '' : String(valor)
  return /[",;\n]/.test(texto) ? `"${texto.replaceAll('"', '""')}"` : texto
}

async function principal() {
  const saida = argumento('saida')
  if (!saida) throw new Error('--saida=<arquivo.csv> é obrigatório')
  const db = getDb()

  const pendentes = await db
    .select({ nomeNaLista: mapaJogadores.nomeNaLista })
    .from(mapaJogadores)
    .where(and(eq(mapaJogadores.provedor, PROVEDOR), isNull(mapaJogadores.jogadorId)))

  const elenco = await db
    .select({
      idExterno: identidadesJogador.idExterno,
      nomeCompleto: jogadores.nomeCompleto,
      ativo: jogadores.ativo,
      time: times.sigla,
    })
    .from(identidadesJogador)
    .innerJoin(jogadores, eq(jogadores.id, identidadesJogador.jogadorId))
    .leftJoin(times, eq(times.id, jogadores.timeId))
    .where(eq(identidadesJogador.provedor, PROVEDOR))
  const timePorId = new Map(elenco.map((j) => [j.idExterno, j.time] as const))

  // O time do CJ (projetado) ajuda o humano a reconhecer o jogador. Vem do
  // backup — antes de confirmar, `niveis` ainda está vazio. Versão ativa vence.
  const timeNaLista = new Map<string, string>()
  const arquivoBackup = argumento('backup')
  if (arquivoBackup) {
    const backup = JSON.parse(readFileSync(arquivoBackup, 'utf8')) as BackupListaCj
    const ordenadas = [...backup.versoes].sort((a, b) => Number(a.ativa) - Number(b.ativa))
    for (const v of ordenadas) for (const n of v.niveis) if (n.timeSigla && n.nomeNaLista) timeNaLista.set(n.nomeNaLista, n.timeSigla)
  }

  const candidatos = elenco.map((j) => ({
    idExterno: j.idExterno,
    nomeCompleto: j.nomeCompleto,
    timeSiglaProvedor: null,
    ativo: j.ativo,
  }))

  const cabecalho = [
    'nome_na_lista',
    'time_na_lista',
    'situacao',
    'sugestao',
    'time_real',
    'semelhanca',
    'id_sugerido',
    'alternativas',
    'confirmar',
    'id_escolhido',
  ]
  const linhas = pendentes
    .map(({ nomeNaLista }) => {
      const s = sugerir(nomeNaLista, candidatos)
      // Desempate pelo time: entre os candidatos por nome, o que joga no time
      // em que o CJ o pôs sobe para o topo ("Brendon miller" do CHA é o
      // Brandon Miller do CHA, não o Leonard Miller do CHI). Só ordena a
      // SUGESTÃO — os elencos do CJ são projetados e quem decide é o humano.
      const time = timeNaLista.get(nomeNaLista)
      const doTime = s.candidatos.find((c) => time && timePorId.get(c.idExterno) === time)
      const ordenados = doTime ? [doTime, ...s.candidatos.filter((c) => c !== doTime)] : s.candidatos
      const [melhor, ...resto] = ordenados
      const situacao = !melhor
        ? 'SEM_CANDIDATO'
        : doTime
          ? 'MESMO_TIME'
          : s.inequivoco
            ? 'INEQUIVOCO'
            : 'AMBIGUO'
      return {
        situacao,
        celulas: [
          nomeNaLista,
          timeNaLista.get(nomeNaLista) ?? '',
          situacao,
          melhor?.nomeCompleto ?? '',
          melhor ? (timePorId.get(melhor.idExterno) ?? '') : '',
          melhor ? Math.round(melhor.score * 100) : '',
          melhor?.idExterno ?? '',
          resto
            .map((c) => `${c.nomeCompleto} (${timePorId.get(c.idExterno) ?? '?'}, id ${c.idExterno})`)
            .join(' | '),
          '',
          '',
        ],
      }
    })
    .sort((a, b) => a.situacao.localeCompare(b.situacao))

  writeFileSync(
    saida,
    [cabecalho, ...linhas.map((l) => l.celulas)].map((l) => l.map(celula).join(',')).join('\n') + '\n',
  )
  const contagem = linhas.reduce<Record<string, number>>((acc, l) => {
    acc[l.situacao] = (acc[l.situacao] ?? 0) + 1
    return acc
  }, {})
  console.log(JSON.stringify({ arquivo: saida, total: linhas.length, ...contagem }))
}

principal()
  .catch((erro: unknown) => {
    console.error(erro instanceof Error ? erro.message : erro)
    process.exitCode = 1
  })
  .finally(() => fecharDb())
