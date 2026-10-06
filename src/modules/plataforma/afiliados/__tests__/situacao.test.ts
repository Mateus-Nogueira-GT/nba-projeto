import { describe, expect, it } from 'vitest'

import { situacaoDaIndicacao } from '../situacao'

const AGORA = new Date('2026-09-26T12:00:00.000Z')

describe('situação da indicação (pura)', () => {
  it('status cancelado, em qualquer grafia do provedor, é CANCELADA mesmo com direito vigente', () => {
    for (const statusAssinatura of ['CANCELADA', 'CANCELED', 'CANCELLED', 'cancelled']) {
      expect(
        situacaoDaIndicacao({
          statusAssinatura,
          direito: { tipo: 'ATE', fim: new Date('2026-10-26T12:00:00.000Z') },
          agora: AGORA,
        }),
      ).toBe('CANCELADA')
    }
  })

  it('direito que ainda não acabou é ATIVA', () => {
    expect(
      situacaoDaIndicacao({
        statusAssinatura: 'ATIVA',
        direito: { tipo: 'ATE', fim: new Date('2026-10-26T12:00:00.000Z') },
        agora: AGORA,
      }),
    ).toBe('ATIVA')
  })

  it('direito que acabou (inclusive exatamente agora) é VENCIDA', () => {
    expect(
      situacaoDaIndicacao({
        statusAssinatura: 'ATIVA',
        direito: { tipo: 'ATE', fim: new Date('2026-09-01T12:00:00.000Z') },
        agora: AGORA,
      }),
    ).toBe('VENCIDA')
    expect(
      situacaoDaIndicacao({
        statusAssinatura: null,
        direito: { tipo: 'ATE', fim: AGORA },
        agora: AGORA,
      }),
    ).toBe('VENCIDA')
  })

  it('sem direito nenhum (nem em vigor, nem vencido) e sem cancelamento é SEM_ASSINATURA', () => {
    // `{ tipo: 'NENHUM' }` = não existe direito relevante — nem em vigor
    // agora, nem já vencido (nunca assinou, ou só tem direito FUTURO que
    // ainda não começou). Diferente de `{ tipo: 'ABERTO' }`, que significa "há
    // um direito em vigor, mas sem data de fim" (ver teste abaixo) — Fix
    // round 2 trocou os dois `null`/`undefined` que confundiam isto por um
    // tipo discriminado explícito.
    expect(
      situacaoDaIndicacao({ statusAssinatura: null, direito: { tipo: 'NENHUM' }, agora: AGORA }),
    ).toBe('SEM_ASSINATURA')
    expect(
      situacaoDaIndicacao({
        statusAssinatura: 'PENDENTE',
        direito: { tipo: 'NENHUM' },
        agora: AGORA,
      }),
    ).toBe('SEM_ASSINATURA')
  })

  it('direito em vigor sem data de fim (aberto, ex.: cortesia sem prazo) é ATIVA', () => {
    // `{ tipo: 'ABERTO' }` só sai da consulta quando ela JÁ sabe que o
    // direito cobre agora (`existeDireitoRelevante`), então nunca é
    // confundido com "não há direito nenhum" (`NENHUM`, acima).
    expect(
      situacaoDaIndicacao({ statusAssinatura: 'ATIVA', direito: { tipo: 'ABERTO' }, agora: AGORA }),
    ).toBe('ATIVA')
    // Cortesia não tem linha em `assinaturas` (só em `direitos_acesso`):
    // `statusAssinatura` também é null, e mesmo assim é ATIVA.
    expect(
      situacaoDaIndicacao({ statusAssinatura: null, direito: { tipo: 'ABERTO' }, agora: AGORA }),
    ).toBe('ATIVA')
  })
})
