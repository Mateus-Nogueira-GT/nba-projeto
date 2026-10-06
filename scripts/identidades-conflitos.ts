import { fecharDb, getDb } from '../src/modules/dominio/db/cliente'
import {
  listarConflitosPendentes,
  separarConflito,
  vincularConflito,
} from '../src/modules/ingestao/sincronizar/conflitos'

/**
 * Conflitos de identidade de jogador — listar e aplicar a decisão HUMANA.
 *
 *   npx dotenv -e .env.local -- npm run identidades:conflitos
 *   npx dotenv -e .env.local -- npm run identidades:conflitos -- --vincular=<id> --por=<nome>
 *   npx dotenv -e .env.local -- npm run identidades:conflitos -- --separar=<id> --por=<nome>
 *
 * vincular = é a mesma pessoa (id duplicado no provedor); separar = homônimo.
 * Sem argumento, só lista. Depois de resolver, retome o backfill com --resume.
 */
const PROVEDOR = process.env.NBA_PRIMARIO_NOME ?? 'balldontlie'

function argumento(nome: string): string | null {
  const prefixo = `--${nome}=`
  return process.argv.find((item) => item.startsWith(prefixo))?.slice(prefixo.length) ?? null
}

async function principal() {
  const db = getDb()
  const vincular = argumento('vincular')
  const separar = argumento('separar')
  if (vincular || separar) {
    const por = argumento('por')
    if (!por) throw new Error('--por=<quem decidiu> é obrigatório')
    const jogadorId = vincular
      ? await vincularConflito(db, PROVEDOR, vincular, por)
      : await separarConflito(db, PROVEDOR, separar!, por)
    console.log(`${vincular ? 'vinculado' : 'separado'}: ${vincular ?? separar} → ${jogadorId}`)
    return
  }

  const pendentes = await listarConflitosPendentes(db)
  console.log(JSON.stringify({ pendentes: pendentes.length, conflitos: pendentes }, null, 2))
}

principal()
  .catch((erro: unknown) => {
    console.error(erro instanceof Error ? erro.message : erro)
    process.exitCode = 1
  })
  .finally(() => fecharDb())
