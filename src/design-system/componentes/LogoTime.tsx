'use client'

import Image from 'next/image'
import { useState } from 'react'

import { identidadeDoTime } from '../times'
import { semantico } from '../tokens/semantico'

export type LogoTimeProps = {
  sigla: string
  tamanho?: number
  /** Use true somente quando o nome do time já acompanha o logo. */
  decorativo?: boolean
}

/** Marca local; sem arquivo ou com erro de carga, a sigla ocupa o mesmo espaço. */
export function LogoTime({ sigla, tamanho = 24, decorativo = false }: LogoTimeProps) {
  const time = identidadeDoTime(sigla)
  const [urlComErro, setUrlComErro] = useState<string | null>(null)
  const temLogo = time.logoUrl !== null && time.logoUrl !== urlComErro

  return (
    <span
      role={decorativo ? undefined : 'img'}
      aria-label={decorativo ? undefined : time.nome}
      aria-hidden={decorativo || undefined}
      style={{
        display: 'inline-grid',
        placeItems: 'center',
        width: tamanho,
        height: tamanho,
        flexShrink: 0,
        verticalAlign: 'middle',
      }}
    >
      {temLogo ? (
        <Image
          src={time.logoUrl!}
          alt=""
          width={tamanho}
          height={tamanho}
          unoptimized
          onError={() => setUrlComErro(time.logoUrl)}
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      ) : (
        <span
          aria-hidden
          style={{
            fontFamily: semantico.fonteRotulo,
            fontSize: Math.max(9, tamanho * 0.35),
            fontWeight: 700,
            color: semantico.texto70,
            lineHeight: 1,
          }}
        >
          {time.sigla}
        </span>
      )}
    </span>
  )
}
