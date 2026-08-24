import Link from 'next/link'

import { semantico } from '@/design-system/tokens/semantico'

/**
 * BARRA DE NAVEGAÇÃO — as abas do produto.
 *
 * Até aqui cada tela era uma ilha ligada por links de rodapé: quem abria a
 * Lista Secreta não tinha como chegar ao Fire Live sem saber a URL. Cinco abas
 * é o teto de um polegar em tela de celular — Estatísticas e a aba teórica
 * ficam a um toque de distância dentro de "Conta".
 *
 * Componente de servidor de propósito: a aba ativa vem por props de quem
 * renderiza, não de `usePathname`. Uma barra de navegação não justifica
 * embarcar JavaScript em todas as páginas do app.
 */
export type Aba = 'lista' | 'fire-live' | 'resultados' | 'gestao' | 'conta'

const ABAS: { id: Aba; href: string; rotulo: string; icone: string }[] = [
  { id: 'lista', href: '/', rotulo: 'Lista', icone: '📋' },
  { id: 'fire-live', href: '/fire-live', rotulo: 'Ao vivo', icone: '🔥' },
  { id: 'resultados', href: '/resultados', rotulo: 'Resultados', icone: '✅' },
  { id: 'gestao', href: '/gestao', rotulo: 'Gestão', icone: '💰' },
  { id: 'conta', href: '/conta', rotulo: 'Conta', icone: '👤' },
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
              gap: 2,
              padding: '8px 2px 10px',
              textDecoration: 'none',
              fontSize: 10,
              fontWeight: ativo ? 700 : 500,
              color: ativo ? semantico.textoPrimario : semantico.textoSecundario,
              // Redundância: a aba ativa não se distingue só pela cor.
              borderTop: `2px solid ${ativo ? semantico.textoPrimario : 'transparent'}`,
            }}
          >
            <span aria-hidden style={{ fontSize: 17, lineHeight: 1 }}>
              {aba.icone}
            </span>
            {aba.rotulo}
          </Link>
        )
      })}
    </nav>
  )
}
