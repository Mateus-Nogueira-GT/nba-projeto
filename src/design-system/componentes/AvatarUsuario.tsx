import Image from 'next/image'

import { iniciaisDe } from './Avatar'
import { semantico } from '../tokens/semantico'

export const AVATARES_PRONTOS = Array.from({ length: 8 }, (_, i) => `/avatares/0${i + 1}.svg`)

export type AvatarUsuarioProps = {
  nome: string | null
  email: string
  fotoUrl: string | null
  tamanho?: number
}

/**
 * O rosto da CONTA — não confundir com o `Avatar` do jogador, que carrega
 * anel de nível do apito e fundo do time. Sem foto, as iniciais do nome; sem
 * nome, a inicial do e-mail: nunca um quadrado vazio.
 *
 * `unoptimized`: os arquivos são locais e fixos (o catálogo de
 * `AVATARES_PRONTOS`) — não há CDN remoto nem variação de tamanho que
 * justifique passar pelo otimizador de imagem, e `unoptimized` é o que evita
 * que o `src` vire uma URL de `/_next/image` (mesma escolha de `LogoTime`).
 */
export function AvatarUsuario({ nome, email, fotoUrl, tamanho = 64 }: AvatarUsuarioProps) {
  const iniciais = nome && nome.trim() ? iniciaisDe(nome) : email.slice(0, 1).toUpperCase()
  return (
    <span
      style={{
        display: 'inline-grid',
        placeItems: 'center',
        width: tamanho,
        height: tamanho,
        borderRadius: 16,
        overflow: 'hidden',
        background: semantico.superficieElevada,
        border: `1px solid ${semantico.divisor}`,
        flexShrink: 0,
      }}
    >
      {fotoUrl ? (
        <Image
          src={fotoUrl}
          alt={nome ?? email}
          width={tamanho}
          height={tamanho}
          unoptimized
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <span
          aria-label={nome ?? email}
          style={{
            fontFamily: semantico.fonteTitulo,
            fontSize: tamanho * 0.36,
            color: semantico.textoSecundario,
            letterSpacing: 1,
          }}
        >
          {iniciais}
        </span>
      )}
    </span>
  )
}
