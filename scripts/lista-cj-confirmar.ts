import { readFileSync } from 'node:fs'

import { and, eq } from 'drizzle-orm'

import { fecharDb, getDb } from '../src/modules/dominio/db/cliente'
import { identidadesJogador } from '../src/modules/dominio/db/schema'
import { confirmarMapeamento } from '../src/modules/ingestao/niveis/importar'
import { lerPlanilha } from '../src/modules/ingestao/niveis/planilha'

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

async function principal() {
  const planilha = argumento('planilha')
  const por = argumento('por')
  if (!planilha || !por) throw new Error('--planilha=<csv> e --por=<quem revisou> são obrigatórios')

  const db = getDb()
  // Separador decidido pelo cabeçalho (`,` ou `;`); linha torta vira problema.
  const lida = lerPlanilha(readFileSync(planilha, 'utf8'))
  let ligados = 0
  const problemas: string[] = lida.problemas.map(
    (p) => `linha ${p.linhaNoArquivo}: ${p.motivo} — corrija e rode de novo`,
  )

  for (const { linhaNoArquivo, campos: l } of lida.linhas) {
    if (!/^(sim|s|x|ok)$/i.test(l.confirmar ?? '')) continue
    const nomeNaLista = l.nome_na_lista ?? ''
    const idExterno = l.id_escolhido || l.id_sugerido
    if (!nomeNaLista || !idExterno) {
      problemas.push(`linha ${linhaNoArquivo} ${nomeNaLista || '(sem nome)'}: sem id para ligar`)
      continue
    }
    const [identidade] = await db
      .select({ jogadorId: identidadesJogador.jogadorId })
      .from(identidadesJogador)
      .where(and(eq(identidadesJogador.provedor, PROVEDOR), eq(identidadesJogador.idExterno, idExterno)))
      .limit(1)
    if (!identidade) {
      problemas.push(`linha ${linhaNoArquivo} ${nomeNaLista}: id ${idExterno} não existe no banco`)
      continue
    }
    const alterados = await confirmarMapeamento(db, {
      nomeNaLista,
      provedor: PROVEDOR,
      jogadorId: identidade.jogadorId,
      provedorPlayerId: idExterno,
      score: l.id_escolhido ? 1 : Number(l.semelhanca || 0) / 100,
      confirmadoPor: por,
      agora: new Date(),
    })
    // Só conta o que o UPDATE realmente alterou: nome fora de mapa_jogadores
    // (grafia mexida na revisão, outro provedor) não liga nada.
    if (alterados === 0) {
      problemas.push(`linha ${linhaNoArquivo} ${nomeNaLista}: não está em mapa_jogadores (${PROVEDOR})`)
      continue
    }
    ligados += 1
  }

  console.log(`separador: "${lida.separador}" · ligados: ${ligados}`)
  for (const p of problemas) console.log(`  PROBLEMA ${p}`)
  console.log('agora rode lista-cj:restaurar de novo para gerar os níveis')
}

principal()
  .catch((erro: unknown) => {
    console.error(erro instanceof Error ? erro.message : erro)
    process.exitCode = 1
  })
  .finally(() => fecharDb())
