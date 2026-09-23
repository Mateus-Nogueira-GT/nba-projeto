import type { CSSProperties } from 'react'
import Link from 'next/link'

import { dataHora, horaCurta } from '@/components/formato'
import { BotaoVoltar, CabecalhoTela, Moldura } from '@/components/navegacao'
import { dataDeReferencia } from '@/modules/dominio/rodada'
import { getDb } from '@/modules/dominio/db/cliente'
import { detalheDoApito, type Fator } from '@/modules/entrega/detalhe-apito'
import { lerFeedFireLive } from '@/modules/entrega/fire-live/leitura'
import { recorteDoJogador } from '@/modules/entrega/lista-secreta'
import { cotacoesPorCasa, faixasDoJogador } from '@/modules/entrega/odds/leitura'
import { rotaDoJogador } from '@/modules/entrega/estatisticas/rotas'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import { saidaDoApito } from '@/modules/entrega/saida-para-casa'
// Os valores vêm do enum do BANCO, não do motor: a fronteira permite tipo,
// nunca valor, e a lista de atributos é a mesma nos dois lados.
import { atributoEnum } from '@/modules/dominio/db/schema'
import type { Atributo } from '@/modules/motor/tipos'
import { CONFIANCA_GRAU, NIVEL_JOGADOR } from '@/design-system/tokens/css'
import { componente } from '@/design-system/tokens/componente'
import {
  Avatar,
  BarraAlvo,
  FormaNoAtributo,
  Pilula,
  Tabela,
  type Coluna,
} from '@/design-system/componentes'
import type { CotacaoDeCasa } from '@/modules/entrega/odds/leitura'
import { semantico } from '@/design-system/tokens/semantico'
import { exigirNivel } from '@/modules/plataforma/assinatura/guarda'
import { lerFeedCacheado } from '../../feed-cacheado'
import '@/design-system/tokens/tokens.css'

export const dynamic = 'force-dynamic'

const SIGLA: Record<Atributo, string> = { PONTOS: 'PTS', REBOTES: 'REB', ASSISTENCIAS: 'AST' }
const ATRIBUTO_ROTULO: Record<Atributo, string> = {
  PONTOS: 'PONTOS',
  REBOTES: 'REBOTES',
  ASSISTENCIAS: 'ASSISTÊNCIAS',
}
export const metadata = { title: 'Linhas e confiança' }

function formatarOdd(v: number): string {
  return v.toFixed(2).replace('.', ',')
}

/** Número no padrão pt-BR: vírgula decimal, uma casa. */
function fmt(n: number): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

const ROTULO: CSSProperties = {
  fontFamily: semantico.fonteRotulo,
  fontSize: 11,
  letterSpacing: 1.5,
  textTransform: 'uppercase',
  fontWeight: 700,
  color: semantico.textoSecundario,
}

const CAIXA: CSSProperties = {
  borderRadius: 12,
  border: `1px solid ${semantico.divisor}`,
  background: componente.contextoFrio.cardGradiente,
}

/**
 * Título de seção com o auxiliar à direita — a mesma linha nas seis seções.
 * É o que faz o esqueleto ser lido como um documento só, e não seis blocos.
 */
function TituloSecao({ titulo, aux }: { titulo: string; aux?: string }) {
  return (
    <h2
      style={{
        ...ROTULO,
        margin: '24px 0 10px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: 10,
      }}
    >
      <span>{titulo}</span>
      {aux && (
        <span style={{ fontWeight: 500, letterSpacing: 1, color: semantico.texto40 }}>{aux}</span>
      )}
    </h2>
  )
}

/** Uma das três caixas da comparação: rótulo pequeno, número grande. */
function CaixaDeComparacao({
  rotulo,
  valor,
  cor,
}: {
  rotulo: string
  valor: string
  cor?: string
}) {
  return (
    <div style={{ ...CAIXA, padding: '10px 12px', borderColor: cor ?? semantico.divisor }}>
      <p style={{ ...ROTULO, margin: 0, fontSize: 10, letterSpacing: 1.2, fontWeight: 600 }}>
        {rotulo}
      </p>
      <p
        style={{
          margin: '2px 0 0',
          fontFamily: semantico.fonteTitulo,
          fontSize: 24,
          letterSpacing: 0.5,
          color: cor ?? semantico.texto100,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {valor}
      </p>
    </div>
  )
}

/**
 * As colunas da grade de casas: CASA e uma coluna por linha apitada.
 *
 * `Tabela` de verdade, não `<span>` em CSS grid: é dado tabular, e sem
 * `scope` o leitor de tela lê "Casa Alfa 1,49 2,23 3,53" sem dizer de que
 * linha é cada odd — e o "—" de uma casa que não cotou perde o sentido fora
 * da coluna. Mesma convenção da tela de partida (estatisticas/jogo/[id]).
 * Continua ADR-0004: texto, sem logo, sem link, sem CTA.
 */
function colunasDasCasas(linhas: number[]): Coluna<CotacaoDeCasa>[] {
  return [
    {
      chave: 'casa',
      rotulo: 'CASA',
      alinhamento: 'esquerda',
      fixa: true,
      celula: (casa) => casa.casa,
    },
    ...linhas.map((linha) => ({
      chave: `linha-${linha}`,
      rotulo: `${linha}+`,
      descricao: `linha de ${linha} ou mais`,
      alinhamento: 'direita' as const,
      // Ausência é '—', nunca 0,00: a casa não cotou esta linha.
      celula: (casa: CotacaoDeCasa) =>
        casa.porLinha[linha] === undefined ? '—' : formatarOdd(casa.porLinha[linha]!),
    })),
  ]
}

/**
 * Uma linha do "por que entrou": a coluna do fator à esquerda, o fato à
 * direita, com o pedaço que sustenta a regra em negrito. O negrito só entra
 * quando `destaque` é PREFIXO do texto — assim a tela nunca reescreve a frase
 * que a entrega montou, e nenhum peso do ruleset aparece aqui.
 */
function LinhaDeFator({ fator, primeiro }: { fator: Fator; primeiro: boolean }) {
  const destaque = fator.destaque
  const temDestaque = destaque !== undefined && fator.texto.startsWith(destaque)
  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        padding: primeiro ? '0 0 10px' : '10px 0',
        borderTop: primeiro ? undefined : `1px solid ${semantico.divisor}`,
      }}
    >
      <span style={{ ...ROTULO, width: 96, flexShrink: 0, letterSpacing: 1.2, paddingTop: 2 }}>
        {fator.titulo}
      </span>
      <span style={{ fontSize: 14, lineHeight: 1.45, color: semantico.texto100 }}>
        {temDestaque ? (
          <>
            <strong style={{ fontWeight: 700 }}>{destaque}</strong>
            {fator.texto.slice(destaque.length)}
          </>
        ) : (
          fator.texto
        )}
      </span>
    </div>
  )
}

/**
 * DETALHE DO APITO — a página de ANÁLISE (spec 04, §4.3).
 *
 * Esqueleto FIXO, nesta ordem: sobrancelha · hero · fato gerador · forma no
 * atributo · comparação · por que entrou · linhas e casas · o jogo · CTA. A
 * ordem não muda durante a temporada — é o que permite ao assinante aprender
 * a página uma vez e depois lê-la por varredura. No Fire Live é a MESMA
 * página, com a seção do 1º quarto no topo.
 *
 * A tela é leitura de SNAPSHOT: `detalheDoApito` descreve o que o motor já
 * decidiu (feed materializado) e nenhuma conta nova nasce aqui — nem a média
 * dos minutos, nem a grade de casas, nem quem é o adversário.
 */
export default async function PaginaApito({
  params,
  searchParams,
}: {
  params: Promise<{ jogadorId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { jogadorId } = await params
  const consulta = await searchParams
  const atributoBruto = Array.isArray(consulta.atributo) ? consulta.atributo[0] : consulta.atributo
  // Um jogador pode apitar em pontos, rebotes e assistências no mesmo dia.
  // Sem o recorte, a tela empilharia linhas de 25 pontos ao lado de linhas de
  // 8 rebotes na mesma coluna, como se fossem comparáveis.
  const atributo = atributoEnum.enumValues.find((a) => a === atributoBruto)

  if (!process.env.DATABASE_URL) {
    return (
      <Moldura aba={null} largura="dados">
        <h1>Linhas e confiança</h1>
        <p style={{ color: semantico.textoSecundario }}>Banco não configurado.</p>
      </Moldura>
    )
  }

  await exigirNivel('MVP', `/apito/${jogadorId}`)

  const ruleset = await rulesetAtivo()
  const hoje = dataDeReferencia(new Date(), ruleset.rodada.fuso)
  let { itens, geradoEm } = recorteDoJogador(await lerFeedCacheado(hoje), jogadorId, atributo)

  // O apito do Fire Live abre ESTA página (spec §4.3): a análise é a mesma, o
  // 1º quarto é que entra no topo. Sem apito pré-live, o item ao vivo passa a
  // ser o próprio sujeito da tela.
  const vivo = await lerFeedFireLive(getDb(), hoje, ruleset.fire_live.quarto)
  // O item ao vivo tem de ser do MESMO atributo do sujeito da tela. Casar por
  // jogador só (ou pelo atributo da query, que costuma vir vazio) abria a
  // página com hero de um mercado e BarraAlvo de outro: `linhasDoJogador` já
  // colapsa para um atributo, e o Fire Live roda nos três.
  let preLive = itens[0]
  const aoVivo = vivo.itens.find(
    (i) =>
      i.jogadorId === jogadorId &&
      (preLive !== undefined
        ? i.atributo === preLive.atributo
        : atributo === undefined || i.atributo === atributo),
  )

  // O Fire Live conserva jogos da rodada anterior enquanto estão em andamento.
  // A análise pré-live continua pertencendo à rodada em que ESSE jogo começou.
  if (!preLive && aoVivo) {
    const jogo = vivo.jogos.find((j) => j.id === aoVivo.jogoId)
    const rodada = jogo ? dataDeReferencia(jogo.dataHoraUtc, ruleset.rodada.fuso) : hoje
    if (rodada !== hoje) {
      const anterior = recorteDoJogador(await lerFeedCacheado(rodada), jogadorId, aoVivo.atributo)
      itens = anterior.itens.filter((i) => i.jogoId === aoVivo.jogoId)
      preLive = itens[0]
      if (preLive) geradoEm = anterior.geradoEm
    }
  }

  const principal = preLive ?? aoVivo

  if (!principal) {
    return (
      <Moldura aba={null} largura="dados">
        <CabecalhoTela sobrancelha="LISTA SECRETA · PRÉ-LIVE" titulo="Sem apito" voltarHref="/" />
        <div
          style={{
            padding: '32px 16px',
            textAlign: 'center',
            border: `1px dashed ${semantico.divisor}`,
            borderRadius: 12,
          }}
        >
          <p style={{ margin: 0, fontWeight: 700 }}>Sem apito para este jogador hoje</p>
          <p style={{ margin: '8px 0 0', fontSize: 14, color: semantico.textoSecundario }}>
            A lista de hoje não sinalizou este jogador. Ele pode aparecer na próxima rodada.
          </p>
        </div>
      </Moldura>
    )
  }

  // A sobrancelha e o destino do voltar descrevem o SUJEITO da tela, não a
  // existência de um item ao vivo: quando o mesmo jogador tem apito pré-live e
  // Fire Live no MESMO atributo — o caso normal, o apito da Lista Secreta
  // cruzando o alvo do 1º quarto —, quem manda é o pré-live. Rotular a tela de
  // "FIRE LIVE" ali seria dar à análise a estratégia errada, e o voltar
  // devolveria o assinante a uma lista de onde ele não veio.
  const fireLive = principal === aoVivo

  // Faixa REAL das casas quando houve coleta; a tabela de referência do
  // ruleset é o fallback, exatamente como o motor define.
  const jogosDaTela = [...new Set([principal.jogoId, ...itens.map((i) => i.jogoId)])]
  const [cotadas, gradeDeCasas, saida] = await Promise.all([
    faixasDoJogador(getDb(), jogosDaTela, jogadorId, principal.atributo),
    cotacoesPorCasa(getDb(), jogosDaTela, jogadorId, principal.atributo),
    saidaDoApito(getDb()),
  ])
  const referencia =
    principal.atributo === 'PONTOS'
      ? ruleset.odds.tabela_estatica[principal.nivelJogador]
      : ruleset.por_atributo[principal.atributo]?.odds?.[principal.nivelJogador]
  const casasNaTela = Math.max(0, ...[...cotadas.values()].map((f) => f.qtdCasas))

  // Os últimos DEZ (spec §4.3) — a forma no atributo. O card segue com cinco.
  const detalhe = await detalheDoApito(getDb(), ruleset, principal, { blocos: 10 })
  // O grau chega PRONTO no item do feed — calculado uma vez, na
  // materialização. A tela não executa o motor (`tela-nao-chama-o-motor`).
  // O rótulo é leitura de CONFIGURAÇÃO do ruleset, como em /como-funciona.
  const grau = principal.grauConfianca ?? null
  const faixaDeConfianca =
    grau === null ? null : (ruleset.confianca_exibicao.faixas.find((f) => f.grau === grau) ?? null)
  const rotuloFaixa = faixaDeConfianca?.rotulo ?? null
  // O artboard escreve o grau em UMA linha de 10 px sob a pílula. O rótulo
  // inteiro não cabe na coluna de 96 px: quebraria em três linhas e o hero
  // deixaria de alinhar com o nome.
  //
  // A forma curta vem do RULESET (`rotulo_curto`), não de um regex aqui. Antes
  // a tela cortava o prefixo "CONFIANÇA " com uma expressão regular — e em
  // 12/09, quando o grau 5 deixou de começar com essa palavra, o corte virou
  // nada e o rótulo inteiro voltou para a coluna estreita. Texto de ruleset é
  // dado do ruleset.
  const grauEmUmaLinha = faixaDeConfianca?.rotulo_curto ?? rotuloFaixa
  const corFaixa = grau === null ? semantico.divisor : CONFIANCA_GRAU[grau]
  const brilha = grau === 5

  // A régua da forma é a LINHA, e só ela: `detalheDoApito` já se recusa a
  // conferir jogo inteiro contra alvo de 1º quarto, e a tela não remonta a
  // conta. Sem linha, o gráfico sai sem régua.
  const linhaConferida = detalhe.linhaConferida
  // O componente desenha no máximo dez colunas (`FormaNoAtributo`), então o
  // título diz o MENOR entre o que existe e esse teto.
  const jogosNaForma = Math.min(detalhe.blocos.length, 10)
  const tituloDaForma = `FORMA NO ATRIBUTO · ${jogosNaForma === 1 ? 'ÚLTIMO 1' : `ÚLTIMOS ${jogosNaForma}`}`
  // A caixa do meio da comparação: LINHA quando há linha; ALVO 1Q quando o
  // apito nasceu ao vivo. Trocar o RÓTULO (e não pôr "+" num alvo) é o que
  // impede a tela de chamar de linha o que é alvo — são grandezas de janelas
  // diferentes, e "linha sempre inteira com +" vale para a linha.
  const caixaDaLinha =
    principal.linha !== null
      ? { rotulo: 'LINHA', valor: `${principal.linha}+` }
      : principal.alvo1Q !== null
        ? { rotulo: 'ALVO 1Q', valor: String(principal.alvo1Q) }
        : { rotulo: 'LINHA', valor: '—' }
  const mercado =
    principal.linha !== null
      ? `${ATRIBUTO_ROTULO[principal.atributo]} ${principal.linha}+`
      : principal.alvo1Q !== null
        ? `${ATRIBUTO_ROTULO[principal.atributo]} · ALVO 1Q ${principal.alvo1Q}`
        : ATRIBUTO_ROTULO[principal.atributo]

  const apoio = [
    NIVEL_JOGADOR[principal.nivelJogador].rotulo,
    principal.turbo ? 'T' : `N${principal.nivelApito}`,
    principal.posicao,
    principal.timeSigla,
    `${detalhe.jogo.emCasa ? 'vs' : '@'} ${detalhe.jogo.adversarioSigla}`,
    horaCurta(detalhe.jogo.dataHoraUtc, ruleset.rodada.fuso),
  ]
    .filter((p): p is string => p !== null && p !== '')
    .join(' · ')

  // O fato gerador é a NARRATIVA, e só ela. O fallback para um fator repetia
  // LITERALMENTE, duas seções acima, a frase que "POR QUE ENTROU" já imprime —
  // e não é caso raro: o validador reprovou 219 de 276 narrativas em 07/09
  // (spec §5.5), então o fallback seria o caminho COMUM. Sem narrativa, quem
  // explica a entrada é a lista de fatores, que é a fonte e não a cópia.
  const fatoGerador = principal.narrativa ?? null
  const linhasDaGrade = itens.map((i) => i.linha).filter((l): l is number => l !== null)
  const mostraTabela = gradeDeCasas.length > 0 && linhasDaGrade.length > 0
  // Cada linha do atributo com a faixa que ela exibe, resolvida ANTES do JSX:
  // é o que permite à tela saber se existe alguma odd em cena antes de
  // escrever o aviso do ADR-0004 — um aviso que fala de "faixa entre N casas"
  // sem nenhuma odd por perto é ruído, e ruído enfraquece o disclaimer.
  const linhasNaTela = itens.map((item) => {
    const cotada = item.linha === null ? undefined : cotadas.get(item.linha)
    const estatica = item.linha === null ? undefined : referencia?.[String(item.linha)]
    const faixaOdd: [number, number] | undefined = cotada ? [cotada.min, cotada.max] : estatica
    return { item, cotada, faixaOdd }
  })
  const temOddNaTela = mostraTabela || linhasNaTela.some((l) => l.faixaOdd !== undefined)
  const geradoEmFinal = geradoEm ?? vivo.geradoEm

  return (
    <Moldura aba={null} largura="dados">
      {/* 1 · SOBRANCELHA — o botão de voltar e o universo da tela */}
      <p
        style={{
          margin: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontFamily: semantico.fonteRotulo,
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: 2,
          textTransform: 'uppercase',
          color: fireLive ? semantico.aoVivo : semantico.textoSecundario,
        }}
      >
        <BotaoVoltar href={fireLive ? '/fire-live' : '/'} />
        {fireLive ? 'FIRE LIVE · AO VIVO' : 'LISTA SECRETA · PRÉ-LIVE'}
      </p>

      {/* 2 · HERO — rosto, nome, apoio, mercado e a pílula do grau */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14 }}>
        <Avatar
          nome={principal.nome}
          fotoUrl={principal.fotoUrl ?? null}
          timeSigla={principal.timeSigla}
          nivelApito={principal.nivelApito}
          turbo={principal.turbo}
          tamanho={64}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1
            style={{
              margin: 0,
              fontFamily: semantico.fonteTitulo,
              fontSize: 26,
              letterSpacing: 0.5,
              lineHeight: 1,
              textTransform: 'uppercase',
            }}
          >
            <Link
              href={rotaDoJogador(principal.jogadorId)}
              style={{ color: 'inherit', textDecoration: 'none' }}
            >
              {principal.nome}
            </Link>
          </h1>
          <p
            style={{
              margin: '4px 0 0',
              fontFamily: semantico.fonteRotulo,
              fontSize: 12,
              letterSpacing: 1.2,
              textTransform: 'uppercase',
              color: semantico.textoSecundario,
            }}
          >
            {apoio}
          </p>
          <p
            style={{
              margin: '6px 0 0',
              fontFamily: semantico.fonteRotulo,
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: 1.2,
              textTransform: 'uppercase',
              color: semantico.texto100,
            }}
          >
            {mercado}
          </p>
        </div>
        {/* Sem nota não há pílula: o Fire Live grava `confianca: null`, e o
            "—" em Bebas 34 na cor do divisor dá ~1,4:1 sobre o fundo — o
            elemento mais alto do hero virava uma caixa vazia. Mesma decisão
            que o CardEntrada tomou para o MESMO vazio (identidade 04, 1.1). */}
        {principal.confianca !== null && (
          <div style={{ textAlign: 'center', flexShrink: 0, maxWidth: 96 }}>
            <Pilula
              texto={String(Math.round(principal.confianca))}
              cor={corFaixa}
              brilho={brilha}
              tamanho="hero"
            />
            {grauEmUmaLinha && (
              <p
                style={{
                  ...ROTULO,
                  margin: '4px 0 0',
                  fontSize: 10,
                  letterSpacing: 1.5,
                  color: corFaixa,
                }}
              >
                {grauEmUmaLinha}
              </p>
            )}
          </div>
        )}
      </div>

      {/* FIRE LIVE · o 1º quarto entra no TOPO da análise */}
      {aoVivo && (
        <>
          <TituloSecao titulo="1º QUARTO" aux="o que o Fire Live observa" />
          <div style={{ ...CAIXA, padding: '12px 14px' }}>
            <BarraAlvo observado={aoVivo.valorNoQuarto} alvo={aoVivo.alvo1Q ?? 0} />
            {aoVivo.modoFire && (
              <p style={{ margin: '10px 0 0', fontSize: 13, color: semantico.texto70 }}>
                Modo fire: {Math.round(ruleset.fire_live.modo_fire.percentual_media * 100)}% da
                média já no 1º quarto.
              </p>
            )}
          </div>
        </>
      )}

      {/* 3 · FATO GERADOR — a frase que explica a entrada */}
      {fatoGerador && (
        <p
          style={{
            ...CAIXA,
            margin: '18px 0 0',
            padding: 14,
            fontSize: 14,
            lineHeight: 1.5,
            color: semantico.texto100,
          }}
        >
          {fatoGerador}
        </p>
      )}

      {/* 4 · FORMA NO ATRIBUTO — os últimos 10 com a linha marcada. O título
          dizia sempre "ÚLTIMOS 10", e quem tem menos de dez jogos conferidos
          lia um título que mente — enquanto o gráfico ao lado já contava a
          verdade ("bateu 3 de 8"). O 10 é o teto de colunas do componente. */}
      <TituloSecao
        titulo={tituloDaForma}
        aux={
          detalhe.bateu.total === 0
            ? undefined
            : `bateu ${detalhe.bateu.acertos} de ${detalhe.bateu.total}`
        }
      />
      {detalhe.blocos.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: semantico.textoSecundario }}>
          Sem histórico suficiente ainda.
        </p>
      ) : (
        <FormaNoAtributo jogos={detalhe.blocos} linha={linhaConferida} />
      )}

      {/* 5 · COMPARAÇÃO — média da temporada, a linha e os minutos */}
      <TituloSecao titulo="COMPARAÇÃO" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        <CaixaDeComparacao
          rotulo="MÉDIA"
          valor={detalhe.mediaTemporada === null ? '—' : fmt(detalhe.mediaTemporada)}
        />
        <CaixaDeComparacao rotulo={caixaDaLinha.rotulo} valor={caixaDaLinha.valor} cor={corFaixa} />
        <CaixaDeComparacao
          rotulo="MIN · MÉDIA"
          // Dado ausente não é zero minutos: é "não sabemos". Mostrar 0
          // afirmaria um fato falso (padrão de UltimaAtualizacao).
          valor={detalhe.minutosMedia === null ? '—' : String(Math.round(detalhe.minutosMedia))}
        />
      </div>

      {/* 6 · POR QUE ENTROU — um fator por linha, na ordem da entrega */}
      <TituloSecao titulo="POR QUE ENTROU" />
      {detalhe.fatores.length === 0 ? (
        <p style={{ margin: 0, fontSize: 14, color: semantico.textoSecundario }}>
          Sem detalhamento disponível para este apito.
        </p>
      ) : (
        detalhe.fatores.map((fator, i) => (
          <LinhaDeFator key={fator.chave} fator={fator} primeiro={i === 0} />
        ))
      )}

      {/* 7 · LINHAS DO ATRIBUTO e a grade de casas, em TEXTO (ADR-0004) */}
      <TituloSecao
        titulo={`LINHAS DE ${ATRIBUTO_ROTULO[principal.atributo]}`}
        // O auxiliar compara linhas: sem nenhuma em tela, ele compararia o que
        // não existe.
        aux={itens.length > 0 ? 'quanto mais alta, menor a confiança' : undefined}
      />
      {itens.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: semantico.textoSecundario }}>
          Este apito nasceu ao vivo: ele tem alvo do 1º quarto, não linha pré-live.
        </p>
      ) : (
        linhasNaTela.map(({ item, cotada, faixaOdd }) => {
          const corDoItem =
            item.grauConfianca === null ? semantico.divisor : CONFIANCA_GRAU[item.grauConfianca]
          const escolhida = item.chave === principal.chave
          return (
            <div
              key={item.chave}
              style={{
                ...CAIXA,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                padding: '10px 14px',
                marginBottom: 8,
                borderColor: escolhida ? corFaixa : semantico.divisor,
              }}
            >
              <span
                style={{
                  fontFamily: semantico.fonteRotulo,
                  fontSize: 16,
                  fontWeight: 700,
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                  width: 72,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {item.linha}+ {SIGLA[item.atributo]}
              </span>
              <span
                style={{
                  fontFamily: semantico.fonteTitulo,
                  fontSize: 20,
                  color: corDoItem,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {item.confianca === null ? '—' : Math.round(item.confianca)}
              </span>
              <span
                style={{
                  fontFamily: semantico.fonteRotulo,
                  fontSize: 12,
                  letterSpacing: 0.8,
                  lineHeight: 1.3,
                  textAlign: 'right',
                  color: semantico.textoSecundario,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {ruleset.odds.exibicao === 'media' && cotada?.media != null && (
                  <>
                    odd média {formatarOdd(cotada.media)}
                    <br />
                  </>
                )}
                {/* Com UMA casa a faixa seria "1,85 – 1,85": escreve a odd
                    sozinha. Só vale para a cotação REAL — a tabela de
                    referência da plataforma é uma faixa de verdade e continua
                    saindo como faixa. Quem é a casa está na grade abaixo. */}
                {ruleset.odds.exibicao === 'casa_unica' && cotada?.qtdCasas === 1
                  ? formatarOdd(cotada.min)
                  : faixaOdd
                    ? `${formatarOdd(faixaOdd[0])} – ${formatarOdd(faixaOdd[1])}`
                    : 'odd indisponível'}
              </span>
            </div>
          )
        })
      )}

      {mostraTabela && (
        <div style={{ marginTop: 6 }}>
          <Tabela
            legenda="Odds por casa, na última coleta"
            colunas={colunasDasCasas(linhasDaGrade)}
            linhas={gradeDeCasas}
            chaveDaLinha={(casa) => casa.casa}
          />
        </div>
      )}

      {/* O aviso do ADR-0004 acompanha a ODD EXIBIDA. No apito nascido ao vivo
          não há linha pré-live, logo não há faixa nem grade: afirmar ali "faixa
          entre N casas" descreveria algo que não está em lugar nenhum da tela. */}
      {temOddNaTela && (
        <p style={{ margin: '12px 0 0', fontSize: 12, lineHeight: 1.5, color: semantico.texto40 }}>
          {casasNaTela === 1
            ? 'Cotação de uma casa, na última coleta.'
            : casasNaTela > 1
              ? `Faixa entre ${casasNaTela} casas na última coleta.`
              : 'Faixa da tabela de referência da plataforma.'}{' '}
          Referência de mercado: a odd da sua casa pode ser outra. Nenhuma aposta é feita por aqui.
        </p>
      )}

      {/* 8 · O JOGO — siglas, horário e desfalques */}
      <TituloSecao titulo="O JOGO" />
      <div style={{ ...CAIXA, padding: '12px 14px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <span style={{ fontFamily: semantico.fonteTitulo, fontSize: 18 }}>
            {detalhe.jogo.visitanteSigla}
          </span>
          <div style={{ textAlign: 'center', minWidth: 0 }}>
            <p
              style={{
                margin: 0,
                fontFamily: semantico.fonteTitulo,
                fontSize: 16,
                letterSpacing: 0.5,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {horaCurta(detalhe.jogo.dataHoraUtc, ruleset.rodada.fuso)}
            </p>
            {detalhe.jogo.desfalques.length === 0 && (
              <p style={{ ...ROTULO, margin: '2px 0 0', fontSize: 10, fontWeight: 600 }}>
                Sem desfalques
              </p>
            )}
          </div>
          <span style={{ fontFamily: semantico.fonteTitulo, fontSize: 18 }}>
            {detalhe.jogo.casaSigla}
          </span>
        </div>

        {/* Quem está FORA, com RÓTULO e por extenso. Um nome pelado entre duas
            siglas não diz que a pessoa está fora — e a lista junta os dois
            lados da partida. Nenhum nome fica escondido num `title`: em toque
            não existe gesto que o revele, e este é um PWA de celular. */}
        {detalhe.jogo.desfalques.length > 0 && (
          <div
            style={{
              display: 'flex',
              gap: 10,
              marginTop: 10,
              paddingTop: 10,
              borderTop: `1px solid ${semantico.divisor}`,
            }}
          >
            <span
              style={{
                ...ROTULO,
                fontSize: 10,
                letterSpacing: 1.2,
                fontWeight: 600,
                flexShrink: 0,
              }}
            >
              FORA
            </span>
            <span
              style={{
                fontFamily: semantico.fonteRotulo,
                fontSize: 12,
                letterSpacing: 0.8,
                lineHeight: 1.4,
                textTransform: 'uppercase',
                color: semantico.texto70,
              }}
            >
              {detalhe.jogo.desfalques.join(' · ')}
            </span>
          </div>
        )}
      </div>

      {/* 9 · CTA e rodapé */}
      <Link
        href={rotaDoJogador(principal.jogadorId)}
        className="botao-primario"
        style={{
          display: 'block',
          marginTop: 24,
          padding: 14,
          borderRadius: 12,
          textAlign: 'center',
          fontFamily: semantico.fonteTitulo,
          fontSize: 16,
          letterSpacing: 1,
          textTransform: 'uppercase',
          textDecoration: 'none',
        }}
      >
        VER ESTATÍSTICAS
      </Link>

      {/* A saída para a casa parceira (spec 12/09, §5.4) — só existe se o
          admin marcou UM link ativo, de uma oferta e campanha ativas. Sem
          isso, nada aparece: a tela nunca inventa destino. `rel` declara o
          link como patrocinado, e o aviso repete a letra do ADR-0004 que já
          acompanha a odd, aqui na saída em vez de na leitura. */}
      {saida && (
        <p style={{ margin: '12px 0 0' }}>
          <a
            href={`/ir/${saida.codigo}?apito=${encodeURIComponent(principal.chave)}`}
            rel="nofollow sponsored"
            style={{
              display: 'block',
              padding: 12,
              borderRadius: 12,
              textAlign: 'center',
              border: '1.5px solid transparent',
              background: semantico.acento,
              color: semantico.textoSobreAcento,
              fontFamily: semantico.fonteTitulo,
              fontSize: 14,
              letterSpacing: 1,
              textTransform: 'uppercase',
              textDecoration: 'none',
            }}
          >
            VER NA CASA PARCEIRA · {saida.rotulo}
          </a>
          <span style={{ display: 'block', marginTop: 6, fontSize: 12, color: semantico.texto55 }}>
            Você sai da NIP. A odd da sua casa pode ser outra; nenhuma aposta é feita por aqui.
          </span>
        </p>
      )}

      <footer
        style={{ margin: '16px 0 0', fontSize: 12, lineHeight: 1.5, color: semantico.texto40 }}
      >
        O número é a <strong>nota de confiança</strong> da análise NIP, não uma probabilidade.
        {geradoEmFinal
          ? ` Última atualização: ${dataHora(geradoEmFinal, ruleset.rodada.fuso)}.`
          : ''}
      </footer>
    </Moldura>
  )
}
