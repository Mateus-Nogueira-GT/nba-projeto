import { Esqueleto } from '@/components/navegacao'

// Detalhe não é aba: sem barra inferior, como a Moldura da própria tela.
export default function Carregando() {
  return <Esqueleto aba={null} linhas={3} />
}
