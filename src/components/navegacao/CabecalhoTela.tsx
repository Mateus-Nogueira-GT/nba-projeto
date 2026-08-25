import Link from 'next/link'
import type { ReactNode } from 'react'

import { semantico } from '@/design-system/tokens/semantico'

/**
 * CABEÇALHO PADRÃO — sobrancelha + título, usado por todas as telas.
 *
 * "Sobrancelha" é o rótulo pequeno acima do título (ex.: "LISTA SECRETA ·
 * PRÉ-LIVE"). O marcador ao lado dela troca de cor conforme o contexto: laranja
 * (`semantico.acento`) por padrão, vermelho (`semantico.aoVivo`) quando a tela
 * é de transmissão ao vivo — sinal redundante ao texto da própria sobrancelha,
 * nunca o único.
 *
 * Componente de servidor: sem estado, sem hook. `children` recebe os chips de
 * filtro que algumas telas colocam sob o título (ver `Chip` abaixo).
 */
export function CabecalhoTela({
  sobrancelha,
  titulo,
  contexto = 'padrao',
  voltarHref,
  children,
}: {
  sobrancelha: string
  titulo: string
  contexto?: 'padrao' | 'aoVivo'
  voltarHref?: string
  children?: ReactNode
}) {
  const corMarcador = contexto === 'aoVivo' ? semantico.aoVivo : semantico.acento

  return (
    <header style={{ marginBottom: 16 }}>
      <p
        style={{
          margin: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontFamily: semantico.fonteRotulo,
          fontSize: 12,
          letterSpacing: 2,
          color: corMarcador,
          textTransform: 'uppercase',
        }}
      >
        {voltarHref ? (
          <Link
            href={voltarHref}
            aria-label="Voltar"
            style={{
              display: 'grid',
              placeItems: 'center',
              width: 34,
              height: 34,
              borderRadius: 10,
              border: `1.5px solid ${semantico.acento}`,
              color: semantico.acento,
              textDecoration: 'none',
            }}
          >
            ←
          </Link>
        ) : (
          <span
            aria-hidden
            style={{
              width: 8,
              height: 8,
              background: corMarcador,
              transform: contexto === 'aoVivo' ? undefined : 'rotate(45deg)',
            }}
          />
        )}
        {sobrancelha}
      </p>
      <h1
        style={{
          margin: '6px 0 0',
          fontFamily: semantico.fonteTitulo,
          fontSize: 30,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
        }}
      >
        {titulo}
      </h1>
      {children && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>{children}</div>
      )}
    </header>
  )
}

/**
 * CHIP — filtro em forma de pílula sob o cabeçalho. Contorno e texto viram
 * `semantico.acento` quando ativo; senão contorno neutro (`semantico.divisor`)
 * e texto secundário. `aria-current="page"` marca o estado para leitor de
 * tela, redundante com a cor.
 */
export function Chip({
  href,
  ativo,
  children,
}: {
  href: string
  ativo: boolean
  children: ReactNode
}) {
  return (
    <Link
      href={href}
      aria-current={ativo ? 'page' : undefined}
      style={{
        padding: '5px 14px',
        borderRadius: 999,
        fontFamily: semantico.fonteRotulo,
        fontSize: 13,
        letterSpacing: 1,
        textTransform: 'uppercase',
        textDecoration: 'none',
        fontWeight: ativo ? 700 : 600,
        color: ativo ? semantico.textoSobreCor : semantico.textoSecundario,
        border: `1.5px solid ${ativo ? semantico.acento : semantico.divisor}`,
        background: ativo ? semantico.acento : 'transparent',
      }}
    >
      {children}
    </Link>
  )
}
