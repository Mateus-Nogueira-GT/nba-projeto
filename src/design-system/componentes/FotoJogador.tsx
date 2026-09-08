'use client'

import Image from 'next/image'
import { useState } from 'react'
import { semantico } from '../tokens/semantico'

/** O monograma permanece disponível se o CDN ou o otimizador falhar. */
export function FotoJogador({
  fotoUrl,
  tamanho,
  iniciais,
}: {
  fotoUrl: string | null
  tamanho: number
  iniciais: string
}) {
  const [falhou, setFalhou] = useState(false)
  return fotoUrl && !falhou ? (
    <Image
      src={fotoUrl}
      alt=""
      width={tamanho}
      height={tamanho}
      sizes={`${tamanho}px`}
      onError={() => setFalhou(true)}
      style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }}
    />
  ) : (
    <span
      style={{
        fontFamily: semantico.fonteTitulo,
        fontSize: tamanho * 0.34,
        color: semantico.textoSecundario,
        letterSpacing: 1,
      }}
    >
      {iniciais}
    </span>
  )
}
