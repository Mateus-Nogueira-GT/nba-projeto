/**
 * O NÍVEL DO PLANO — o único lugar em que a ordem está escrita.
 *
 * Chama-se `NivelDoPlano`, nunca `Nivel`: `Nivel` já é o nível do JOGADOR no
 * motor (MVP · All Star · Suporte · Randola), e o CLAUDE.md proíbe `nivel`
 * sozinho. Os dois vocabulários até compartilham palavras — "MVP", "All
 * Star" — e é exatamente por isso que os tipos não podem se confundir.
 *
 * GRATIS não é um direito no banco: é "logado sem direito ativo". Por isso
 * `NIVEIS_PAGOS` existe separado — é o que pode ser gravado numa linha.
 */
export type NivelDoPlano = 'GRATIS' | 'MVP' | 'ALL_STAR'
export type NivelPago = 'MVP' | 'ALL_STAR'
export type Modalidade = 'MENSAL' | 'TEMPORADA'

export const ORDEM_DOS_NIVEIS: readonly NivelDoPlano[] = ['GRATIS', 'MVP', 'ALL_STAR']
export const NIVEIS_PAGOS: readonly NivelPago[] = ['MVP', 'ALL_STAR']

/** Nomes comerciais, para a tela. O identificador nunca aparece na UI. */
export const ROTULO_DO_NIVEL: Record<NivelDoPlano, string> = {
  GRATIS: 'Grátis',
  MVP: 'MVP',
  ALL_STAR: 'All Star',
}

export function atende(nivelDoPlano: NivelDoPlano, minimo: NivelDoPlano): boolean {
  const atual = ORDEM_DOS_NIVEIS.indexOf(nivelDoPlano)
  const exigido = ORDEM_DOS_NIVEIS.indexOf(minimo)
  // Valor fora da ordem RECUSA, nunca libera. `indexOf` devolve -1 para o
  // desconhecido, e um `-1` no lado do mínimo faria todo nível "atender" —
  // portão aberto, sem erro, sem log. A coluna no banco é `text` e chega aqui
  // por conversão de tipo; quando ela trouxer lixo, a tela tem que fechar e
  // aparecer, não liberar e calar.
  if (atual < 0 || exigido < 0) return false
  return atual >= exigido
}

export function maior(a: NivelDoPlano, b: NivelDoPlano): NivelDoPlano {
  return atende(a, b) ? a : b
}

export function ehNivelPago(valor: string): valor is NivelPago {
  return (NIVEIS_PAGOS as readonly string[]).includes(valor)
}
