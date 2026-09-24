import type { Metadata } from 'next'
import Link from 'next/link'
import { dataDeReferencia, somarDias } from '@/modules/dominio/rodada'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import { Placar } from '@/features/resultados/TelaResultados'
import { Logo } from '@/ui/Logo'
import { placarCacheado } from '@/app/_cache/placar'
import s from '@/features/resultados/Publico.module.css'

/*
 * Dinâmica DE PROPÓSITO (ƒ no build), mesmo sem cookie ou header: `hoje` é
 * o dia da RODADA no fuso do ruleset e muda a cada visita, e uma página
 * estática seria pré-renderizada no `next build` — que roda sem banco
 * alcançável. O que pesa (30 dias de conferência) vem de `placarCacheado`,
 * uma vez por hora e compartilhado com Resultados; a visita paga só a
 * renderização.
 */
export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Placar do NIP',
  description: 'Quanto cada faixa da nota de confiança e cada nível de jogador acertou de fato nas rodadas conferidas.',
}

/**
 * O PLACAR ABERTO — sem login. A prova de que a nota funciona (ou não) fica à
 * vista de quem ainda não assinou; é a lição do FootyStats e a resposta à
 * crítica que derrubou o R10 ("as análises não batem com a realidade").
 * Mostra só agregados: nenhum apito, linha ou jogador (decisão D3, 23/09).
 */
export default async function PaginaPlacar() {
  const ruleset = await rulesetAtivo()
  const hoje = dataDeReferencia(new Date(), ruleset.rodada.fuso)
  // `ate` é EXCLUSIVO na entrega: +1 dia para a rodada de hoje entrar na
  // janela quando já estiver conferida — a mesma chave que Resultados usa.
  const placar = await placarCacheado(somarDias(hoje, 1), ruleset.confianca_exibicao.faixas)
  return (
    <div className={s.pagina}>
      <header className={s.topo}>
        <Link href="/conheca" aria-label="NIP">
          <Logo largura={96} prioridade />
        </Link>
        <Link href="/cadastrar" className={s.botao}>
          Criar conta grátis
        </Link>
      </header>
      <main className={s.miolo}>
        <p className={s.rotulo}>Transparência</p>
        <h1 className={s.titulo}>Placar do NIP</h1>
        <p className={s.lead}>
          Toda noite a NIP confere o que apitou. Aqui está quanto cada faixa da nota de confiança e cada nível de
          jogador acertou de verdade, com os erros na mesma tela dos acertos.
        </p>
        {placar.rodadas === 0 ? (
          <p className={s.lead}>Ainda não há rodadas conferidas nesta temporada.</p>
        ) : (
          <Placar placar={placar} semTitulo />
        )}
        <p className={s.nota}>
          A nota de confiança mede a força da leitura da NIP; não é probabilidade de acerto nem promessa de resultado.
          Jogador que não entrou em quadra não conta como acerto nem como erro.
        </p>
        <p className={s.nota}>
          <strong>18+</strong> · Aposte com responsabilidade. Aposta não é investimento.
        </p>
      </main>
    </div>
  )
}
