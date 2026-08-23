import type { Apito } from '../../motor/tipos'
import type { Green } from '../../motor/fire-live/avaliar'
import type { MensagemPush } from '../fila/porta'

/** Validades conservadoras; o consumer e o worker descartam depois do prazo. */
export const VALIDADE_PUSH_MS = {
  FIRE_LIVE_APITO: 5 * 60_000,
  GREEN: 30 * 60_000,
  LISTA_SECRETA: 6 * 60 * 60_000,
} as const

export type DadosDeExibicao = {
  nome: string
  timeSigla: string
}

/** Monta o evento de push de um apito do Fire Live. */
export function mensagemDeApito(
  apito: Apito,
  exibicao: DadosDeExibicao,
  ocorridoEm: Date,
): MensagemPush {
  if (apito.alvo1Q === null) throw new Error('apito Fire Live sem alvo do primeiro quarto')
  return {
    versao: 1,
    chave: apito.chaveDeduplicacao,
    canal: 'FIRE_LIVE_APITO',
    titulo: `${exibicao.nome} apitou no 1Q`,
    corpo: `${exibicao.timeSigla} · alvo ${apito.alvo1Q} ${apito.atributo.toLowerCase()}`,
    url: '/',
    ocorridoEm: ocorridoEm.toISOString(),
    expiraEm: new Date(ocorridoEm.getTime() + VALIDADE_PUSH_MS.FIRE_LIVE_APITO).toISOString(),
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
export function mensagemDeGreen(
  green: Green,
  exibicao: DadosDeExibicao,
  ocorridoEm: Date,
): MensagemPush {
  return {
    versao: 1,
    chave: `green|${green.jogoId}|${green.jogadorId}|${green.atributo}|${green.marco}`,
    canal: 'GREEN',
    titulo: `${exibicao.nome} bateu ${green.marco}`,
    corpo: `${exibicao.timeSigla} · ${green.valor} ${green.atributo.toLowerCase()}`,
    url: '/',
    ocorridoEm: ocorridoEm.toISOString(),
    expiraEm: new Date(ocorridoEm.getTime() + VALIDADE_PUSH_MS.GREEN).toISOString(),
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
