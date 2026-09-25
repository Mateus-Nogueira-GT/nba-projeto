import { readFileSync } from 'node:fs'

import { fecharDb, getDb } from '../src/modules/dominio/db/cliente'
import { restaurarListaDoCj, type BackupListaCj } from '../src/modules/ingestao/niveis/backup'

/**
 * Religa a lista do CJ salva por `lista-cj:backup` aos jogadores REAIS do
 * banco. Só liga o que um humano confirmou em /admin/mapeamento — nome igual
 * vira SUGESTÃO, nunca vínculo. Reexecutável: rodar de novo depois das
 * confirmações completa a lista, e reconfirmar um nome troca o vínculo.
 *
 *   npx dotenv -e .env.local -- npm run lista-cj:restaurar -- --arquivo=backups/lista-cj-2026-09-25T1200.json
 */
// A MESMA fonte que /admin/mapeamento usa para listar os pendentes: provedor
// diferente gravaria linhas que a tela nunca mostra.
const PROVEDOR = process.env.NBA_PRIMARIO_NOME ?? 'balldontlie'

function argumento(nome: string): string | null {
  const prefixo = `--${nome}=`
  return process.argv.find((item) => item.startsWith(prefixo))?.slice(prefixo.length) ?? null
}

async function main() {
  const arquivo = argumento('arquivo')
  if (!arquivo) throw new Error('--arquivo=<caminho do backup> é obrigatório')

  const backup = JSON.parse(readFileSync(arquivo, 'utf8')) as BackupListaCj
  if (!Array.isArray(backup.versoes)) throw new Error(`${arquivo} não é um backup da lista do CJ`)

  const r = await restaurarListaDoCj(getDb(), backup, { provedor: PROVEDOR })

  const semSugestao = r.pendentes.filter((nome) => !r.sugeridos.includes(nome))

  console.log(`${r.versoes} versão(ões) restaurada(s)`)
  console.log(`ligados: ${r.ligados} linha(s) de níveis, só por vínculo confirmado`)
  console.log(`com sugestão exata: ${r.sugeridos.length}`)
  for (const nome of r.sugeridos) console.log(`  ${nome}`)
  console.log(`sem candidato ou ambíguos: ${semSugestao.length}`)
  for (const nome of semSugestao) console.log(`  ${nome}`)
  if (r.sugeridos.length > 0) {
    console.log(
      `confirme estes ${r.sugeridos.length} nomes com sugestão exata em /admin/mapeamento`,
    )
  }
  if (r.pendentes.length > 0) {
    console.log('confirme os pendentes em /admin/mapeamento e rode de novo')
  }
}

main()
  .catch((erro: unknown) => {
    console.error(erro instanceof Error ? erro.message : 'falha desconhecida no lista-cj:restaurar')
    process.exitCode = 1
  })
  .finally(() => fecharDb())
