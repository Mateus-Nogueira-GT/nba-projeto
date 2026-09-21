import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'

import { semantico } from '@/design-system/tokens/semantico'
import { BotaoVoltar } from './BotaoVoltar'

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
 * "Sobrancelha" é o rótulo pequeno acima do título (ex.: "LISTA SECRETA").
 *
 * Identidade 05: o marcador colorido ao lado dela SAIU. Quem diz o contexto é o
 * `selo` no canto (PRÉ-LIVE azul, AO VIVO vermelho), e um quadradinho de cor
 * solto é justamente o vocabulário do anel do apito — repeti-lo no cabeçalho
 * para dizer outra coisa seria um canal mentindo.
 *
 * `titulo` é OPCIONAL: o perfil do jogador põe o nome no hero, ao lado do
 * rosto, e ali o nome é o `<h1>` da tela — repeti-lo aqui em 32 px seria o
 * mesmo nome duas vezes. Sem `titulo` este cabeçalho é só a sobrancelha.
 *
 * Cinco slots OPCIONAIS, todos ausentes nas telas que não os pedem (a saída
 * sem eles é a de sempre):
 *   `selo`      o SeloContexto preenchido no canto direito, na altura do título
 *   `seletor`   o segmentado POR JOGO · POR NÍVEL (ou HOJE · RESULTADOS)
 *   `acoes`     o que fica à direita do seletor — os filtros
 *   `aoLadoDoTitulo`  o que acompanha o H1 na mesma linha — hoje só o botão
 *                     COMO FUNCIONA, na Lista. Existe separado de `acoes`
 *                     porque `acoes` mora na fileira do seletor, e na Lista
 *                     ela já é dos filtros.
 *   `lentes`    a fileira de lentes que troca a zona 2 de TODOS os cards
 *   `contador`  o número da tela ("37 entradas em 7 jogos"), à moda do StatsHub
 *
 * Componente de servidor: sem estado, sem hook. `children` recebe os chips de
 * filtro (ou o subtítulo) que algumas telas colocam sob o título (ver `Chip`).
 */
export function CabecalhoTela({
  sobrancelha,
  titulo,
  voltarHref,
  selo,
  seletor,
  acoes,
  aoLadoDoTitulo,
  lentes,
  contador,
  children,
}: {
  sobrancelha: string
  titulo?: string
  voltarHref?: string
  selo?: ReactNode
  seletor?: GrupoDeOpcoes
  acoes?: ReactNode
  aoLadoDoTitulo?: ReactNode
  lentes?: GrupoDeOpcoes
  /**
   * O número da tela e o que ele conta ("37" · "entradas em 7 jogos").
   * `total`, quando difere de `numero`, vira "3 de 12 entradas…": o número
   * grande é o que a tela MOSTRA depois dos filtros, e o total é o que existe
   * (correções de lógica 19/09).
   */
  contador?: { numero: number; total?: number; rotulo: string }
  children?: ReactNode
}) {
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
              fontWeight: 600,
              letterSpacing: '0.06em',
              color: semantico.textoSecundario,
              textTransform: 'uppercase',
            }}
          >
            {voltarHref ? <BotaoVoltar href={voltarHref} /> : null}
            {sobrancelha}
          </p>
          {titulo && (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
              <h1
                style={{
                  margin: '6px 0 0',
                  fontFamily: semantico.fonteTitulo,
                  fontSize: 32,
                  letterSpacing: '0.02em',
                  textTransform: 'uppercase',
                }}
              >
                {titulo}
              </h1>
              {aoLadoDoTitulo}
            </div>
          )}
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
      {contador && (
        <p style={{ margin: '14px 0 0', display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <strong
            style={{
              fontFamily: semantico.fonteNumero,
              fontSize: 24,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {contador.numero}
          </strong>
          <span
            style={{
              fontFamily: semantico.fonteRotulo,
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: semantico.textoSecundario,
            }}
          >
            {contador.total !== undefined && contador.total !== contador.numero
              ? `de ${contador.total} ${contador.rotulo}`
              : contador.rotulo}
          </span>
        </p>
      )}
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
    padding: '8px 14px',
    fontFamily: semantico.fonteRotulo,
    fontSize: 12,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    fontWeight: ativo ? 700 : 600,
    color: ativo ? semantico.textoSobreAcento : semantico.textoSecundario,
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
      className="opcao-segmentada"
      aria-current={ativo ? 'page' : undefined}
      // O `border: 'none'` vem ANTES do estilo, não depois. O <button> precisa
      // dele (senão herda a borda do navegador), mas em CSS-in-JS a ordem das
      // chaves é a ordem das declarações: depois do estilo, o atalho `border`
      // zerava o `border-bottom` da lente ativa e o sublinhado sumia — e isso
      // só aparecia na Lista, onde o grupo GRAVA a escolha e vira <button>,
      // enquanto no resto do app ele é <a> e ninguém veria.
      style={{ border: 'none', ...estilo, cursor: 'pointer' }}
    >
      {opcao.rotulo}
    </button>
  ) : (
    <Link
      href={opcao.href}
      className="opcao-segmentada"
      aria-current={ativo ? 'page' : undefined}
      style={estilo}
    >
      {opcao.rotulo}
    </Link>
  )
}

/**
 * LENTES — ÚLT. 5 · MÉDIA × LINHA · ODDS · HIERARQUIA.
 *
 * Identidade 05: viraram ABAS com sublinhado, como a fileira de mercados do
 * StatsHub, no lugar das pílulas da identidade 04. Duas fileiras de pílula
 * (o seletor logo acima e as lentes) diziam ao olho que as duas coisas eram
 * do mesmo tipo, e não são: uma é a ordem da lista, a outra é o que o card
 * mostra. A ativa sobe para texto100 com o traço branco embaixo, e o
 * `aria-current` continua dizendo o estado sem depender da cor.
 *
 * Rolam na horizontal no celular — quatro rótulos não cabem em 358 px.
 */
function Lentes({ opcoes, ativa, rotulo = 'Lente', acao }: GrupoDeOpcoes) {
  const estilo = (ativo: boolean): CSSProperties => ({
    padding: '8px 2px',
    fontFamily: semantico.fonteRotulo,
    fontSize: 12,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    fontWeight: 600,
    whiteSpace: 'nowrap',
    textDecoration: 'none',
    background: 'transparent',
    color: ativo ? semantico.texto100 : semantico.textoSecundario,
    borderBottom: `2px solid ${ativo ? semantico.texto100 : 'transparent'}`,
  })

  return (
    <Grupo
      rotulo={rotulo}
      acao={acao}
      estiloDoGrupo={{
        display: 'flex',
        gap: 18,
        marginTop: 12,
        overflowX: 'auto',
        borderBottom: `1px solid ${semantico.divisor}`,
      }}
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
