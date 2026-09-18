import { Bebas_Neue, Montserrat } from 'next/font/google'
import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'

import { FaixaDemonstracao } from '@/components/navegacao'
import { RegistrarServiceWorker } from '@/components/pwa'
import { semantico } from '@/design-system/tokens/semantico'
import { marcaNip } from '@/design-system/marca'

import '@/design-system/tokens/tokens.css'
import './globals.css'

// Fontes do Manual da Marca (identidade 05) — self-hosted em build pelo
// next/font/google, como as duas anteriores: zero request ao Google em runtime.
// A Bebas Neue só existe no peso 400; a Montserrat vem nos quatro pesos que o
// manual autoriza.
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
  themeColor: semantico.fundo,
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={`${bebas.variable} ${montserrat.variable}`}>
      <body>
        <RegistrarServiceWorker />
        <FaixaDemonstracao />
        {children}
      </body>
    </html>
  )
}
