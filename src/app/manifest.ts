import type { MetadataRoute } from 'next'

import { semantico } from '@/design-system/tokens/semantico'
import { marcaNip } from '@/design-system/marca'

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: marcaNip.nome,
    short_name: marcaNip.nome,
    description: marcaNip.descricao,
    lang: 'pt-BR',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: semantico.textoSobreCor,
    theme_color: semantico.textoSobreCor,
    orientation: 'portrait-primary',
    icons: [
      { src: '/icons/app-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/app-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/app-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
