export const JANELA_ATRIBUICAO_MS = 30 * 24 * 60 * 60 * 1_000

export type AtribuicaoVigente = {
  parceiroId: string
  linkOrigemId: string
  inicio: Date
  expiraEm: Date
}

export type CliqueParaAtribuicao = {
  parceiroId: string
  linkOrigemId: string
  agora: Date
}

/** Primeiro toque por 30 dias. O limite final é exclusivo. */
export function decidirAtribuicao(
  atual: AtribuicaoVigente | null,
  clique: CliqueParaAtribuicao,
): { atribuicao: AtribuicaoVigente; criarNova: boolean } {
  if (atual && clique.agora.getTime() < atual.expiraEm.getTime()) {
    return { atribuicao: atual, criarNova: false }
  }

  return {
    criarNova: true,
    atribuicao: {
      parceiroId: clique.parceiroId,
      linkOrigemId: clique.linkOrigemId,
      inicio: clique.agora,
      expiraEm: new Date(clique.agora.getTime() + JANELA_ATRIBUICAO_MS),
    },
  }
}
