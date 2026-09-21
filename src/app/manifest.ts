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
    // A ABERTURA decide: Ao Vivo quando há jogo no 1º quarto, a Lista no resto
    // do dia. `/` continua sendo a Lista — quem muda é por onde o app entra.
    start_url: '/abrir',
    scope: '/',
    display: 'standalone',
    // A splash e a barra do sistema vestem o FUNDO do app (o `textoSobreCor`
    // era escuro e servia por acaso, mas descreve texto sobre cor).
    background_color: semantico.fundo,
    theme_color: semantico.fundo,
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
