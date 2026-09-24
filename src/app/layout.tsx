import { Bebas_Neue, Montserrat } from 'next/font/google'
import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'

import { FaixaDemonstracao } from '@/features/shell/FaixaDemonstracao'
import { RegistrarServiceWorker } from '@/features/pwa/RegistrarServiceWorker'
import { marcaNip } from '@/ui/marca'
import { FUNDO_DO_TEMA_PADRAO, TEMA_PADRAO, scriptDoTema } from '@/features/shell/tema'

// Uma fonte de cor só: `src/ui/tokens.css` (base no `:root` e os três temas em
// `:root[data-tema=…]`). O `tokens.css` do design-system antigo, que entrava
// aqui depois deste para as telas antigas não mudarem de cor, saiu com elas na
// Tarefa 12 do front v2. O `globals.css` vem por último por ler os tokens.
import '@/ui/tokens.css'
import './globals.css'

// Fontes do Manual da Marca (identidade 05) — self-hosted em build pelo
// next/font/google, como as duas anteriores: zero request ao Google em runtime.
// A Bebas Neue só existe no peso 400; a Montserrat vem nos quatro pesos que o
// manual autoriza (o v2 usa 500–700, subconjunto destes — as telas antigas
// ainda usam o 400).
const bebas = Bebas_Neue({ weight: '400', subsets: ['latin'], variable: '--fonte-bebas' })
const montserrat = Montserrat({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  variable: '--fonte-montserrat',
})

export const metadata: Metadata = {
  applicationName: marcaNip.nome,
  title: { default: marcaNip.nome, template: `%s · ${marcaNip.nome}` },
  description: marcaNip.descricao,
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: marcaNip.nome,
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [
      { url: '/icons/app-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/app-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  colorScheme: 'dark',
  // A cor da barra do sistema é o FUNDO do app, não o `textoSobreCor` — que
  // por acaso era escuro e servia, mas descreve texto sobre cor, não superfície.
  // É o fundo do Marinho, o tema em que o HTML sai (o `semantico.fundo`
  // antigo era o navy de reserva do `:root`).
  themeColor: FUNDO_DO_TEMA_PADRAO,
}

export default function RootLayout({ children }: { children: ReactNode }) {
  // O tema mora no cookie `nip-tema`, mas o layout RAIZ não o lê: `cookies()`
  // aqui tornaria toda rota dinâmica, inclusive /offline e o 404. O HTML sai
  // estático no Marinho e o script do <head> troca o atributo antes da
  // primeira pintura; `suppressHydrationWarning` diz ao React que o `data-tema`
  // do DOM vence o do HTML. Tem que ser no <html>: é onde os seletores
  // `:root[data-tema=…]` de `src/ui/tokens.css` leem o atributo.
  return (
    <html
      lang="pt-BR"
      className={`${bebas.variable} ${montserrat.variable}`}
      data-tema={TEMA_PADRAO}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: scriptDoTema() }} />
      </head>
      <body>
        <RegistrarServiceWorker />
        <FaixaDemonstracao />
        {children}
      </body>
    </html>
  )
}
