import { readFileSync } from 'node:fs'

import { fecharDb, getDb } from '../src/modules/dominio/db/cliente'
import { rulesetAtivo } from '../src/modules/entrega/ruleset-ativo'
import { restaurarListaDoCj, type BackupListaCj } from '../src/modules/ingestao/niveis/backup'

/**
 * Religa a lista do CJ salva por `lista-cj:backup` aos jogadores REAIS do
 * banco. Só liga o que um humano confirmou em /admin/mapeamento — nome igual
 * vira SUGESTÃO, nunca vínculo. Reexecutável: rodar de novo depois das
 * confirmações completa a lista, e reconfirmar um nome troca o vínculo.
 *
 *   npx dotenv -e .env.local -- npm run lista-cj:restaurar -- --arquivo=backups/lista-cj-2026-09-25T1200.json
 *
 * `--temporada=2025-26` fixa a temporada da média com que as grafias repetidas
 * se resolvem; sem ela, vale a mais recente com `niveis.resolucao_por_media
 * .jogos_minimos` jogos (pente fino de 09/10, achado 8).
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

  const temporada = argumento('temporada') ?? undefined
  if (temporada !== undefined && !/^\d{4}-\d{2}$/.test(temporada)) {
    throw new Error(`--temporada=${temporada} inválida: use AAAA-AA, como 2025-26`)
  }

  // O ruleset dá as faixas de média por nível com que as grafias repetidas em
  // REB e AST se resolvem (respostas do CJ de 09/10).
  const r = await restaurarListaDoCj(getDb(), backup, {
    provedor: PROVEDOR,
    ruleset: await rulesetAtivo(),
    temporada,
  })
  if (temporada) console.log(`média das grafias repetidas: temporada ${temporada} (fixada)`)

  const semSugestao = r.pendentes.filter((nome) => !r.sugeridos.includes(nome))

  console.log(`${r.versoes} versão(ões) restaurada(s)`)
  console.log(`ligados: ${r.ligados} linha(s) de níveis, só por vínculo confirmado`)
  console.log(`com sugestão exata: ${r.sugeridos.length}`)
  for (const nome of r.sugeridos) console.log(`  ${nome}`)
  console.log(`sem candidato ou ambíguos: ${semSugestao.length}`)
  for (const nome of semSugestao) console.log(`  ${nome}`)
  console.log(`grafias repetidas resolvidas pela faixa de média: ${r.resolvidosPorMedia.length}`)
  for (const g of r.resolvidosPorMedia) {
    console.log(
      `  [${g.versao}] ${g.atributo} · ${g.nome} → ${g.escolhido} (média ${g.media})` +
        (g.descartados.length > 0 ? ` · fora: ${g.descartados.join(', ')}` : ''),
    )
  }
  console.log(`grafias repetidas que continuam pendentes: ${r.aindaDuplicados.length}`)
  for (const g of r.aindaDuplicados) {
    console.log(
      `  [${g.versao}] ${g.atributo} · ${g.nomes.join(' / ')} · níveis ${g.niveis.join(', ')} · ` +
        `média ${g.media ?? '—'} · ${g.motivo}`,
    )
  }
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
