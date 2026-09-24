import Link from 'next/link'
import type { ReactNode } from 'react'
import { ROTULO_DO_NIVEL, type NivelPago } from '@/modules/plataforma/assinatura/nivel-do-plano'
import { IconeVoltar } from '@/ui/icones'
import { dataHora, SOBRANCELHA_STATS } from './regras'
import s from './Comum.module.css'

/** Topo de toda tela da aba: voltar, a fronteira "dado canônico", título e ações. */
export function CabecalhoStats({
  voltar,
  titulo,
  apoio,
  acoes,
  icone,
  sobretitulo,
}: {
  /** Com sobretítulo, o título sai na voz da marca (Bebas), como nas seções principais. */
  sobretitulo?: string
  voltar?: { href: string; rotulo: string }
  titulo: ReactNode
  apoio?: ReactNode
  acoes?: ReactNode
  icone?: ReactNode
}) {
  return (
    <header className={s.cabecalho}>
      <div className={s.sobrancelhaLinha}>
        {voltar && (
          <Link href={voltar.href} className={s.voltar}>
            <IconeVoltar tamanho={20} /> {voltar.rotulo}
          </Link>
        )}
        <span className={s.sobrancelha}>{SOBRANCELHA_STATS}</span>
      </div>
      <div className={s.tituloLinha}>
        {icone}
        <div className={s.tituloTexto}>
          {sobretitulo && <span className="sobretitulo-marca">{sobretitulo}</span>}
          <h1 className={sobretitulo ? 'titulo-marca' : s.titulo}>{titulo}</h1>
          {apoio && <div className={s.apoio}>{apoio}</div>}
        </div>
        {acoes && <div className={s.acoes}>{acoes}</div>}
      </div>
    </header>
  )
}

/** Seção com título pequeno em caixa-alta e o auxiliar à direita ("temporada 2025-26"). */
export function SecaoStats({
  titulo,
  aux,
  acao,
  id,
  children,
}: {
  titulo: string
  aux?: string
  acao?: ReactNode
  id?: string
  children: ReactNode
}) {
  return (
    <section className={s.secao} id={id} aria-label={titulo}>
      <div className={s.secaoTopo}>
        <h2 className={s.secaoTitulo}>{titulo}</h2>
        {aux && <span className={s.secaoAux}>{aux}</span>}
        {acao}
      </div>
      {children}
    </section>
  )
}

const FAIXAS_DA_NOTA = [
  { minimo: 9, classe: s.notaExcepcional },
  { minimo: 8, classe: s.notaOtima },
  { minimo: 7, classe: s.notaBoa },
  { minimo: 6, classe: s.notaMediana },
  { minimo: 0, classe: s.notaFraca },
] as const

/**
 * A nota da partida (3 a 10, Game Score de Hollinger). Paleta PRÓPRIA — ela
 * mede desempenho já acontecido, não a força de um sinal.
 */
export function NotaPartida({ nota, destaque = false }: { nota: number | null; destaque?: boolean }) {
  if (nota === null) return <span className={s.fraco}>—</span>
  const faixa = FAIXAS_DA_NOTA.find((f) => nota >= f.minimo) ?? FAIXAS_DA_NOTA[4]
  return (
    <span className={`${s.nota} ${faixa.classe} ${destaque ? s.notaDestaque : ''} num`}>
      {nota.toFixed(1).replace('.', ',')}
    </span>
  )
}

/** Os últimos resultados como pontos NOMEADOS — cor nunca é o único canal. */
export function FormaVD({ forma }: { forma: readonly ('V' | 'D')[] }) {
  if (forma.length === 0) return <span className={s.fraco}>—</span>
  return (
    <span className={s.forma}>
      {forma.map((r, i) => (
        <span key={i} role="img" aria-label={r === 'V' ? 'vitória' : 'derrota'} className={s.formaPonto} data-r={r}>
          {r}
        </span>
      ))}
    </span>
  )
}

function decorrido(em: Date, agora: Date): string {
  const segundos = Math.max(0, Math.round((agora.getTime() - em.getTime()) / 1000))
  if (segundos < 60) return 'agora mesmo'
  const minutos = Math.round(segundos / 60)
  if (minutos < 60) return `há ${minutos} min`
  const horas = Math.round(minutos / 60)
  if (horas < 24) return `há ${horas} h`
  return `há ${Math.round(horas / 24)} d`
}

/** Toda tela da aba informa o horário do dado — relativo para decidir, absoluto para conferir. */
export function UltimaAtualizacao({ em, fonte, agora, fuso }: { em: Date; fonte: string; agora: Date; fuso: string }) {
  const vazio = em.getTime() === 0
  return (
    <footer className={s.atualizacao}>
      <span>Última atualização:</span>
      {vazio ? (
        <strong>sem dado para exibir</strong>
      ) : (
        <>
          <strong>{decorrido(em, agora)}</strong>
          <span aria-hidden>·</span>
          <time dateTime={em.toISOString()}>{dataHora(em, fuso)}</time>
          <span aria-hidden>·</span>
          <span>{fonte}</span>
        </>
      )}
    </footer>
  )
}

/**
 * O conteúdo MVP visto por quem é GRÁTIS: a FORMA do bloco, sem dado nenhum
 * (nada pago chega ao HTML), e o convite por cima.
 */
export function Silhueta({
  forma,
  recurso,
  voltar,
  minimo = 'MVP',
}: {
  forma: 'tabela' | 'cards' | 'numeros'
  recurso: string
  voltar: string
  minimo?: NivelPago
}) {
  const blocos = forma === 'cards' ? 3 : 6
  return (
    <div className={s.silhueta}>
      <div className={`${s.silhuetaForma} ${s[`forma_${forma}`]}`} aria-hidden>
        {Array.from({ length: blocos }, (_, i) => (
          <span key={i} className={s.silhuetaBloco} />
        ))}
      </div>
      <div className={s.convite}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <rect x="4" y="9" width="12" height="8" rx="2" />
          <path d="M7 9V6a3 3 0 0 1 6 0v3" />
        </svg>
        <p className={s.conviteTitulo}>
          {recurso} começa no plano {ROTULO_DO_NIVEL[minimo]}
        </p>
        <Link href={`/assinar?nivel=${minimo}&voltar=${encodeURIComponent(voltar)}`} className={s.conviteAcao}>
          Ver planos
        </Link>
      </div>
    </div>
  )
}

export type Coluna<T> = {
  chave: string
  rotulo: string
  descricao?: string
  alinhamento?: 'esquerda' | 'direita' | 'centro'
  fixa?: boolean
  destaque?: boolean
  /** Some quando a tabela estiver estreita (container < 720px). */
  secundaria?: boolean
  celula: (linha: T) => ReactNode
}

/**
 * Tabela densa da aba: cabeçalho com `abbr`, coluna fixa, rolagem horizontal
 * alcançável pelo teclado e `caption` para leitor de tela.
 */
export function TabelaDados<T>({
  legenda,
  colunas,
  linhas,
  chaveDaLinha,
  vazio = 'Sem dados para exibir.',
  separadorApos,
  linhaAtual,
}: {
  legenda: string
  colunas: Coluna<T>[]
  linhas: readonly T[]
  chaveDaLinha: (l: T) => string
  vazio?: string
  separadorApos?: (l: T) => boolean
  linhaAtual?: (l: T) => boolean
}) {
  if (linhas.length === 0) return <p className={s.vazioTexto}>{vazio}</p>
  const classe = (c: Coluna<T>) =>
    [
      c.alinhamento === 'direita' ? s.direita : c.alinhamento === 'centro' ? s.centro : '',
      c.fixa ? s.fixa : '',
      c.destaque ? s.destaque : '',
      c.secundaria ? s.secundaria : '',
    ].join(' ')
  return (
    <div className={s.tabelaMoldura}>
      <div className={s.rolagem} tabIndex={0} role="region" aria-label={legenda}>
        <table className={s.tabela}>
          <caption className="so-leitor">{legenda}</caption>
          <thead>
            <tr>
              {colunas.map((c) => (
                <th key={c.chave} scope="col" className={classe(c)} abbr={c.descricao} title={c.descricao}>
                  {c.rotulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr
                key={chaveDaLinha(l)}
                className={separadorApos?.(l) ? s.separador : undefined}
                aria-current={linhaAtual?.(l) ? 'true' : undefined}
              >
                {colunas.map((c, i) =>
                  i === 0 ? (
                    <th key={c.chave} scope="row" className={classe(c)}>
                      {c.celula(l)}
                    </th>
                  ) : (
                    <td key={c.chave} className={`${classe(c)} num`}>
                      {c.celula(l)}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
