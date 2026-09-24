import Link from 'next/link'
import type { ReactNode } from 'react'
import s from './blocos.module.css'

/** Rótulo pequeno em cima, número grande (Bebas) embaixo. */
export function NumeroGrande({
  rotulo,
  valor,
  tom = 'neutro',
  apoio,
}: {
  rotulo: string
  valor: ReactNode
  tom?: 'neutro' | 'bom' | 'ruim'
  apoio?: ReactNode
}) {
  return (
    <div className={s.numero}>
      <dt className={s.numeroRotulo}>{rotulo}</dt>
      <dd className={`${s.numeroValor} num`} data-tom={tom}>
        {valor}
      </dd>
      {apoio !== undefined && <dd className={s.numeroApoio}>{apoio}</dd>}
    </div>
  )
}

/** Seção com título em caixa-alta pequena — o ritmo do painel de detalhe. */
export function Secao({
  titulo,
  apoio,
  acao,
  children,
}: {
  titulo: string
  apoio?: ReactNode
  acao?: ReactNode
  children: ReactNode
}) {
  return (
    <section className={s.secao}>
      <header className={s.secaoCabecalho}>
        <div>
          <h3 className={s.secaoTitulo}>{titulo}</h3>
          {apoio !== undefined && <p className={s.secaoApoio}>{apoio}</p>}
        </div>
        {acao}
      </header>
      {children}
    </section>
  )
}

/** Vazio com causa e saída — nunca uma tela em branco. */
export function EstadoVazio({
  icone,
  titulo,
  texto,
  acao,
}: {
  icone?: ReactNode
  titulo: string
  texto?: ReactNode
  acao?: { rotulo: string; href: string }
}) {
  return (
    <div className={s.vazio}>
      {icone && <span className={s.vazioIcone}>{icone}</span>}
      <p className={s.vazioTitulo}>{titulo}</p>
      {texto && <p className={s.vazioTexto}>{texto}</p>}
      {acao && (
        <Link href={acao.href} className={s.vazioAcao}>
          {acao.rotulo}
        </Link>
      )}
    </div>
  )
}

/** A faixa do topo: demonstração, convite do plano, atualização. Uma só. */
export function FaixaAviso({
  tom = 'info',
  children,
  acao,
}: {
  tom?: 'info' | 'convite'
  children: ReactNode
  acao?: { rotulo: string; href: string }
}) {
  return (
    <div className={s.faixa} data-tom={tom} role="note">
      <p className={s.faixaTexto}>{children}</p>
      {acao && (
        <Link href={acao.href} className={s.faixaAcao}>
          {acao.rotulo}
        </Link>
      )}
    </div>
  )
}

/** Botão primário (azul NIP). */
export function BotaoPrimario({
  href,
  children,
  externo = false,
}: {
  href: string
  children: ReactNode
  externo?: boolean
}) {
  return (
    <Link
      href={href}
      className={s.primario}
      {...(externo ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {children}
    </Link>
  )
}

/** Botão secundário (superfície). */
export function BotaoSecundario({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={s.secundario}>
      {children}
    </Link>
  )
}
