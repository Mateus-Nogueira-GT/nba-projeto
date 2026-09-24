'use client'

import Image from 'next/image'
import { useState } from 'react'
import { fotoDeReserva } from './fotos'
import { identidadeDoTime } from './times'
import s from './midia.module.css'

/** Primeira letra do primeiro e do último nome — o monograma de quem está sem foto. */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/)
  const primeira = partes[0]?.[0] ?? ''
  const ultima = partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? '') : ''
  return (primeira + ultima).toUpperCase()
}

/**
 * Foto do jogador com anel opcional (a cor do nível do apito). Sem foto, ou se
 * o CDN falhar, mostra as iniciais — nunca um buraco.
 */
export function FotoJogador({
  nome,
  fotoUrl,
  tamanho = 40,
  anel,
  timeSigla,
}: {
  nome: string
  fotoUrl: string | null
  tamanho?: number
  anel?: string
  timeSigla?: string
}) {
  const [falhou, setFalhou] = useState(false)
  const url = fotoUrl ?? fotoDeReserva(nome)
  const mostrarFoto = url !== null && !falhou
  return (
    <span
      className={s.foto}
      style={{ width: tamanho, height: tamanho, boxShadow: anel ? `0 0 0 2px var(--fundo), 0 0 0 4px ${anel}` : undefined }}
    >
      {mostrarFoto ? (
        <Image
          src={url}
          alt=""
          width={tamanho * 2}
          height={tamanho * 2}
          className={s.imagem}
          onError={() => setFalhou(true)}
        />
      ) : (
        <span className={s.iniciais} style={{ fontSize: tamanho * 0.36 }} aria-hidden>
          {iniciais(nome)}
        </span>
      )}
      {timeSigla && (
        <span className={s.escudo} aria-hidden>
          <LogoTime sigla={timeSigla} tamanho={Math.round(tamanho * 0.4)} />
        </span>
      )}
    </span>
  )
}

/** Logo do time (SVG local). Se não houver, a sigla. Decorativo: o texto ao lado nomeia o time. */
export function LogoTime({ sigla, tamanho = 24 }: { sigla: string; tamanho?: number }) {
  const [falhou, setFalhou] = useState(false)
  const time = identidadeDoTime(sigla)
  if (!time.logoUrl || falhou) {
    return (
      <span className={s.sigla} style={{ width: tamanho, height: tamanho, fontSize: Math.max(8, tamanho * 0.34) }} aria-hidden>
        {time.sigla}
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- SVG local, sem otimização a fazer
    <img
      src={time.logoUrl}
      alt=""
      width={tamanho}
      height={tamanho}
      className={s.logo}
      onError={() => setFalhou(true)}
    />
  )
}
