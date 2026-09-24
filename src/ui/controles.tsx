import Link from 'next/link'
import type { ReactNode } from 'react'
import s from './controles.module.css'

type OpcaoSegmentada = { valor: string; rotulo: ReactNode; href: string; ativo: boolean }

/**
 * Controle segmentado ("5 jogos | 10 jogos"). Cada opção é um LINK — o estado
 * mora na URL. Quando a escolha também precisa ser gravada na conta, passe
 * `acao`: as opções viram botões de um form que chama a server action.
 */
export function Segmentado({
  rotulo,
  opcoes,
  acao,
  campo,
  destino,
  compacto = false,
}: {
  rotulo: string
  opcoes: OpcaoSegmentada[]
  acao?: (dados: FormData) => Promise<void>
  campo?: string
  destino?: string
  compacto?: boolean
}) {
  const classe = `${s.segmentado} ${compacto ? s.compacto : ''}`
  if (acao && campo) {
    return (
      <form action={acao} className={classe} role="group" aria-label={rotulo}>
        {destino !== undefined && <input type="hidden" name="destino" value={destino} />}
        {opcoes.map((o) => (
          <button
            key={o.valor}
            type="submit"
            name={campo}
            value={o.valor}
            className={s.segmento}
            aria-pressed={o.ativo}
          >
            {o.rotulo}
          </button>
        ))}
      </form>
    )
  }
  return (
    <nav className={classe} aria-label={rotulo}>
      {opcoes.map((o) => (
        <Link
          key={o.valor}
          href={o.href}
          scroll={false}
          className={s.segmento}
          aria-current={o.ativo ? 'true' : undefined}
        >
          {o.rotulo}
        </Link>
      ))}
    </nav>
  )
}

/** Abas com sublinhado — mercados da lista, abas do painel. */
export function Abas({
  rotulo,
  abas,
}: {
  rotulo: string
  abas: { chave: string; rotulo: ReactNode; href: string; ativo: boolean; contador?: number }[]
}) {
  return (
    <nav className={s.abas} aria-label={rotulo}>
      {abas.map((a) => (
        <Link
          key={a.chave}
          href={a.href}
          scroll={false}
          className={s.aba}
          aria-current={a.ativo ? 'page' : undefined}
        >
          {a.rotulo}
          {a.contador !== undefined && <span className={`${s.contadorAba} num`}>{a.contador}</span>}
        </Link>
      ))}
    </nav>
  )
}

/** Chip de filtro. Ativo = preenchido; o × limpa. */
export function Chip({
  href,
  ativo = false,
  children,
}: {
  href: string
  ativo?: boolean
  children: ReactNode
}) {
  return (
    <Link href={href} scroll={false} className={s.chip} aria-current={ativo ? 'true' : undefined}>
      {children}
    </Link>
  )
}

/** Botão secundário de contorno — "Filtros", "Limpar", "Como funciona". */
export function BotaoContorno({
  href,
  children,
  icone,
}: {
  href: string
  children: ReactNode
  icone?: ReactNode
}) {
  return (
    <Link href={href} className={s.contorno}>
      {icone}
      {children}
    </Link>
  )
}
