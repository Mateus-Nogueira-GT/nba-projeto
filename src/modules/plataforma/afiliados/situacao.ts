/**
 * Situação de uma indicação, para a tela — função pura, sem banco nem relógio:
 * quem chama passa o status do contrato, o direito RELEVANTE e o `agora`.
 *
 * Cancelamento vence o direito vigente de propósito: quem cancelou continua
 * com o período já pago (o webhook preserva), mas para quem acompanha a
 * indicação o que importa é que a assinatura não vai renovar.
 */
export type SituacaoDaIndicacao = 'ATIVA' | 'CANCELADA' | 'VENCIDA' | 'SEM_ASSINATURA'

/**
 * O direito RELEVANTE — o que cobre `agora`, ou, se nenhum cobre, o mais
 * recente que já venceu (quem monta isto decide qual é: ver `listarIndicacoes`
 * em `indicacoes.ts`).
 *
 * Discriminado por `tipo`, de propósito (Fix round 2): antes disto era
 * `Date | null | undefined`, com `null` e `undefined` carregando sentidos
 * OPOSTOS (um "ATIVA", o outro "SEM_ASSINATURA") — um `?? null` escrito por
 * descuido por quem monta a entrada teria virado ATIVA em silêncio. Com um
 * tipo explícito, o TypeScript recusa a chamada em vez de aceitar o valor
 * errado.
 */
export type DireitoRelevante =
  | { tipo: 'NENHUM' } // nem em vigor agora, nem já vencido — nunca assinou, ou só tem direito FUTURO que ainda não começou.
  | { tipo: 'ABERTO' } // em vigor agora, sem data de fim (ex.: cortesia sem prazo).
  | { tipo: 'ATE'; fim: Date } // em vigor até `fim` (ATIVA se `fim` > agora) ou já vencido nele (VENCIDA).

/**
 * As três grafias que chegam até aqui: a nossa (`CANCELADA`) e as duas do
 * provedor. Comparadas em maiúsculas porque o provedor manda em minúsculas.
 */
const STATUS_CANCELADOS = new Set(['CANCELADA', 'CANCELED', 'CANCELLED'])

export function situacaoDaIndicacao(entrada: {
  statusAssinatura: string | null
  direito: DireitoRelevante
  agora: Date
}): SituacaoDaIndicacao {
  if (entrada.statusAssinatura && STATUS_CANCELADOS.has(entrada.statusAssinatura.toUpperCase())) {
    return 'CANCELADA'
  }
  switch (entrada.direito.tipo) {
    case 'NENHUM':
      return 'SEM_ASSINATURA'
    case 'ABERTO':
      return 'ATIVA'
    case 'ATE':
      return entrada.direito.fim.getTime() > entrada.agora.getTime() ? 'ATIVA' : 'VENCIDA'
  }
}
