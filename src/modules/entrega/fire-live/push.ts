import { and, eq, isNull, or } from 'drizzle-orm'

import {
  preferenciasNotificacao,
  pushInscricoes,
  usuarios,
} from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import type { Apito } from '../../motor/tipos'
import type { Green } from '../../motor/fire-live/avaliar'
import type { CanalPush, MensagemPush } from '../fila/porta'

/**
 * FORMATO E POSIÇÃO — apito e green nunca se parecem.
 *
 * A distinção é estrutural, não cosmética: um apito é entrada sugerida com
 * alvo e janela curta de aposta, e por isso ocupa o topo; um green é o
 * resultado de uma entrada que já saiu, e não pode empurrar para baixo um
 * apito ainda válido.
 *
 * Os valores concretos de posição são decisão de UI e ainda não estão fixados
 * em docs/04-design-system.md — o que o teste trava é que os dois DIFEREM.
 */
export const APRESENTACAO = {
  FIRE_LIVE_APITO: { formato: 'CARD_APITO', posicao: 'TOPO' },
  GREEN: { formato: 'FAIXA_GREEN', posicao: 'RODAPE' },
} as const

export type DadosDeExibicao = {
  nome: string
  timeSigla: string
}

/** Monta o evento de push de um apito do Fire Live. */
export function mensagemDeApito(apito: Apito, exibicao: DadosDeExibicao): MensagemPush {
  const { formato, posicao } = APRESENTACAO.FIRE_LIVE_APITO

  return {
    chave: apito.chaveDeduplicacao,
    canal: 'FIRE_LIVE_APITO',
    formato,
    posicao,
    titulo: `${exibicao.nome} apitou no 1Q`,
    corpo: `${exibicao.timeSigla} · alvo ${apito.alvo1Q} ${apito.atributo.toLowerCase()}`,
    dados: {
      jogoId: apito.jogoId,
      jogadorId: apito.jogadorId,
      atributo: apito.atributo,
      nivelJogador: apito.nivelJogador,
      alvo1Q: apito.alvo1Q,
      modoFire: apito.modoFire,
      // Cruzamento: o card do Fire Live exibe a OPD pré-live com nível e cor.
      opdOrigemNivel: apito.opdOrigemNivel,
    },
  }
}

/** Monta o evento de push de um green. */
export function mensagemDeGreen(green: Green, exibicao: DadosDeExibicao): MensagemPush {
  const { formato, posicao } = APRESENTACAO.GREEN

  return {
    chave: `green|${green.jogoId}|${green.jogadorId}|${green.atributo}|${green.marco}`,
    canal: 'GREEN',
    formato,
    posicao,
    titulo: `${exibicao.nome} bateu ${green.marco}`,
    corpo: `${exibicao.timeSigla} · ${green.valor} ${green.atributo.toLowerCase()}`,
    dados: {
      jogoId: green.jogoId,
      jogadorId: green.jogadorId,
      atributo: green.atributo,
      nivelJogador: green.nivelJogador,
      marco: green.marco,
      valor: green.valor,
    },
  }
}

/**
 * Quem recebe um canal.
 *
 * Roda no CONSUMIDOR da fila, uma vez por evento — nunca dentro do ciclo de
 * observação, que precisa devolver o controle em segundos.
 *
 * Ausência de linha em `preferencias_notificacao` conta como HABILITADO: a
 * coluna tem default true e o modelo do ruleset é de opt-out por canal
 * (`push.canais_independentes`). Só desliga quem desligou explicitamente.
 */
export async function destinatariosDoCanal(db: Db, canal: CanalPush): Promise<string[]> {
  const linhas = await db
    .selectDistinct({ usuarioId: usuarios.id })
    .from(usuarios)
    .innerJoin(pushInscricoes, eq(pushInscricoes.usuarioId, usuarios.id))
    .leftJoin(
      preferenciasNotificacao,
      and(
        eq(preferenciasNotificacao.usuarioId, usuarios.id),
        eq(preferenciasNotificacao.canal, canal),
      ),
    )
    .where(
      and(
        eq(usuarios.status, 'ATIVO'),
        or(
          eq(preferenciasNotificacao.habilitado, true),
          // Sem linha no LEFT JOIN = usuário nunca mexeu no canal = habilitado.
          isNull(preferenciasNotificacao.id),
        ),
      ),
    )

  return linhas.map((l) => l.usuarioId)
}
