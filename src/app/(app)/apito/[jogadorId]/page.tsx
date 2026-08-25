import Link from 'next/link'
import { redirect } from 'next/navigation'

import { dataHora } from '@/components/formato'
import { CabecalhoTela, Moldura } from '@/components/navegacao'
import { dataDeReferencia } from '@/modules/dominio/rodada'
import { getDb } from '@/modules/dominio/db/cliente'
import { detalheDoApito } from '@/modules/entrega/detalhe-apito'
import { linhasDoJogador } from '@/modules/entrega/lista-secreta'
import { faixasDoJogador } from '@/modules/entrega/odds/leitura'
import { rotaDoJogador } from '@/modules/entrega/estatisticas/rotas'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
// Os valores vêm do enum do BANCO, não do motor: a fronteira permite tipo,
// nunca valor, e a lista de atributos é a mesma nos dois lados.
import { atributoEnum } from '@/modules/dominio/db/schema'
import type { Atributo } from '@/modules/motor/tipos'
import { CONFIANCA_GRAU } from '@/design-system/tokens/css'
import { componente } from '@/design-system/tokens/componente'
import { Avatar } from '@/design-system/componentes'
import { semantico } from '@/design-system/tokens/semantico'
import { sessaoAtual } from '@/modules/plataforma/auth/cookies'
import { avaliarAcesso } from '@/modules/plataforma/assinatura/direito'
import '@/design-system/tokens/tokens.css'

export const dynamic = 'force-dynamic'

const SIGLA: Record<Atributo, string> = { PONTOS: 'PTS', REBOTES: 'REB', ASSISTENCIAS: 'AST' }
const UNIDADE: Record<Atributo, string> = {
  PONTOS: 'pontos',
  REBOTES: 'rebotes',
  ASSISTENCIAS: 'assistências',
}
const ATRIBUTO_ROTULO: Record<Atributo, string> = {
  PONTOS: 'PONTOS',
  REBOTES: 'REBOTES',
  ASSISTENCIAS: 'ASSISTÊNCIAS',
}
export const metadata = { title: 'Linhas e confiança · IA da NBA' }

function formatarOdd(v: number): string {
  return v.toFixed(2).replace('.', ',')
}

/** Número no padrão pt-BR: vírgula decimal, uma casa. */
function fmt(n: number): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

/**
 * DETALHE DO APITO — os "quadradinhos" que o documento do CJ pede.
 *
 * Cada linha de pontos tem sua própria nota de confiança (a tabela base do
 * nível, mais o bônus do nível de apito) e sua faixa de odds. O documento é
 * explícito: a plataforma NÃO tem acesso direto à odd da casa, trabalha com
 * uma aproximação — por isso a faixa aparece rotulada como referência.
 *
 * A tela é leitura de SNAPSHOT: `detalheDoApito` descreve o que o motor já
 * decidiu (feed materializado), nunca reexecuta estratégia aqui.
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
      <Moldura aba={null}>
        <h1>Linhas e confiança</h1>
        <p style={{ color: semantico.textoSecundario }}>Banco não configurado.</p>
      </Moldura>
    )
  }

  const sessao = await sessaoAtual()
  if (!sessao) redirect(`/entrar?destino=/apito/${jogadorId}`)
  const acesso = await avaliarAcesso(getDb(), sessao.usuarioId)
  if (!acesso.permitido) redirect('/assinar')

  const ruleset = await rulesetAtivo()
  const hoje = dataDeReferencia(new Date(), ruleset.rodada.fuso)
  const { itens, geradoEm } = await linhasDoJogador(getDb(), hoje, jogadorId, atributo)
  const principal = itens[0]

  if (!principal) {
    return (
      <Moldura aba={null}>
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

  // Faixa REAL das casas quando houve coleta; a tabela de referência do
  // ruleset é o fallback, exatamente como o motor define.
  const cotadas = await faixasDoJogador(
    getDb(),
    [...new Set(itens.map((i) => i.jogoId))],
    jogadorId,
    principal.atributo,
  )
  const referencia =
    principal.atributo === 'PONTOS'
      ? ruleset.odds.tabela_estatica[principal.nivelJogador]
      : ruleset.por_atributo[principal.atributo]?.odds?.[principal.nivelJogador]
  const casasNaTela = Math.max(0, ...[...cotadas.values()].map((f) => f.qtdCasas))

  const detalhe = await detalheDoApito(getDb(), ruleset, principal)
  // O grau chega PRONTO no item do feed — calculado uma vez, na
  // materialização. A tela não executa o motor (`tela-nao-chama-o-motor`).
  // O rótulo é leitura de CONFIGURAÇÃO do ruleset, como em /como-funciona.
  const grau = principal.grauConfianca ?? null
  const rotuloFaixa =
    grau === null
      ? null
      : (ruleset.confianca_exibicao.faixas.find((f) => f.grau === grau)?.rotulo ?? null)
  const corFaixa = grau === null ? semantico.divisor : CONFIANCA_GRAU[grau]
  const brilha = grau === 5
  const rotuloLinha =
    principal.linha != null
      ? `${ATRIBUTO_ROTULO[principal.atributo]} ${principal.linha}+`
      : principal.alvo1Q != null
        ? `${ATRIBUTO_ROTULO[principal.atributo]} · ALVO 1Q ${principal.alvo1Q}`
        : ATRIBUTO_ROTULO[principal.atributo]

  return (
    <Moldura aba={null}>
      <CabecalhoTela sobrancelha="LISTA SECRETA · PRÉ-LIVE" titulo={principal.nome} voltarHref="/" />

      {/* HERO — faixa de confiança */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: 16,
          borderRadius: 16,
          background: componente.contextoFrio.cardGradiente,
          border: `1.5px solid ${corFaixa}`,
          boxShadow: brilha ? `0 0 20px 2px ${corFaixa}66` : undefined,
          marginBottom: 12,
        }}
      >
        <Avatar
          nome={principal.nome}
          fotoUrl={principal.fotoUrl ?? null}
          timeSigla={principal.timeSigla}
          nivelApito={principal.nivelApito}
          turbo={principal.turbo}
          tamanho={56}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          {rotuloFaixa && (
            <p
              style={{
                margin: 0,
                fontFamily: semantico.fonteRotulo,
                fontSize: 13,
                letterSpacing: 1.5,
                color: corFaixa,
                textTransform: 'uppercase',
              }}
            >
              {rotuloFaixa}
            </p>
          )}
          <p
            style={{
              margin: '2px 0 0',
              fontFamily: semantico.fonteRotulo,
              fontSize: 13,
              letterSpacing: 1,
              color: semantico.textoSecundario,
              textTransform: 'uppercase',
            }}
          >
            {rotuloLinha}
          </p>
        </div>
        <span
          style={{
            fontFamily: semantico.fonteTitulo,
            fontSize: 40,
            letterSpacing: 0.5,
            color: corFaixa,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {principal.confianca === null ? '—' : `${Math.round(principal.confianca)}%`}
        </span>
      </div>

      {/* TRÊS CAIXAS — média da temporada, aproveitamento, minutos recentes */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
        {[
          { rotulo: 'MÉDIA', valor: detalhe.mediaTemporada === null ? '—' : fmt(detalhe.mediaTemporada) },
          { rotulo: 'BATEU', valor: `${detalhe.bateu.acertos}/${detalhe.bateu.total}` },
          {
            rotulo: 'MIN',
            // Dado ausente não é zero minutos: é "não sabemos". Mostrar 0'
            // afirmaria um fato falso (padrão de UltimaAtualizacao).
            valor: detalhe.minutosRecentes === null ? '—' : `${Math.round(detalhe.minutosRecentes)}'`,
          },
        ].map((caixa) => (
          <div
            key={caixa.rotulo}
            style={{
              padding: '10px 8px',
              textAlign: 'center',
              borderRadius: 10,
              border: `1px solid ${semantico.divisor}`,
            }}
          >
            <p
              style={{
                margin: 0,
                fontFamily: semantico.fonteRotulo,
                fontSize: 11,
                letterSpacing: 1.5,
                color: semantico.textoSecundario,
                textTransform: 'uppercase',
              }}
            >
              {caixa.rotulo}
            </p>
            <p style={{ margin: '2px 0 0', fontFamily: semantico.fonteTitulo, fontSize: 20 }}>
              {caixa.valor}
            </p>
          </div>
        ))}
      </div>

      {/* ÚLTIMOS 5 JOGOS NA LINHA */}
      <h2
        style={{
          margin: '0 0 8px',
          fontFamily: semantico.fonteRotulo,
          fontSize: 12,
          letterSpacing: 1.5,
          color: semantico.textoSecundario,
          textTransform: 'uppercase',
        }}
      >
        ÚLTIMOS 5 JOGOS NA LINHA
      </h2>
      {detalhe.blocos.length === 0 ? (
        <p style={{ margin: '0 0 16px', fontSize: 13, color: semantico.textoSecundario }}>
          Sem histórico suficiente ainda.
        </p>
      ) : (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {detalhe.blocos.map((bloco, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  display: 'grid',
                  placeItems: 'center',
                  // Par PRÓPRIO das barrinhas: o verde do apito nível 3
                  // significa outra coisa. E falhar é vermelho, não neutro —
                  // com o ✓/· escrito, a cor nunca é o único sinal.
                  background: bloco.bateu ? semantico.barrinhaBateu : semantico.barrinhaFalhou,
                  color: bloco.bateu ? semantico.textoSobreCor : semantico.textoPrimario,
                  fontFamily: semantico.fonteTitulo,
                  fontSize: 16,
                }}
              >
                {/* Redundância obrigatória: a marca não é só a cor de fundo. */}
                {bloco.bateu ? '✓ ' : '· '}
                {bloco.valor}
              </div>
              <p
                style={{
                  margin: '4px 0 0',
                  fontFamily: semantico.fonteRotulo,
                  fontSize: 11,
                  letterSpacing: 1,
                  color: semantico.textoSecundario,
                  textTransform: 'uppercase',
                }}
              >
                {bloco.adversarioSigla}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* POR QUE ENTROU */}
      <h2
        style={{
          margin: '0 0 8px',
          fontFamily: semantico.fonteRotulo,
          fontSize: 12,
          letterSpacing: 1.5,
          color: semantico.textoSecundario,
          textTransform: 'uppercase',
        }}
      >
        POR QUE ENTROU
      </h2>
      <div
        style={{
          padding: '12px 14px',
          borderRadius: 12,
          border: `1px solid ${semantico.divisor}`,
          marginBottom: 16,
        }}
      >
        {detalhe.porQueEntrou.length === 0 ? (
          <p style={{ margin: 0, fontSize: 14, color: semantico.textoSecundario }}>
            Sem detalhamento disponível para este apito.
          </p>
        ) : (
          detalhe.porQueEntrou.map((frase, i) => (
            <p
              key={i}
              style={{
                margin: i === 0 ? 0 : '6px 0 0',
                fontSize: 14,
                color: semantico.textoPrimario,
              }}
            >
              {frase}
            </p>
          ))
        )}
      </div>

      {/* VER ESTATÍSTICAS */}
      <Link
        href={rotaDoJogador(principal.jogadorId)}
        style={{
          display: 'block',
          textAlign: 'center',
          padding: '14px 16px',
          borderRadius: 12,
          background: componente.ctaFundo,
          color: semantico.textoSobreCor,
          fontFamily: semantico.fonteTitulo,
          fontSize: 16,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          textDecoration: 'none',
          marginBottom: 24,
        }}
      >
        VER ESTATÍSTICAS
      </Link>

      <h2 style={{ fontSize: 15, margin: '0 0 4px' }}>Linhas de {UNIDADE[principal.atributo]}</h2>
      <p style={{ margin: '0 0 12px', fontSize: 12, color: semantico.textoSecundario }}>
        Escolha a linha que quer jogar. Quanto mais alta a linha, menor a confiança da análise.
      </p>

      <div style={{ display: 'grid', gap: 8 }}>
        {itens.map((item) => {
          const cotada = item.linha === null ? undefined : cotadas.get(item.linha)
          const estatica = item.linha === null ? undefined : referencia?.[String(item.linha)]
          const faixaOdd: [number, number] | undefined = cotada
            ? [cotada.min, cotada.max]
            : estatica
          return (
            <div
              key={item.chave}
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: 12,
                padding: '10px 14px',
                borderRadius: 10,
                background: semantico.superficie,
                border: `1px solid ${semantico.divisor}`,
              }}
            >
              <span style={{ fontWeight: 700, fontSize: 16 }}>
                {item.linha} {SIGLA[item.atributo]}
              </span>
              <span style={{ fontSize: 16, fontWeight: 700 }}>
                {item.confianca === null ? '—' : `${item.confianca}%`}
              </span>
              <span style={{ fontSize: 13, color: semantico.textoSecundario }}>
                {faixaOdd ? `odd ${formatarOdd(faixaOdd[0])} – ${formatarOdd(faixaOdd[1])}` : 'odd —'}
              </span>
            </div>
          )
        })}
      </div>

      <p style={{ margin: '10px 0 0', fontSize: 12, color: semantico.textoSecundario }}>
        {casasNaTela > 0
          ? `Faixa entre ${casasNaTela} casas na última coleta.`
          : 'Faixa da tabela de referência da plataforma.'}{' '}
        Não é a odd da sua casa: elas mudam todos os dias e variam entre casas.
      </p>

      <footer
        style={{
          marginTop: 24,
          paddingTop: 12,
          borderTop: `1px solid ${semantico.divisor}`,
          fontSize: 12,
          color: semantico.textoSecundario,
        }}
      >
        O percentual é a <strong>nota de confiança</strong> da análise do CJ, não uma
        probabilidade de acerto.
        {geradoEm ? ` · Última atualização: ${dataHora(geradoEm, ruleset.rodada.fuso)}` : ''}
      </footer>
    </Moldura>
  )
}
