import type { MetadataRoute } from 'next'

import { FUNDO_DO_TEMA_PADRAO } from '@/features/shell/tema'
import { marcaNip } from '@/ui/marca'

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
    // A splash e a barra do sistema vestem o FUNDO do app — o mesmo `--fundo`
    // do Marinho que o `themeColor` do layout raiz usa: o HTML sai sempre nesse
    // tema, e a splash não pode abrir numa cor que a primeira pintura troca.
    // (Até a Tarefa 12 do front v2 era o `semantico.fundo` do design-system
    // antigo, o navy de reserva do `:root`, que não é o tema em que o app abre.)
    background_color: FUNDO_DO_TEMA_PADRAO,
    theme_color: FUNDO_DO_TEMA_PADRAO,
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
