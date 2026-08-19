import { pontuar } from '../../dominio/texto'

// `pontuar` vive no domínio porque a busca da aba de estatísticas precisa da
// mesma noção de "nome parecido". Reexportado aqui para não quebrar quem já
// importava daqui. Ver src/modules/dominio/texto.ts.
export { pontuar }

export type Candidato = {
  idExterno: string
  nomeCompleto: string
  timeSiglaProvedor: string | null
  ativo: boolean
  score: number
}

export type Sugestao = {
  nomeNaLista: string
  candidatos: Candidato[]
  /** Um único candidato claramente à frente dos demais. */
  inequivoco: boolean
}

export type OpcoesSugestao = {
  /** Abaixo disso o candidato nem é oferecido. */
  scoreMinimo: number
  /** Folga sobre o segundo colocado para o primeiro ser considerado inequívoco. */
  folgaInequivoca: number
  maximoCandidatos: number
}

export const OPCOES_PADRAO: OpcoesSugestao = {
  scoreMinimo: 0.55,
  folgaInequivoca: 0.15,
  maximoCandidatos: 5,
}

export function sugerir(
  nomeNaLista: string,
  jogadoresDoProvedor: { idExterno: string; nomeCompleto: string; timeSiglaProvedor: string | null; ativo: boolean }[],
  opcoes: OpcoesSugestao = OPCOES_PADRAO,
): Sugestao {
  const candidatos = jogadoresDoProvedor
    .map((j) => ({ ...j, score: pontuar(nomeNaLista, j.nomeCompleto) }))
    .filter((c) => c.score >= opcoes.scoreMinimo)
    .sort((a, b) => b.score - a.score)
    .slice(0, opcoes.maximoCandidatos)

  const primeiro = candidatos[0]
  const segundo = candidatos[1]
  const inequivoco =
    primeiro !== undefined &&
    (segundo === undefined || primeiro.score - segundo.score >= opcoes.folgaInequivoca)

  return { nomeNaLista, candidatos, inequivoco }
}
