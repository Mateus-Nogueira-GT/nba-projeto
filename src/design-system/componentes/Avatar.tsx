import { FotoJogador } from './FotoJogador'
import type { NivelApito } from '../../modules/motor/tipos'
import { componente } from '../tokens/componente'
import { semantico } from '../tokens/semantico'
import { APITO, TURBO } from '../tokens/css'

export function iniciaisDe(nome: string): string {
  return nome
    .split(/\s+/)
    .filter((p) => /[a-zà-ú]/i.test(p))
    .slice(0, 2)
    .map((p) => (p.replace(/[^a-zà-ú]/gi, '')[0] ?? '').toUpperCase())
    .join('')
}

const FUNDOS = [
  semantico.superficieElevada,
  semantico.avatarFundo2,
  semantico.avatarFundo3,
  semantico.avatarFundo4,
  semantico.avatarFundo5,
  semantico.avatarFundo6,
] as const

export function fundoDoTime(sigla: string): string {
  let h = 0
  for (const c of sigla) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return FUNDOS[h % FUNDOS.length]!
}

/**
 * O rosto do jogador nos cards. Foto quando disponível, monograma quando não —
 * mas o anel colorido do apito NUNCA é o único canal: o numeral `N{n}`/`T`
 * fica sobreposto no canto, redundância obrigatória (regra de acessibilidade
 * do projeto: cor nunca é canal único). `nivelApito` null = sem anel.
 */
export function Avatar({
  nome,
  fotoUrl,
  timeSigla,
  nivelApito,
  turbo = false,
  tamanho = 52,
  raio = 12,
}: {
  nome: string
  fotoUrl: string | null
  timeSigla: string
  nivelApito: NivelApito | null
  turbo?: boolean
  tamanho?: number
  /** Raio do rosto. 12 nos cards; 16 no hero do perfil (artboard da 04). */
  raio?: number
}) {
  const anel = nivelApito === null ? null : turbo ? TURBO : APITO[nivelApito]
  const selo = nivelApito === null ? null : turbo ? 'T' : `N${nivelApito}`

  return (
    <div style={{ position: 'relative', width: tamanho, height: tamanho, flexShrink: 0 }}>
      <div
        aria-hidden
        style={{
          width: '100%',
          height: '100%',
          borderRadius: raio,
          overflow: 'hidden',
          background: fundoDoTime(timeSigla),
          border: anel
            ? `${componente.avatarAnelEspessura} solid ${anel.cor}`
            : `1px solid ${semantico.divisor}`,
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <FotoJogador
          key={fotoUrl}
          fotoUrl={fotoUrl}
          tamanho={tamanho}
          iniciais={iniciaisDe(nome)}
        />
      </div>
      {anel && (
        <span
          aria-label={turbo ? 'Turbo' : `Nível do apito ${nivelApito}`}
          style={{
            position: 'absolute',
            right: -4,
            bottom: -4,
            fontSize: 9,
            fontWeight: 700,
            fontFamily: semantico.fonteRotulo,
            color: semantico.textoSobreCor,
            background: anel.cor,
            borderRadius: 5,
            padding: '1px 4px',
            lineHeight: 1.4,
          }}
        >
          {selo}
        </span>
      )}
    </div>
  )
}
