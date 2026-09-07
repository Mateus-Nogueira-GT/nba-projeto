import Link from 'next/link'
import type { ReactNode } from 'react'

import { semantico } from '@/design-system/tokens/semantico'

/** Uma opção de seletor ou de lente: o valor identifica a ativa, o href leva até ela. */
export type OpcaoDeNavegacao = { valor: string; rotulo: string; href: string }

export type GrupoDeOpcoes = {
  opcoes: OpcaoDeNavegacao[]
  /** `valor` da opção ativa. */
  ativa: string
  /** Nome do grupo para leitor de tela. */
  rotulo?: string
}

/**
 * CABEÇALHO PADRÃO — sobrancelha + título, usado por todas as telas.
 *
 * "Sobrancelha" é o rótulo pequeno acima do título (ex.: "LISTA SECRETA ·
 * PRÉ-LIVE"). O marcador ao lado dela troca de cor conforme o contexto: laranja
 * (`semantico.acento`) por padrão, vermelho (`semantico.aoVivo`) quando a tela
 * é de transmissão ao vivo — sinal redundante ao texto da própria sobrancelha,
 * nunca o único.
 *
 * Identidade 04 — quatro slots OPCIONAIS, todos ausentes nas telas que não os
 * pedem (a saída sem eles é a de sempre):
 *   `selo`     o SeloContexto preenchido no canto direito, na altura do título
 *   `seletor`  o segmentado POR JOGO · POR NÍVEL (ou HOJE · RESULTADOS)
 *   `acoes`    o que fica à direita do seletor — o botão FILTRAR da folha
 *   `lentes`   a fileira de lentes que troca a zona 2 de TODOS os cards
 *
 * Componente de servidor: sem estado, sem hook. `children` recebe os chips de
 * filtro (ou o subtítulo) que algumas telas colocam sob o título (ver `Chip`).
 */
export function CabecalhoTela({
  sobrancelha,
  titulo,
  contexto = 'padrao',
  voltarHref,
  selo,
  seletor,
  acoes,
  lentes,
  children,
}: {
  sobrancelha: string
  titulo: string
  contexto?: 'padrao' | 'aoVivo'
  voltarHref?: string
  selo?: ReactNode
  seletor?: GrupoDeOpcoes
  acoes?: ReactNode
  lentes?: GrupoDeOpcoes
  children?: ReactNode
}) {
  const corMarcador = contexto === 'aoVivo' ? semantico.aoVivo : semantico.acento

  return (
    <header style={{ marginBottom: 16 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div>
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
        </div>
        {selo}
      </div>
      {children && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>{children}</div>
      )}
      {(seletor || acoes) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            marginTop: 16,
          }}
        >
          {seletor ? <Seletor {...seletor} /> : <span />}
          {acoes}
        </div>
      )}
      {lentes && <Lentes {...lentes} />}
    </header>
  )
}

/**
 * SELETOR SEGMENTADO — POR JOGO · POR NÍVEL. A opção ativa é preenchida no
 * acento e marcada com `aria-current`, redundante com a cor.
 */
function Seletor({ opcoes, ativa, rotulo = 'Ordenação' }: GrupoDeOpcoes) {
  return (
    <nav
      aria-label={rotulo}
      style={{
        display: 'inline-flex',
        border: `1.5px solid ${semantico.divisor}`,
        borderRadius: 999,
        overflow: 'hidden',
      }}
    >
      {opcoes.map((opcao) => {
        const ativo = opcao.valor === ativa
        return (
          <Link
            key={opcao.valor}
            href={opcao.href}
            aria-current={ativo ? 'page' : undefined}
            style={{
              padding: '6px 14px',
              fontFamily: semantico.fonteRotulo,
              fontSize: 12,
              letterSpacing: 1.2,
              textTransform: 'uppercase',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
              fontWeight: ativo ? 700 : 600,
              color: ativo ? semantico.textoSobreCor : semantico.textoSecundario,
              background: ativo ? semantico.acento : 'transparent',
            }}
          >
            {opcao.rotulo}
          </Link>
        )
      })}
    </nav>
  )
}

/**
 * LENTES — ÚLT. 5 · MÉDIA × LINHA · ODDS · HIERARQUIA. Pílulas discretas em
 * texto55; a ativa sobe para texto100 sobre a superfície elevada, com
 * `aria-current`. Trocar a lente troca a zona 2 de todos os cards de uma vez.
 */
function Lentes({ opcoes, ativa, rotulo = 'Lente' }: GrupoDeOpcoes) {
  return (
    <nav aria-label={rotulo} style={{ display: 'flex', gap: 6, marginTop: 10, overflowX: 'auto' }}>
      {opcoes.map((opcao) => {
        const ativo = opcao.valor === ativa
        return (
          <Link
            key={opcao.valor}
            href={opcao.href}
            aria-current={ativo ? 'page' : undefined}
            style={{
              padding: '4px 10px',
              borderRadius: 999,
              fontFamily: semantico.fonteRotulo,
              fontSize: 11,
              letterSpacing: 1,
              textTransform: 'uppercase',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              textDecoration: 'none',
              color: ativo ? semantico.texto100 : semantico.texto55,
              border: `1px solid ${ativo ? semantico.divisor : 'transparent'}`,
              background: ativo ? semantico.superficieElevada : 'transparent',
            }}
          >
            {opcao.rotulo}
          </Link>
        )
      })}
    </nav>
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
