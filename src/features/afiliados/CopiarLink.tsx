'use client'

import { useState } from 'react'
import s from '@/features/admin/Admin.module.css'

/** Copia o link ABSOLUTO (origem do app + caminho) para a área de transferência. */
export function CopiarLink({ caminho }: { caminho: string }) {
  const [estado, setEstado] = useState<'pronto' | 'copiado' | 'erro'>('pronto')
  return (
    <button
      className={s.botaoSecundario}
      type="button"
      aria-live="polite"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(new URL(caminho, window.location.origin).toString())
          setEstado('copiado')
        } catch {
          setEstado('erro')
        }
      }}
    >
      {estado === 'copiado' ? 'Copiado' : estado === 'erro' ? 'Não foi possível copiar' : 'Copiar link'}
    </button>
  )
}
