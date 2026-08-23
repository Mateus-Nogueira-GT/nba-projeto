import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'

import { RegistrarServiceWorker } from '@/components/pwa'
import { semantico } from '@/design-system/tokens/semantico'

import '@/design-system/tokens/tokens.css'
import './globals.css'

export const metadata: Metadata = {
  applicationName: 'IA da NBA',
  title: { default: 'IA da NBA', template: '%s · IA da NBA' },
  description: 'Leitura rápida de entradas e estatísticas da NBA.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'IA da NBA',
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
  themeColor: semantico.textoSobreCor,
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <RegistrarServiceWorker />
        {children}
      </body>
    </html>
  )
}
