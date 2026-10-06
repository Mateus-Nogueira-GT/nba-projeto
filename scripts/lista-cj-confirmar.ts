import { readFileSync } from 'node:fs'

import { and, eq } from 'drizzle-orm'

import { fecharDb, getDb } from '../src/modules/dominio/db/cliente'
import { identidadesJogador } from '../src/modules/dominio/db/schema'
import { confirmarMapeamento } from '../src/modules/ingestao/niveis/importar'

/**
 * Aplica a planilha REVISADA por humano (`lista-cj:sugestoes`) — o mesmo
 * `confirmarMapeamento` do botão de /admin/mapeamento, linha a linha.
 *
 *   npx dotenv -e .env.local -- npm run lista-cj:confirmar -- --planilha=backups/revisao.csv --por=<email>
 *
 * Só liga a linha com `confirmar` = sim. `id_escolhido` preenchido vence o
 * `id_sugerido` (é como o revisor corrige uma sugestão errada). Linha sem
 * "sim" fica pendente. Depois: `lista-cj:restaurar` de novo.
 */
const PROVEDOR = process.env.NBA_PRIMARIO_NOME ?? 'balldontlie'

function argumento(nome: string): string | null {
  const prefixo = `--${nome}=`
  return process.argv.find((item) => item.startsWith(prefixo))?.slice(prefixo.length) ?? null
}

/** CSV simples com aspas — o formato que `lista-cj:sugestoes` escreve. */
function lerCsv(texto: string): Record<string, string>[] {
  const linhas: string[][] = []
  let campo = ''
  let linha: string[] = []
  let aspas = false
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]!
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') {
        campo += '"'
        i++
      } else if (c === '"') aspas = false
      else campo += c
    } else if (c === '"') aspas = true
    else if (c === ',' || c === ';') {
      linha.push(campo)
      campo = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++
      linha.push(campo)
      linhas.push(linha)
      linha = []
      campo = ''
    } else campo += c
  }
  if (campo !== '' || linha.length > 0) linhas.push([...linha, campo])
  const [cabecalho, ...corpo] = linhas.filter((l) => l.some((v) => v.trim() !== ''))
  if (!cabecalho) return []
  return corpo.map((l) => Object.fromEntries(cabecalho.map((nome, k) => [nome.trim(), (l[k] ?? '').trim()])))
}

async function principal() {
  const planilha = argumento('planilha')
  const por = argumento('por')
  if (!planilha || !por) throw new Error('--planilha=<csv> e --por=<quem revisou> são obrigatórios')

  const db = getDb()
  const linhas = lerCsv(readFileSync(planilha, 'utf8'))
  let ligados = 0
  const problemas: string[] = []

  for (const l of linhas) {
    if (!/^(sim|s|x|ok)$/i.test(l.confirmar ?? '')) continue
    const nomeNaLista = l.nome_na_lista ?? ''
    const idExterno = l.id_escolhido || l.id_sugerido
    if (!nomeNaLista || !idExterno) {
      problemas.push(`${nomeNaLista || '(sem nome)'}: sem id para ligar`)
      continue
    }
    const [identidade] = await db
      .select({ jogadorId: identidadesJogador.jogadorId })
      .from(identidadesJogador)
      .where(and(eq(identidadesJogador.provedor, PROVEDOR), eq(identidadesJogador.idExterno, idExterno)))
      .limit(1)
    if (!identidade) {
      problemas.push(`${nomeNaLista}: id ${idExterno} não existe no banco`)
      continue
    }
    await confirmarMapeamento(db, {
      nomeNaLista,
      provedor: PROVEDOR,
      jogadorId: identidade.jogadorId,
      provedorPlayerId: idExterno,
      score: l.id_escolhido ? 1 : Number(l.semelhanca || 0) / 100,
      confirmadoPor: por,
      agora: new Date(),
    })
    ligados += 1
  }

  console.log(`ligados: ${ligados}`)
  for (const p of problemas) console.log(`  PROBLEMA ${p}`)
  console.log('agora rode lista-cj:restaurar de novo para gerar os níveis')
}

principal()
  .catch((erro: unknown) => {
    console.error(erro instanceof Error ? erro.message : erro)
    process.exitCode = 1
  })
  .finally(() => fecharDb())
