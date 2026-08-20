import { FonteHttp } from '../nba/adaptadores/http'
import { FonteComFailover } from '../nba/failover'
import type { FonteNBA } from '../nba/porta'
import { registrarBatimento } from '../health/heartbeat'
import type { Db } from '../../dominio/db/tipos'

/**
 * Monta a fonte NBA configurada, com failover e batimento ligados.
 *
 * O batimento é gravado AQUI, e não dentro do failover, porque a classe de
 * failover é pura de I/O de banco por desenho — ela só emite o evento. É esta
 * função que fecha o circuito do "alerta de dado parado": sem ela,
 * `saude_provedor` nunca recebe uma linha e `avaliarFrescor` não tem o que
 * avaliar.
 */
export type ConfigFontes = {
  primario: { nome: string; baseUrl: string; chave: string }
  reserva: { nome: string; baseUrl: string; chave: string }
  timeoutMs: number
}

/** Lê a configuração do ambiente. Null quando as credenciais não existem. */
export function configDoAmbiente(): ConfigFontes | null {
  const primarioUrl = process.env.NBA_PRIMARIO_URL
  const primarioChave = process.env.NBA_PRIMARIO_CHAVE

  if (!primarioUrl || !primarioChave) return null

  // Sem reserva configurado, o primário serve de reserva de si mesmo: o
  // failover continua funcionando (com retry) em vez de exigir dois contratos
  // para o sistema subir.
  const reservaUrl = process.env.NBA_RESERVA_URL ?? primarioUrl
  const reservaChave = process.env.NBA_RESERVA_CHAVE ?? primarioChave

  return {
    primario: {
      nome: process.env.NBA_PRIMARIO_NOME ?? 'provedor-a',
      baseUrl: primarioUrl,
      chave: primarioChave,
    },
    reserva: {
      nome: process.env.NBA_RESERVA_NOME ?? 'provedor-b',
      baseUrl: reservaUrl,
      chave: reservaChave,
    },
    timeoutMs: Number(process.env.NBA_TIMEOUT_MS ?? 8000),
  }
}

export function montarFonte(db: Db, config: ConfigFontes): FonteNBA {
  const criar = (c: ConfigFontes['primario']) =>
    new FonteHttp({ ...c, timeoutMs: config.timeoutMs })

  return new FonteComFailover(criar(config.primario), criar(config.reserva), {
    timeoutMs: config.timeoutMs,
    // Cada tentativa vira batimento, inclusive as que falham — é assim que um
    // provedor degradado aparece antes de o usuário reclamar.
    aoBater: (evento) => {
      void registrarBatimento(db, evento).catch(() => {
        // Falha ao gravar batimento não pode derrubar a ingestão: o dado da
        // NBA importa mais que a telemetria sobre ele.
      })
    },
  })
}
