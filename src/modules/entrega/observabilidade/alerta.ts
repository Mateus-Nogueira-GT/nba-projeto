import { desc, eq } from 'drizzle-orm'

import { logFalhas, saudeProvedor } from '@/modules/dominio/db/schema'
import type { Db } from '@/modules/dominio/db/tipos'
import { avaliarFrescor, type LimitesFrescor } from '@/modules/ingestao/health/heartbeat'
import type { Ruleset } from '@/modules/motor'

import { emJanelaDeJogo } from './janela'
import type { NotificadorOperacional } from './notificador'

const ORIGEM = 'alerta-dado-parado'

export type AlertaEmitido = { provedor: string; paradoHaMs: number; limiteMs: number }

function limitesDoRuleset(ruleset: Ruleset): LimitesFrescor {
  const cfg = ruleset.avisos.dado_parado
  return {
    foraDeJogoMs: cfg.fora_de_jogo_minutos * 60_000,
    emJanelaDeJogoMs: cfg.em_janela_segundos * 1_000,
  }
}

/**
 * "A equipe descobre antes do usuário": lê a saúde dos provedores, aplica o
 * frescor do ruleset (apertado em janela de jogo) e sinaliza — em
 * `log_falhas` e pelo notificador.
 *
 * Provedor parado há uma hora não vira sessenta alertas: o último alerta do
 * mesmo provedor suprime os seguintes até vencer `realerta_minutos`.
 */
export async function avaliarESinalizar(
  db: Db,
  agora: Date,
  ruleset: Ruleset,
  notificador: NotificadorOperacional,
): Promise<AlertaEmitido[]> {
  const cfg = ruleset.avisos.dado_parado
  const linhas = await db
    .select({ provedor: saudeProvedor.provedor, dadoMaisRecenteEm: saudeProvedor.dadoMaisRecenteEm })
    .from(saudeProvedor)
  if (linhas.length === 0) return []

  const emJanela = await emJanelaDeJogo(db, agora, cfg.janela_antecedencia_minutos)
  const parados = avaliarFrescor(linhas, agora, emJanela, limitesDoRuleset(ruleset))
  if (parados.length === 0) return []

  // Supressão de realerta: consulta pequena (alertas recentes), filtro em memória.
  const recentes = await db
    .select({ contextoJson: logFalhas.contextoJson, ocorridoEm: logFalhas.ocorridoEm })
    .from(logFalhas)
    .where(eq(logFalhas.origem, ORIGEM))
    .orderBy(desc(logFalhas.ocorridoEm))
    .limit(100)
  const limiteRealerta = agora.getTime() - cfg.realerta_minutos * 60_000
  const suprimidos = new Set(
    recentes
      .filter((r) => r.ocorridoEm.getTime() > limiteRealerta)
      .map((r) => (r.contextoJson as { provedor?: string } | null)?.provedor)
      .filter((p): p is string => typeof p === 'string'),
  )

  const emitidos: AlertaEmitido[] = []
  for (const alerta of parados) {
    if (suprimidos.has(alerta.provedor)) continue

    const paradoHaMin =
      alerta.paradoHaMs === Infinity ? null : Math.round(alerta.paradoHaMs / 60_000)
    await db.insert(logFalhas).values({
      origem: ORIGEM,
      severidade: 'ERRO',
      mensagem: `dado parado: ${alerta.provedor}`,
      contextoJson: {
        provedor: alerta.provedor,
        paradoHaMinutos: paradoHaMin,
        limiteMs: alerta.limiteMs,
        emJanelaDeJogo: emJanela,
      },
      ocorridoEm: agora,
    })
    await notificador.enviar({
      severidade: 'ALTA',
      titulo: `Dado parado: ${alerta.provedor}`,
      corpo:
        paradoHaMin === null
          ? `${alerta.provedor} nunca respondeu.`
          : `${alerta.provedor} sem dado novo há ${paradoHaMin} min (limite ${Math.round(alerta.limiteMs / 1000)}s${emJanela ? ', em janela de jogo' : ''}).`,
    })
    emitidos.push({ provedor: alerta.provedor, paradoHaMs: alerta.paradoHaMs, limiteMs: alerta.limiteMs })
  }
  return emitidos
}
