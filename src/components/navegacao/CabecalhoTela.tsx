import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'

import { semantico } from '@/design-system/tokens/semantico'

/** Uma opção de seletor ou de lente: o valor identifica a ativa, o href leva até ela. */
export type OpcaoDeNavegacao = { valor: string; rotulo: string; href: string }

export type GrupoDeOpcoes = {
  opcoes: OpcaoDeNavegacao[]
  /** `valor` da opção ativa. */
  ativa: string
  /** Nome do grupo para leitor de tela. */
  rotulo?: string
  /**
   * Server action que GRAVA a escolha na conta antes de navegar (identidade
   * 04: ordem da lista e lente do card são preferência por conta). Com ela o
   * grupo vira um `<form>` e cada opção vira `<button name="destino">` com o
   * próprio href no valor — submete sem JavaScript, e a ação redireciona para
   * o destino, deixando a URL coerente com o que a tela passa a mostrar.
   *
   * Ausente, o grupo continua sendo links: navegação não é preferência (é o
   * caso do seletor HOJE · RESULTADOS).
   */
  acao?: (formulario: FormData) => void | Promise<void>
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
              // O TEXTO da sobrancelha é cinza (artboard 04, `.sobr`); quem
              // carrega a cor do contexto é o marcador ao lado.
              color: semantico.textoSecundario,
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
function Seletor({ opcoes, ativa, rotulo = 'Ordenação', acao }: GrupoDeOpcoes) {
  const moldura: CSSProperties = {
    display: 'inline-flex',
    border: `1.5px solid ${semantico.divisor}`,
    borderRadius: 999,
    overflow: 'hidden',
  }
  const estilo = (ativo: boolean): CSSProperties => ({
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
  })

  return (
    <Grupo rotulo={rotulo} acao={acao} estiloDoGrupo={moldura}>
      {opcoes.map((opcao) => (
        <Opcao
          key={opcao.valor}
          opcao={opcao}
          ativo={opcao.valor === ativa}
          acao={acao}
          estilo={estilo(opcao.valor === ativa)}
        />
      ))}
    </Grupo>
  )
}

/**
 * O invólucro do grupo: `<nav>` de links, ou `<form>` de botões quando a
 * escolha também precisa ser GRAVADA. Um só lugar decide — os dois grupos
 * (seletor e lentes) herdam o mesmo comportamento.
 */
function Grupo({
  rotulo,
  acao,
  estiloDoGrupo,
  children,
}: {
  rotulo: string
  acao?: GrupoDeOpcoes['acao']
  estiloDoGrupo: CSSProperties
  children: ReactNode
}) {
  return acao ? (
    <form action={acao} aria-label={rotulo} style={estiloDoGrupo}>
      {children}
    </form>
  ) : (
    <nav aria-label={rotulo} style={estiloDoGrupo}>
      {children}
    </nav>
  )
}

/**
 * A opção: `<a>` quando só navega, `<button name="destino">` quando grava.
 *
 * O destino viaja no VALOR do botão, e não num `formAction` por opção: React
 * ignora o `name` de um botão que declara `formAction` como função (precisa
 * dele para codificar qual ação chamar), e sem o `name` a ação não saberia
 * para onde ir. Com a ação no `<form>` e o destino no botão, a submissão
 * funciona com JavaScript desligado.
 */
function Opcao({
  opcao,
  ativo,
  acao,
  estilo,
}: {
  opcao: OpcaoDeNavegacao
  ativo: boolean
  acao?: GrupoDeOpcoes['acao']
  estilo: CSSProperties
}) {
  return acao ? (
    <button
      type="submit"
      name="destino"
      value={opcao.href}
      aria-current={ativo ? 'page' : undefined}
      // A borda é do ESTILO do grupo, não do botão: zerá-la aqui comia a
      // borda divisória da lente ativa (e o `1px solid transparent` das
      // inativas, que segura a fileira no lugar). Só quem não pediu borda
      // nenhuma cai no `none` que o <button> precisa.
      style={{ ...estilo, border: estilo.border ?? 'none', cursor: 'pointer' }}
    >
      {opcao.rotulo}
    </button>
  ) : (
    <Link href={opcao.href} aria-current={ativo ? 'page' : undefined} style={estilo}>
      {opcao.rotulo}
    </Link>
  )
}

/**
 * LENTES — ÚLT. 5 · MÉDIA × LINHA · ODDS · HIERARQUIA. Pílulas discretas em
 * texto55; a ativa sobe para texto100 sobre a superfície elevada, com
 * `aria-current`. Trocar a lente troca a zona 2 de todos os cards de uma vez.
 */
function Lentes({ opcoes, ativa, rotulo = 'Lente', acao }: GrupoDeOpcoes) {
  const estilo = (ativo: boolean): CSSProperties => ({
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
  })

  return (
    <Grupo
      rotulo={rotulo}
      acao={acao}
      estiloDoGrupo={{ display: 'flex', gap: 6, marginTop: 10, overflowX: 'auto' }}
    >
      {opcoes.map((opcao) => (
        <Opcao
          key={opcao.valor}
          opcao={opcao}
          ativo={opcao.valor === ativa}
          acao={acao}
          estilo={estilo(opcao.valor === ativa)}
        />
      ))}
    </Grupo>
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
