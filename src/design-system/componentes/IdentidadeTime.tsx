import type { CSSProperties } from 'react'

import { identidadeDoTime } from '../times'
import { semantico } from '../tokens/semantico'
import { LogoTime } from './LogoTime'

export type IdentidadeTimeProps = {
  sigla: string
  tamanhoLogo?: number
  disposicao?: 'linha' | 'coluna'
  alinhamento?: 'inicio' | 'centro' | 'fim'
  style?: CSSProperties
}

/**
 * Nome completo + marca, sem truncar nomes longos. O chamador escolhe o espaço
 * e a tipografia via style; minWidth: 0 permite quebrar dentro de grids/cards.
 * Ex.: <IdentidadeTime sigla="GSW" disposicao="coluna" alinhamento="centro" />.
 */
export function IdentidadeTime({
  sigla,
  tamanhoLogo = 24,
  disposicao = 'linha',
  alinhamento = 'inicio',
  style,
}: IdentidadeTimeProps) {
  const time = identidadeDoTime(sigla)
  const alinha = { inicio: 'flex-start', centro: 'center', fim: 'flex-end' } as const
  const texto = { inicio: 'left', centro: 'center', fim: 'right' } as const

  return (
    <span
      style={{
        display: 'inline-flex',
        flexDirection: disposicao === 'coluna' ? 'column' : 'row',
        alignItems: disposicao === 'coluna' ? alinha[alinhamento] : 'center',
        justifyContent: alinha[alinhamento],
        gap: 6,
        minWidth: 0,
        maxWidth: '100%',
        fontFamily: semantico.fonteRotulo,
        fontSize: 12,
        fontWeight: 600,
        lineHeight: 1.25,
        color: semantico.texto70,
        textAlign: texto[alinhamento],
        ...style,
      }}
    >
      <LogoTime sigla={time.sigla} tamanho={tamanhoLogo} decorativo />
      <span style={{ minWidth: 0, whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
        {time.nome}
      </span>
    </span>
  )
}
