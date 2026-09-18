import type { ReactNode } from 'react'

import estilos from './Lateral.module.css'

/**
 * O cartão de um bloco da lateral — título em rótulo e o conteúdo abaixo.
 *
 * Em arquivo próprio para os três blocos o importarem sem que nenhum deles
 * precise importar os outros: `ClassificacaoCompacta` e `DocaDoAssistente` são
 * componentes de cliente, e um `Bloco` morando dentro de `Lateral.tsx` (que é
 * de servidor) arrastaria a lateral inteira para o cliente.
 */
export function Bloco({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className={estilos.bloco}>
      <h2 className={estilos.titulo}>{titulo}</h2>
      {children}
    </section>
  )
}
