import { semantico } from '@/design-system/tokens/semantico'

import type { Aba } from './abas'

/**
 * ÍCONES DA NAVEGAÇÃO — traço de 1,5 px a 20 px, um por aba.
 *
 * O manual (p.5) pede ícone de traço consistente entre 20 e 24 px e diz que
 * ícone INFORMA mas não substitui rótulo — por isso as duas barras sempre
 * mostram o nome da aba ao lado.
 *
 * Substituem as quatro formas geométricas da identidade 02 (quadrado, quadrado
 * vazado, círculo, losango). Elas nasceram para não usar emoji e resolveram
 * isso, mas duas abas dividiam a mesma forma com raios de canto diferentes, e
 * ao lado de uma marca real um vocabulário de formas abstratas vira ruído.
 *
 * O estado ativo NÃO é dito pela cor do traço: quem diz é a pílula preenchida
 * atrás do ícone, o peso do rótulo e o `aria-current` do link. Aqui a cor só
 * acompanha o texto, para os dois não brigarem dentro da pílula.
 */
const CAMINHOS: Record<Aba, string> = {
  // Lista de entradas: três linhas, a última mais curta.
  lista: 'M4 6h12M4 10h12M4 14h8',
  // A chama do Fire Live.
  'fire-live': 'M10 3c1 3 4 4 4 8a4 4 0 0 1-8 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 0-7z',
  // Barras de estatística, alturas diferentes.
  stats: 'M4 16V9M10 16V4M16 16v-5',
  // A carteira da gestão de banca.
  gestao: 'M3 6h14v9H3zM3 9h14M13 12h2',
  // A pessoa do perfil.
  conta: 'M10 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM4 17c0-3 3-4 6-4s6 1 6 4',
}

export function IconeAba({ aba, ativo }: { aba: Aba; ativo: boolean }) {
  const cor = ativo ? semantico.textoSobreAcento : semantico.textoSecundario
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 20 20"
      aria-hidden
      fill="none"
      stroke={cor}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={CAMINHOS[aba]} />
    </svg>
  )
}
