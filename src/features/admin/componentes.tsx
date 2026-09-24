import Link from 'next/link'
import type { ReactNode } from 'react'
import { Abas } from '@/ui/controles'
import s from './Admin.module.css'

export type AreaAdmin = 'inicio' | 'usuarios' | 'afiliados' | 'backtest' | 'mapeamento' | 'mercados' | 'galeria'

const AREAS: { chave: AreaAdmin; rotulo: string; href: string }[] = [
  { chave: 'inicio', rotulo: 'Visão geral', href: '/admin' },
  { chave: 'usuarios', rotulo: 'Usuários', href: '/admin/usuarios' },
  { chave: 'afiliados', rotulo: 'Afiliados', href: '/admin/afiliados' },
  { chave: 'backtest', rotulo: 'Backtest', href: '/admin/backtest' },
  { chave: 'mapeamento', rotulo: 'Mapeamento', href: '/admin/mapeamento' },
  { chave: 'mercados', rotulo: 'Mercados', href: '/admin/mercados' },
  { chave: 'galeria', rotulo: 'Galeria', href: '/admin/galeria' },
]

/** Cabeçalho de toda tela do painel: título, apoio e as abas das áreas. */
export function CabecalhoAdmin({
  area,
  titulo,
  apoio,
  acao,
}: {
  area: AreaAdmin
  titulo: string
  apoio?: ReactNode
  acao?: ReactNode
}) {
  return (
    <div className={s.cabecalhoBloco}>
      <header className={s.cabecalho}>
        <div>
          <p className={s.sobrancelha}>Painel administrativo</p>
          <h1 className={s.titulo}>{titulo}</h1>
          {apoio && <p className={s.apoio}>{apoio}</p>}
        </div>
        {acao}
      </header>
      <Abas
        rotulo="Áreas do painel"
        abas={AREAS.map((a) => ({ chave: a.chave, rotulo: a.rotulo, href: a.href, ativo: a.chave === area }))}
      />
    </div>
  )
}

/** Cartão de métrica: rótulo pequeno em cima, número grande embaixo. */
export function Metrica({
  rotulo,
  valor,
  apoio,
  destaque = false,
}: {
  rotulo: string
  valor: ReactNode
  apoio?: ReactNode
  destaque?: boolean
}) {
  return (
    <div className={s.metrica} data-destaque={destaque}>
      <dt className={s.metricaRotulo}>{rotulo}</dt>
      <dd className={`${s.metricaValor} num`}>{valor}</dd>
      {apoio !== undefined && <dd className={s.metricaApoio}>{apoio}</dd>}
    </div>
  )
}

export function GradeDeMetricas({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <dl className={s.metricas} aria-label={rotulo}>
      {children}
    </dl>
  )
}

/** Um bloco do painel: título, apoio e conteúdo, numa superfície. */
export function Painel({
  titulo,
  apoio,
  id,
  largo = false,
  acao,
  children,
}: {
  titulo: string
  apoio?: ReactNode
  id?: string
  largo?: boolean
  acao?: ReactNode
  children: ReactNode
}) {
  return (
    <section className={s.painel} data-largo={largo} id={id} aria-labelledby={id ? `${id}-titulo` : undefined}>
      <header className={s.painelCabecalho}>
        <div>
          <h2 className={s.painelTitulo} id={id ? `${id}-titulo` : undefined}>
            {titulo}
          </h2>
          {apoio && <p className={s.painelApoio}>{apoio}</p>}
        </div>
        {acao}
      </header>
      {children}
    </section>
  )
}

/** Pílula de status — cor só quando o status pede atenção. */
export function Status({ valor }: { valor: string }) {
  const tom =
    valor === 'ATIVO' || valor === 'ATIVA' || valor === 'CONFIRMADA' || valor === 'CONFIRMADO'
      ? 'bom'
      : valor === 'BLOQUEADO' || valor === 'SUSPENSO' || valor === 'ENCERRADA'
        ? 'ruim'
        : 'neutro'
  const rotulo = valor.charAt(0) + valor.slice(1).toLowerCase().replace(/_/g, ' ')
  return (
    <span className={s.status} data-tom={tom}>
      {rotulo}
    </span>
  )
}

/** Aviso em linha (status do sistema, não erro de formulário). */
export function Aviso({ children, tom = 'info' }: { children: ReactNode; tom?: 'info' | 'atencao' }) {
  return (
    <p role="status" className={s.aviso} data-tom={tom}>
      {children}
    </p>
  )
}

export function Vazio({ children }: { children: ReactNode }) {
  return <p className={s.vazio}>{children}</p>
}

/** Atalho do hub do painel. */
export function Atalho({
  href,
  titulo,
  texto,
  numero,
}: {
  href: string
  titulo: string
  texto: string
  numero?: ReactNode
}) {
  return (
    <Link href={href} className={s.atalho}>
      <span className={s.atalhoTopo}>
        <strong>{titulo}</strong>
        {numero !== undefined && <span className={`${s.atalhoNumero} num`}>{numero}</span>}
      </span>
      <span className={s.atalhoTexto}>{texto}</span>
    </Link>
  )
}

/** Campo de formulário: rótulo ACIMA, dica abaixo. */
export function Campo({ rotulo, dica, children }: { rotulo: string; dica?: string; children: ReactNode }) {
  return (
    <label className={s.campo}>
      <span className={s.campoRotulo}>{rotulo}</span>
      {children}
      {dica && <span className={s.campoDica}>{dica}</span>}
    </label>
  )
}
