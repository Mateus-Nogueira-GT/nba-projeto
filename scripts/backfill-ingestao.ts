import { and, desc, eq } from 'drizzle-orm'

import { fecharDb, getDb } from '../src/modules/dominio/db/cliente'
import { checkpointsIngestao } from '../src/modules/dominio/db/schema'
import { temporadaDe } from '../src/modules/dominio/temporada'
import { rulesetAtivo } from '../src/modules/entrega/ruleset-ativo'
import { executarJobComLease } from '../src/modules/ingestao/jobs/execucao'
import { deslocarData, executarJobRodada } from '../src/modules/ingestao/jobs/orquestradores'
import {
  configDoAmbiente,
  montarFontes,
} from '../src/modules/ingestao/sincronizar/fonte'

function argumento(nome: string): string | null {
  const prefixo = `--${nome}=`
  return process.argv.find((item) => item.startsWith(prefixo))?.slice(prefixo.length) ?? null
}

function validarData(valor: string | null, nome: string): string {
  if (!valor || !/^\d{4}-\d{2}-\d{2}$/.test(valor) || Number.isNaN(Date.parse(`${valor}T00:00:00Z`))) {
    throw new Error(`--${nome}=YYYY-MM-DD é obrigatório`)
  }
  return valor
}

async function main() {
  const inicio = validarData(argumento('from'), 'from')
  const fim = validarData(argumento('to'), 'to')
  if (inicio > fim) throw new Error('--from não pode ser posterior a --to')
  const dryRun = process.argv.includes('--dry-run')
  const resume = process.argv.includes('--resume')

  const config = configDoAmbiente()
  if (!config) throw new Error('fontes NBA não configuradas')
  if (!config.habilitada && !dryRun) throw new Error('ingestão NBA desabilitada pelo kill switch')

  const ruleset = await rulesetAtivo()
  const configTemporada = {
    mesInicio: ruleset.temporada.mes_inicio,
    formato: ruleset.temporada.formato,
  } as const

  if (dryRun) {
    console.info(
      JSON.stringify({
        modo: 'dry-run',
        inicio,
        fim,
        primaria: config.primario.nome,
        reserva: config.reserva?.nome ?? null,
        escreveBanco: false,
      }),
    )
    return
  }

  const db = getDb()
  const fontes = montarFontes(db, config)
  let data = inicio

  if (resume) {
    const [checkpoint] = await db
      .select({ dataReferencia: checkpointsIngestao.dataReferencia })
      .from(checkpointsIngestao)
      .where(
        and(
          eq(checkpointsIngestao.job, 'backfill-rodada'),
          eq(checkpointsIngestao.janelaInicio, inicio),
          eq(checkpointsIngestao.janelaFim, fim),
          eq(checkpointsIngestao.provedor, config.primario.nome),
          eq(checkpointsIngestao.concluido, true),
        ),
      )
      .orderBy(desc(checkpointsIngestao.dataReferencia))
      .limit(1)
    if (checkpoint?.dataReferencia) data = deslocarData(checkpoint.dataReferencia, 1)
  }

  try {
    for (; data <= fim; data = deslocarData(data, 1)) {
      const instante = new Date(`${data}T17:00:00.000Z`)
      const temporada = temporadaDe(instante, configTemporada)
      const resultado = await executarJobComLease(
        db,
        {
          job: 'backfill-rodada',
          janelaInicio: data,
          janelaFim: data,
          temporada,
          origem: 'CLI',
          leaseMs: 10 * 60_000,
        },
        async ({ execucaoId, confirmarLease }) => {
          const contagens = await executarJobRodada(db, fontes, {
            dataReferencia: data,
            sobreposicaoDias: 0,
            temporada,
            agora: instante,
            janelaMedia: ruleset.media.janela,
            configTemporada,
          })
          await confirmarLease()
          const provedores: string[] = [config.primario.nome]
          if (config.reserva) provedores.push(config.reserva.nome)
          for (const provedor of provedores) {
            await db
              .insert(checkpointsIngestao)
              .values({
                job: 'backfill-rodada',
                janelaInicio: inicio,
                janelaFim: fim,
                temporada,
                provedor,
                dataReferencia: data,
                concluido: true,
                execucaoId,
              })
              .onConflictDoUpdate({
                target: [
                  checkpointsIngestao.job,
                  checkpointsIngestao.janelaInicio,
                  checkpointsIngestao.janelaFim,
                  checkpointsIngestao.temporada,
                  checkpointsIngestao.provedor,
                ],
                set: { dataReferencia: data, concluido: true, execucaoId, atualizadoEm: instante },
              })
          }
          return contagens
        },
      )
      console.info(JSON.stringify({ dataReferencia: data, resultado }))
    }
  } finally {
    await fecharDb()
  }
}

main().catch((erro: unknown) => {
  console.error(erro instanceof Error ? erro.message : 'falha desconhecida no backfill')
  process.exitCode = 1
})
