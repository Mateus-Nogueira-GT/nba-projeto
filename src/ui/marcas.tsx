import type { Atributo, Nivel, NivelApito } from '@/modules/motor/tipos'
import { IconeFogo, IconeTurbo } from './icones'
import { linha as formatarLinha } from './formato'
import type { OddNaTela } from './odd'
import s from './marcas.module.css'

export const ROTULO_NIVEL: Record<Nivel, string> = {
  MVP: 'MVP',
  ALL_STAR: 'All-Star',
  SUPORTE: 'Suporte',
  RANDOLA: 'Randola',
}

export const ROTULO_ATRIBUTO: Record<Atributo, string> = {
  PONTOS: 'Pontos',
  REBOTES: 'Rebotes',
  ASSISTENCIAS: 'Assistências',
}

export const ATRIBUTO_CURTO: Record<Atributo, string> = {
  PONTOS: 'PTS',
  REBOTES: 'REB',
  ASSISTENCIAS: 'AST',
}

const CLASSE_NIVEL: Record<Nivel, string> = {
  MVP: s.mvp!,
  ALL_STAR: s.allStar!,
  SUPORTE: s.suporte!,
  RANDOLA: s.randola!,
}

/** Nível do JOGADOR — o único lugar onde ouro, prata e bronze aparecem. */
export function SeloNivel({ nivel }: { nivel: Nivel }) {
  return <span className={`${s.selo} ${CLASSE_NIVEL[nivel]}`}>{ROTULO_NIVEL[nivel]}</span>
}

/** Cor do nível do APITO, para quem desenha a borda da linha ou o anel do avatar. */
export function corDoApito(nivel: NivelApito, turbo: boolean): string {
  if (turbo) return 'var(--apito-turbo)'
  return `var(--apito-${nivel})`
}

/**
 * Nível do apito como sinal de força: três barras que acendem até o nível,
 * na cor dele. O texto "N3" acompanha — cor nunca é o único canal.
 */
export function IndicadorApito({
  nivel,
  turbo,
  opd = false,
  opdOrigemNivel = null,
}: {
  nivel: NivelApito
  turbo: boolean
  opd?: boolean
  /** Nível do apito OPD pré-live que este item cruzou (só no Fire Live). */
  opdOrigemNivel?: NivelApito | null
}) {
  const rotuloOpd = opdOrigemNivel !== null ? `OPD nível ${opdOrigemNivel}` : 'OPD'
  const rotulo = `Apito nível ${nivel}${turbo ? ', turbo' : ''}${opd || opdOrigemNivel !== null ? `, ${rotuloOpd.toLowerCase()}` : ''}`
  return (
    <span className={s.apito} style={{ color: corDoApito(nivel, turbo) }} role="img" aria-label={rotulo}>
      <span className={s.barras} aria-hidden>
        {[1, 2, 3].map((n) => (
          <span key={n} className={s.barra} data-aceso={n <= nivel} style={{ height: 4 + n * 3 }} />
        ))}
      </span>
      <span className={s.apitoTexto} aria-hidden>
        N{nivel}
      </span>
      {turbo && <IconeTurbo tamanho={14} className={s.turbo} />}
      {(opd || opdOrigemNivel !== null) && (
        <span className={s.opd} aria-hidden>
          {opdOrigemNivel !== null ? `OPD N${opdOrigemNivel}` : 'OPD'}
        </span>
      )}
    </span>
  )
}

/** Confiança da análise do CJ. NUNCA chamar de probabilidade. */
export function PilulaConfianca({ valor, grau }: { valor: number | null; grau: 1 | 2 | 3 | 4 | 5 | null }) {
  if (valor === null) return <span className={s.vazio}>—</span>
  const cor = grau === null ? 'var(--texto-2)' : `var(--confianca-${grau})`
  return (
    <span className={`${s.confianca} num`} style={{ color: cor }}>
      {Math.round(valor)}%
    </span>
  )
}

/** "+20,5 Pontos" — a linha do apito. Sem linha (Fire Live), só o mercado. */
export function PilulaMercado({
  linha,
  atributo,
  curto = false,
  texto = false,
  alvo1Q = null,
}: {
  linha: number | null
  atributo: Atributo
  curto?: boolean
  /** Sem moldura: número forte e mercado discreto, para linhas de tabela. */
  texto?: boolean
  /**
   * Sem linha pré-live, o apito nasceu no Fire Live: o que ele tem é ALVO do
   * 1º quarto. Alvo não leva "+" — é outra grandeza, de outra janela.
   */
  alvo1Q?: number | null
}) {
  const mercado = curto ? ATRIBUTO_CURTO[atributo] : ROTULO_ATRIBUTO[atributo]
  if (linha === null && alvo1Q !== null) {
    return (
      <span className={texto ? s.mercadoTexto : s.mercado}>
        <strong className="num">{alvo1Q}</strong>
        <span>{mercado} · alvo 1º Q</span>
      </span>
    )
  }
  return (
    <span className={texto ? s.mercadoTexto : s.mercado}>
      {linha !== null && <strong className="num">+{formatarLinha(linha)}</strong>}
      <span>{mercado}</span>
    </span>
  )
}

/**
 * MODO TURBO — o apito que atravessa os dois métodos, o sinal mais forte.
 * Reunião com os sócios (23/09/2026): tem de ser chamativo, "nível Zeus":
 * raio e fogo, brilho que corre pelo selo. O brilho é CSS puro, fica só no
 * selo (não ocupa a tela) e para com prefers-reduced-motion.
 */
export function SeloTurbo({ grande = false }: { grande?: boolean }) {
  return (
    <span className={s.turboSelo} data-grande={grande || undefined}>
      <IconeTurbo tamanho={grande ? 16 : 13} className={s.turboRaio} />
      <span className={s.turboTexto}>Turbo</span>
      <IconeFogo tamanho={grande ? 16 : 13} className={s.turboFogo} />
    </span>
  )
}

/** Modo fire: o alvo caiu para a fração da média que o ruleset define. */
export function SeloModoFire() {
  return <span className={s.modoFire}>Modo fire</span>
}

/**
 * A odd como CAIXA — a forma que o apostador reconhece das casas. A contagem
 * de casas sai da tela e vira `title`/leitor de tela: duas linhas de texto
 * onde deveria haver um número deixavam a coluna barulhenta.
 */
export function PilulaOdd({ odd }: { odd: OddNaTela | null }) {
  if (odd === null) return <span className={s.vazio}>—</span>
  const detalhe = [odd.rotulo === 'Odd média' ? 'odd média' : null, odd.apoio]
    .filter(Boolean)
    .join(' · ')
  return (
    <span
      className={`${s.oddCaixa} num`}
      data-media={odd.rotulo === 'Odd média' || undefined}
      title={detalhe || undefined}
    >
      {odd.valor}
      {detalhe && <span className="so-leitor"> ({detalhe})</span>}
    </span>
  )
}

/** Selo "AO VIVO" — o único uso do vermelho NIP. */
export function SeloAoVivo({ texto = 'Ao vivo' }: { texto?: string }) {
  return (
    <span className={s.aoVivo}>
      <span className={s.pulso} aria-hidden />
      {texto}
    </span>
  )
}
