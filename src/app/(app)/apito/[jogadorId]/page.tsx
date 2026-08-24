import Link from 'next/link'
import { redirect } from 'next/navigation'

import { dataHora } from '@/components/formato'
import { Moldura } from '@/components/navegacao'
import { dataDeReferencia } from '@/modules/dominio/rodada'
import { getDb } from '@/modules/dominio/db/cliente'
import { linhasDoJogador } from '@/modules/entrega/lista-secreta'
import { faixasDoJogador } from '@/modules/entrega/odds/leitura'
import { rotaDoJogador } from '@/modules/entrega/estatisticas/rotas'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
// Os valores vêm do enum do BANCO, não do motor: a fronteira permite tipo,
// nunca valor, e a lista de atributos é a mesma nos dois lados.
import { atributoEnum } from '@/modules/dominio/db/schema'
import type { Atributo } from '@/modules/motor/tipos'
import { CardEntrada } from '@/design-system/componentes'
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
export const metadata = { title: 'Linhas e confiança · IA da NBA' }

function formatarOdd(v: number): string {
  return v.toFixed(2).replace('.', ',')
}


/**
 * DETALHE DO APITO — os "quadradinhos" que o documento do CJ pede.
 *
 * Cada linha de pontos tem sua própria nota de confiança (a tabela base do
 * nível, mais o bônus do nível de apito) e sua faixa de odds. O documento é
 * explícito: a plataforma NÃO tem acesso direto à odd da casa, trabalha com
 * uma aproximação — por isso a faixa aparece rotulada como referência.
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
        <p style={{ margin: '0 0 12px', fontSize: 12 }}>
          <Link href="/" style={{ color: semantico.textoSecundario }}>
            ← Lista Secreta
          </Link>
        </p>
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

  return (
    <Moldura aba={null}>
      <p style={{ margin: '0 0 12px', fontSize: 12 }}>
        <Link href="/" style={{ color: semantico.textoSecundario }}>
          ← Lista Secreta
        </Link>
      </p>

      <CardEntrada
        nome={principal.nome}
        jogadorHref={rotaDoJogador(principal.jogadorId)}
        timeSigla={principal.timeSigla}
        timeNome={principal.timeNome}
        posicao={principal.posicao}
        atributo={principal.atributo}
        nivelJogador={principal.nivelJogador}
        nivelApito={principal.nivelApito}
        confianca={principal.confianca}
        grauConfianca={null}
        turbo={principal.turbo}
        modoFire={principal.modoFire}
        opdOrigemNivel={principal.opdOrigemNivel}
        alvo1Q={principal.alvo1Q}
      />

      <h2 style={{ fontSize: 15, margin: '20px 0 4px' }}>Linhas de {UNIDADE[principal.atributo]}</h2>
      <p style={{ margin: '0 0 12px', fontSize: 12, color: semantico.textoSecundario }}>
        Escolha a linha que quer jogar. Quanto mais alta a linha, menor a confiança da análise.
      </p>

      <div style={{ display: 'grid', gap: 8 }}>
        {itens.map((item) => {
          const cotada = item.linha === null ? undefined : cotadas.get(item.linha)
          const estatica = item.linha === null ? undefined : referencia?.[String(item.linha)]
          const faixa: [number, number] | undefined = cotada
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
                {faixa ? `odd ${formatarOdd(faixa[0])} – ${formatarOdd(faixa[1])}` : 'odd —'}
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
