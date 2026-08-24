import Link from 'next/link'

import { semantico } from '@/design-system/tokens/semantico'

import { IconeAba } from './icones'

/**
 * BARRA DE NAVEGAÇÃO — as abas do produto.
 *
 * Até aqui cada tela era uma ilha ligada por links de rodapé: quem abria a
 * Lista Secreta não tinha como chegar ao Fire Live sem saber a URL. Cinco abas
 * é o teto de um polegar em tela de celular — Estatísticas e a aba teórica
 * ficam a um toque de distância dentro de "Conta".
 *
 * Identidade 02: ícones geométricos em SVG (sem emoji) e rótulos em
 * `semantico.fonteRotulo`. "Resultados" saiu do nome da aba — a tela de
 * resultados passa a viver dentro de "Entradas" (redesenho da Task 8); aqui
 * o tipo já reflete o destino final.
 *
 * Componente de servidor de propósito: a aba ativa vem por props de quem
 * renderiza, não de `usePathname`. Uma barra de navegação não justifica
 * embarcar JavaScript em todas as páginas do app.
 */
export type Aba = 'lista' | 'fire-live' | 'stats' | 'gestao' | 'conta'

const ABAS: {
  id: Aba
  href: string
  rotulo: string
  forma: 'quadrado' | 'quadradoVazado' | 'circulo' | 'losango'
}[] = [
  { id: 'lista', href: '/', rotulo: 'ENTRADAS', forma: 'quadrado' },
  { id: 'fire-live', href: '/fire-live', rotulo: 'AO VIVO', forma: 'quadradoVazado' },
  { id: 'stats', href: '/estatisticas', rotulo: 'STATS', forma: 'circulo' },
  { id: 'gestao', href: '/gestao', rotulo: 'GESTÃO', forma: 'losango' },
  { id: 'conta', href: '/conta', rotulo: 'PERFIL', forma: 'circulo' },
]

export function BarraInferior({ atual }: { atual: Aba }) {
  return (
    <nav
      aria-label="Seções do app"
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 20,
        display: 'flex',
        background: semantico.superficie,
        borderTop: `1px solid ${semantico.divisor}`,
        // A barra invade a faixa do gesto de home do iPhone se não recuar.
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {ABAS.map((aba) => {
        const ativo = aba.id === atual
        return (
          <Link
            key={aba.id}
            href={aba.href}
            aria-current={ativo ? 'page' : undefined}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              padding: '8px 2px 10px',
              textDecoration: 'none',
              fontFamily: semantico.fonteRotulo,
              fontSize: 11,
              letterSpacing: 1.5,
              fontWeight: ativo ? 700 : 500,
              color: ativo ? semantico.acento : semantico.textoSecundario,
              // Redundância: a aba ativa não se distingue só pela cor — o
              // ícone preenchido e o peso da fonte já marcam; o border-top
              // branco de antes saiu porque colidiria com o preenchimento.
              borderTop: '2px solid transparent',
            }}
          >
            <IconeAba forma={aba.forma} ativo={ativo} />
            {aba.rotulo}
          </Link>
        )
      })}
    </nav>
  )
}
