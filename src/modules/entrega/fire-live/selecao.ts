import type { EstadoDoJogoNoFireLive } from './leitura'

export type GrupoSelecionavelAoVivo = {
  jogoId: string
  estado: EstadoDoJogoNoFireLive
  itens: readonly { jogadorId: string }[]
}

export type SelecaoDoJogoAoVivo<T extends GrupoSelecionavelAoVivo> = {
  grupo: T | null
  /** A URL pediu um jogo que não pertence ao recorte atual. */
  jogoSolicitadoInvalido: boolean
}

/**
 * Escolhe um único jogo para o painel principal do Fire Live.
 *
 * A ordem dos grupos já é estável na entrega. A seleção só acrescenta as
 * prioridades de produto: link explícito, jogo ao vivo com atleta seguido,
 * qualquer jogo ao vivo, próximo agendado e último 1º quarto encerrado.
 */
export function selecionarJogoAoVivo<T extends GrupoSelecionavelAoVivo>(
  grupos: readonly T[],
  jogoSolicitado?: string,
  jogadoresAcompanhados: ReadonlySet<string> = new Set(),
): SelecaoDoJogoAoVivo<T> {
  if (grupos.length === 0) {
    return { grupo: null, jogoSolicitadoInvalido: Boolean(jogoSolicitado) }
  }

  if (jogoSolicitado) {
    const explicito = grupos.find((grupo) => grupo.jogoId === jogoSolicitado)
    if (explicito) return { grupo: explicito, jogoSolicitadoInvalido: false }
  }

  const aoVivoAcompanhado = grupos.find(
    (grupo) =>
      grupo.estado === 'EM_1Q' &&
      grupo.itens.some((item) => jogadoresAcompanhados.has(item.jogadorId)),
  )
  const aoVivo = grupos.find((grupo) => grupo.estado === 'EM_1Q')
  const aguardando = grupos.find((grupo) => grupo.estado === 'AGUARDANDO')
  const encerrado = [...grupos].reverse().find((grupo) => grupo.estado === 'FIM_1Q')

  return {
    grupo: aoVivoAcompanhado ?? aoVivo ?? aguardando ?? encerrado ?? grupos[0]!,
    jogoSolicitadoInvalido: Boolean(jogoSolicitado),
  }
}
