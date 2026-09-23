import { randomUUID } from 'node:crypto'
import { and, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm'

import { fireLiveExecucoes } from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import { jogosNoQuarto } from '../../dominio/fatos-ao-vivo'
import type { Ruleset } from '../../motor/ruleset/schema'

/**
 * Maior que o timeout da rota (60s) e menor que dois disparos perdidos do cron.
 * O token de fencing, e não a duração, é quem garante exclusão mútua.
 */
export const DURACAO_LEASE_INICIO_MS = 2 * 60_000

/**
 * Quantos intervalos de observação sem batimento fazem uma linha INICIADA ser
 * dada como órfã (W2-3). Três dá folga a um passo lento sem deixar o 1º
 * quarto sem observador por mais de ~1 min.
 */
export const CICLOS_SEM_BATIMENTO_PARA_RETOMAR = 3

export type Disparo = {
  jogoId: string
  iniciadoEm: Date
  leaseToken: string
  tentativa: number
}

type IniciadorWorkflow = (disparo: Disparo) => Promise<{ runId: string }>

type ResultadoInicio = {
  iniciados: string[]
  falhas: { jogoId: string; erro: string }[]
  obsoletos: string[]
}

function expiraEm(agora: Date): Date {
  return new Date(agora.getTime() + DURACAO_LEASE_INICIO_MS)
}

function paraDisparo(linha: {
  jogoId: string
  iniciadoEm: Date
  leaseToken: string | null
  tentativasInicio: number
}): Disparo {
  if (linha.leaseToken === null) {
    throw new Error('reserva do Fire Live sem lease token')
  }

  return {
    jogoId: linha.jogoId,
    iniciadoEm: linha.iniciadoEm,
    leaseToken: linha.leaseToken,
    tentativa: linha.tentativasInicio,
  }
}

/**
 * Reserva ou recupera o direito de iniciar o observador de um jogo.
 *
 * A inserção continua protegida pela UNIQUE de `jogo_id`. Reservas antigas
 * sem `runId` deixam de ser sentenças permanentes: quando o lease vence (ou o
 * `start()` anterior falhou), um UPDATE condicional troca o fencing token e
 * entrega a tentativa a exatamente um reconciliador concorrente.
 *
 * `INICIADA` também é retomada quando o workflow para de bater (W2-3): o
 * `run_id` volta a null, e o run antigo, se ainda vivo, perde o próximo
 * batimento e para. Só vale para jogos ainda no quarto do Fire Live — o
 * filtro `jogosNoQuarto` acima já garante isso.
 */
export async function reservarJogosParaObservar(
  db: Db,
  ruleset: Ruleset,
  agora: Date,
): Promise<Disparo[]> {
  const emJogo = await jogosNoQuarto(db, ruleset.fire_live.quarto)
  if (emJogo.length === 0) return []

  const idsEmJogo = emJogo.map((jogo) => jogo.id)
  const novos = await db
    .insert(fireLiveExecucoes)
    .values(
      idsEmJogo.map((jogoId) => ({
        jogoId,
        iniciadoEm: agora,
        estado: 'RESERVADA' as const,
        leaseToken: randomUUID(),
        leaseExpiraEm: expiraEm(agora),
        tentativasInicio: 1,
        ultimaTentativaEm: agora,
        atualizadoEm: agora,
      })),
    )
    .onConflictDoNothing({ target: fireLiveExecucoes.jogoId })
    .returning({
      jogoId: fireLiveExecucoes.jogoId,
      iniciadoEm: fireLiveExecucoes.iniciadoEm,
      leaseToken: fireLiveExecucoes.leaseToken,
      tentativasInicio: fireLiveExecucoes.tentativasInicio,
    })

  // Um token por UPDATE basta: o jogo também participa de toda confirmação.
  // O valor muda a cada tentativa e impede um processo atrasado de vencer uma
  // reserva que já foi retomada por outro cron.
  const tokenDeRetomada = randomUUID()
  const recuperados = await db
    .update(fireLiveExecucoes)
    .set({
      estado: 'RESERVADA',
      leaseToken: tokenDeRetomada,
      leaseExpiraEm: expiraEm(agora),
      tentativasInicio: sql`${fireLiveExecucoes.tentativasInicio} + 1`,
      ultimaTentativaEm: agora,
      erroInicio: null,
      runId: null,
      workflowIniciadoEm: null,
      atualizadoEm: agora,
    })
    .where(
      and(
        inArray(fireLiveExecucoes.jogoId, idsEmJogo),
        or(
          and(
            isNull(fireLiveExecucoes.runId),
            or(
              eq(fireLiveExecucoes.estado, 'FALHOU_AO_INICIAR'),
              and(
                eq(fireLiveExecucoes.estado, 'RESERVADA'),
                or(
                  isNull(fireLiveExecucoes.leaseExpiraEm),
                  lte(fireLiveExecucoes.leaseExpiraEm, agora),
                ),
              ),
            ),
          ),
          // Run que parou de bater (W2-3): o workflow morreu com a linha
          // INICIADA. Zera o run_id — o velho, se ainda vivo, perde o
          // próximo batimento e para.
          and(
            eq(fireLiveExecucoes.estado, 'INICIADA'),
            lte(
              fireLiveExecucoes.atualizadoEm,
              new Date(
                agora.getTime() -
                  CICLOS_SEM_BATIMENTO_PARA_RETOMAR *
                    ruleset.fire_live.observacao.intervalo_segundos *
                    1000,
              ),
            ),
          ),
        ),
      ),
    )
    .returning({
      jogoId: fireLiveExecucoes.jogoId,
      iniciadoEm: fireLiveExecucoes.iniciadoEm,
      leaseToken: fireLiveExecucoes.leaseToken,
      tentativasInicio: fireLiveExecucoes.tentativasInicio,
    })

  return [...novos, ...recuperados].map(paraDisparo)
}

/**
 * Confirma o run vencedor.
 *
 * Pode ser chamado tanto pela rota quanto pelo primeiro passo do workflow. A
 * segunda chamada com o mesmo `runId` é idempotente; outro run ou um token
 * antigo perde o fencing e deve encerrar sem observar o jogo.
 */
export async function confirmarInicioWorkflow(
  db: Db,
  disparo: Pick<Disparo, 'jogoId' | 'leaseToken'>,
  runId: string,
  agora: Date,
): Promise<boolean> {
  const confirmada = await db
    .update(fireLiveExecucoes)
    .set({
      estado: 'INICIADA',
      runId,
      workflowIniciadoEm: agora,
      leaseExpiraEm: null,
      erroInicio: null,
      atualizadoEm: agora,
    })
    .where(
      and(
        eq(fireLiveExecucoes.jogoId, disparo.jogoId),
        eq(fireLiveExecucoes.leaseToken, disparo.leaseToken),
        or(
          and(eq(fireLiveExecucoes.estado, 'RESERVADA'), isNull(fireLiveExecucoes.runId)),
          and(eq(fireLiveExecucoes.estado, 'INICIADA'), eq(fireLiveExecucoes.runId, runId)),
        ),
      ),
    )
    .returning({ id: fireLiveExecucoes.id })

  return confirmada.length === 1
}

export function resumirErroInicio(erro: unknown): string {
  const bruto = erro instanceof Error ? `${erro.name}: ${erro.message}` : 'Erro: falha desconhecida'

  return bruto
    .replace(/https?:\/\/\S+/gi, '[url removida]')
    .replace(
      /(authorization|bearer|token|secret|segredo|api[_-]?key|chave)(\s*[=:]\s*|\s+)\S+/gi,
      '$1$2[removido]',
    )
    .replace(/[\r\n\t]+/g, ' ')
    .slice(0, 500)
}

export async function registrarFalhaAoIniciar(
  db: Db,
  disparo: Pick<Disparo, 'jogoId' | 'leaseToken'>,
  erro: unknown,
  agora: Date,
): Promise<boolean> {
  const atualizada = await db
    .update(fireLiveExecucoes)
    .set({
      estado: 'FALHOU_AO_INICIAR',
      leaseExpiraEm: null,
      erroInicio: resumirErroInicio(erro),
      atualizadoEm: agora,
    })
    .where(
      and(
        eq(fireLiveExecucoes.jogoId, disparo.jogoId),
        eq(fireLiveExecucoes.leaseToken, disparo.leaseToken),
        eq(fireLiveExecucoes.estado, 'RESERVADA'),
        isNull(fireLiveExecucoes.runId),
      ),
    )
    .returning({ id: fireLiveExecucoes.id })

  return atualizada.length === 1
}

/** Executa o handshake externo sem perder a elegibilidade a retry. */
export async function iniciarWorkflowsReservados(
  db: Db,
  disparos: Disparo[],
  iniciar: IniciadorWorkflow,
  agora: () => Date = () => new Date(),
): Promise<ResultadoInicio> {
  const resultado: ResultadoInicio = { iniciados: [], falhas: [], obsoletos: [] }

  for (const disparo of disparos) {
    try {
      const run = await iniciar(disparo)
      const confirmou = await confirmarInicioWorkflow(db, disparo, run.runId, agora())

      if (confirmou) {
        resultado.iniciados.push(disparo.jogoId)
        console.info(
          JSON.stringify({
            evento: 'fire_live_inicio',
            jogoId: disparo.jogoId,
            estado: 'INICIADA',
            tentativa: disparo.tentativa,
            runId: run.runId,
          }),
        )
      } else {
        resultado.obsoletos.push(disparo.jogoId)
        console.warn(
          JSON.stringify({
            evento: 'fire_live_inicio',
            jogoId: disparo.jogoId,
            estado: 'LEASE_PERDIDO',
            tentativa: disparo.tentativa,
            runId: run.runId,
          }),
        )
      }
    } catch (erro) {
      const resumo = resumirErroInicio(erro)
      await registrarFalhaAoIniciar(db, disparo, erro, agora())
      resultado.falhas.push({ jogoId: disparo.jogoId, erro: resumo })
      console.error(
        JSON.stringify({
          evento: 'fire_live_inicio',
          jogoId: disparo.jogoId,
          estado: 'FALHOU_AO_INICIAR',
          tentativa: disparo.tentativa,
          erro: resumo,
        }),
      )
    }
  }

  return resultado
}
