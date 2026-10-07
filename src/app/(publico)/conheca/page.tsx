import type { Metadata } from 'next'
import { carregarLanding } from '@/features/landing/carregar'
import { TelaLanding } from '@/features/landing/TelaLanding'
import { exibirOdds } from '@/modules/entrega/odds/exibicao'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'

/*
 * Dinâmica DE PROPÓSITO (ƒ no build), mesmo sem cookie ou header: `hoje` é o
 * dia da RODADA no fuso do ruleset, e uma página estática seria
 * pré-renderizada no `next build` — que roda sem banco alcançável. A vitrine
 * inteira vem de `landingCacheada` (uma vez por hora, sem nada pago de hoje);
 * a visita paga só a renderização.
 */
export const dynamic = 'force-dynamic'
/** A descrição só cita odds quando o ruleset as mostra (desligadas desde 07/10/2026). */
export async function generateMetadata(): Promise<Metadata> {
  const comOdds = exibirOdds(await rulesetAtivo())
  return {
    title: 'Leia o jogo por inteiro',
    description: `A NIP cruza ${comOdds ? 'forma recente, desfalques e odds' : 'forma recente e desfalques'} de cada jogador da NBA e entrega, antes da bola subir, quem tem oportunidade na rodada.`,
  }
}

/**
 * A página de vendas: pública, fora do app logado, com o produto real na
 * vitrine — a noite CONFERIDA, nunca a lista de hoje (decisão D2, 23/09).
 */
export default async function PaginaConheca() {
  const dados = await carregarLanding()
  return <TelaLanding dados={dados} />
}
