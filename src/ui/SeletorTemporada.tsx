import { Segmentado } from './controles'

/**
 * "2025-26 | 2026-27" em Resultados, Lista Secreta e Estatísticas. Some com
 * uma temporada só (a maior parte do ano, antes de o CJ liberar a anterior):
 * um seletor de opção única não escolhe nada, só ocupa lugar na tela.
 */
export function SeletorTemporada({
  temporadas,
  atual,
  hrefDe,
}: {
  temporadas: string[]
  atual: string
  hrefDe: (temporada: string) => string
}) {
  if (temporadas.length < 2) return null
  return (
    <Segmentado
      rotulo="Temporada"
      opcoes={temporadas.map((t) => ({ valor: t, rotulo: t, href: hrefDe(t), ativo: t === atual }))}
      compacto
    />
  )
}

/**
 * A faixa de toda tela da temporada anterior (spec 25/09, §5): quem vê um
 * apito de 2025-26 não pode entender que ele foi publicado na época.
 */
export const AVISO_TEMPORADA_ANTERIOR =
  'A metodologia NIP aplicada à temporada passada. Nenhum destes apitos foi publicado na época.'
