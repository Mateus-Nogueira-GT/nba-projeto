'use client'

import { useState } from 'react'
import estilos from './PainelComercial.module.css'

export function CopiarLink({ caminho }: { caminho: string }) {
  const [estado, setEstado] = useState<'pronto' | 'copiado' | 'erro'>('pronto')
  return (
    <button
      className={estilos.botaoSecundario}
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(new URL(caminho, window.location.origin).toString())
          setEstado('copiado')
        } catch {
          setEstado('erro')
        }
      }}
    >
      {estado === 'copiado'
        ? 'Copiado'
        : estado === 'erro'
          ? 'Não foi possível copiar'
          : 'Copiar link'}
    </button>
  )
}
