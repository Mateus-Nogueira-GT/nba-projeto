import { notFound } from 'next/navigation'

import { getDb } from '@/modules/dominio/db/cliente'
import { dataDeReferencia } from '@/modules/dominio/rodada'
import { calendarioDoRuleset, temporadaDe } from '@/modules/dominio/temporada'
import { exigirAcessoEstatisticasSeConfigurado } from '@/modules/plataforma/assinatura/guarda'
import { telaJogosDoDia } from '@/modules/entrega/estatisticas/jogos-do-dia'
import { hierarquiaDoTime, telaDoTime } from '@/modules/entrega/estatisticas/time'
import type { BoxScoreDoJogo } from '@/modules/entrega/estatisticas/time'
import {
  BASE_ESTATISTICAS,
  rotaDoJogador,
  rotaDoJogo,
  rotaDoTime,
} from '@/modules/entrega/estatisticas/rotas'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import { diaCurto } from '@/components/formato'
import { CabecalhoTela, Moldura } from '@/components/navegacao'
import { HierarquiaDoTime, Tabela, UltimaAtualizacao } from '@/design-system/componentes'
import type { Coluna } from '@/design-system/componentes'
import { componente } from '@/design-system/tokens/componente'
import { semantico } from '@/design-system/tokens/semantico'
import '@/design-system/tokens/tokens.css'
import { Secao, SemBanco, SOBRANCELHA_STATS } from '../../moldura'

/**
 * OS TRÊS ATRIBUTOS DA HIERARQUIA, na forma curta do rodapé do card (PTS ·
 * REB · AST) e por extenso no título da seção.
 *
 * O tipo nasce daqui e não do motor: a aba de estatísticas não importa o
 * motor, nem tipo (`.dependency-cruiser.cjs` >
 * `estatisticas-nao-passam-pelo-motor`).
 */
const ATRIBUTOS_DA_HIERARQUIA = [
  { valor: 'PONTOS', curto: 'PTS', porExtenso: 'PONTOS' },
  { valor: 'REBOTES', curto: 'REB', porExtenso: 'REBOTES' },
  { valor: 'ASSISTENCIAS', curto: 'AST', porExtenso: 'ASSISTÊNCIAS' },
] as const

type AtributoDaHierarquia = (typeof ATRIBUTOS_DA_HIERARQUIA)[number]['valor']

/** `?atributo=` é entrada de usuário: valor desconhecido cai em PONTOS. */
function atributoPedido(bruto: string | string[] | undefined): AtributoDaHierarquia {
  const valor = Array.isArray(bruto) ? bruto[0] : bruto
  return ATRIBUTOS_DA_HIERARQUIA.find((a) => a.valor === valor)?.valor ?? 'PONTOS'
}

export const dynamic = 'force-dynamic'

function pct(v: number | null): string {
  return v === null ? '—' : `${v.toFixed(1).replace('.', ',')}%`
}

/** Ausência é '—', nunca zero: zero é um número, ausência não é. */
function n(v: number | null | undefined): string {
  return v === null || v === undefined ? '—' : String(v)
}

/**
 * Box score por jogo COM QUEBRA POR QUARTO.
 *
 * A prorrogação só ganha coluna quando existe: uma coluna "PR" zerada em todas
 * as linhas rouba largura numa tabela que já rola de lado no celular.
 */
function colunas(temProrrogacao: boolean, fuso: string): Coluna<BoxScoreDoJogo>[] {
  const base: Coluna<BoxScoreDoJogo>[] = [
    {
      chave: 'jogo',
      rotulo: 'Jogo',
      fixa: true,
      celula: (l) => (
        <span>
          <a href={rotaDoJogo(l.jogoId)} style={{ color: semantico.textoPrimario }}>
            {diaCurto(l.data, fuso)}
          </a>{' '}
          <span style={{ color: semantico.textoSecundario }}>
            {l.emCasa ? 'vs' : '@'} {l.adversarioSigla}
          </span>
        </span>
      ),
    },
    {
      chave: 'res',
      rotulo: 'Res',
      descricao: 'Resultado',
      celula: (l) =>
        l.resultado === null ? (
          '—'
        ) : (
          <span style={{ fontWeight: 700 }}>
            {l.resultado}
            {l.placar && (
              <span style={{ fontWeight: 400, color: semantico.textoSecundario }}> {l.placar}</span>
            )}
          </span>
        ),
    },
    {
      chave: 'q1',
      rotulo: '1º',
      descricao: 'Pontos no 1º quarto',
      alinhamento: 'direita',
      celula: (l) => n(l.nosso?.q1),
    },
    {
      chave: 'q2',
      rotulo: '2º',
      descricao: 'Pontos no 2º quarto',
      alinhamento: 'direita',
      celula: (l) => n(l.nosso?.q2),
    },
    {
      chave: 'q3',
      rotulo: '3º',
      descricao: 'Pontos no 3º quarto',
      alinhamento: 'direita',
      celula: (l) => n(l.nosso?.q3),
    },
    {
      chave: 'q4',
      rotulo: '4º',
      descricao: 'Pontos no 4º quarto',
      alinhamento: 'direita',
      celula: (l) => n(l.nosso?.q4),
    },
  ]

  if (temProrrogacao) {
    base.push({
      chave: 'pr',
      rotulo: 'PR',
      descricao: 'Prorrogação',
      alinhamento: 'direita',
      celula: (l) => n(l.nosso?.prorrogacao),
    })
  }

  return [
    ...base,
    {
      chave: 'tot',
      rotulo: 'TOT',
      descricao: 'Total de pontos',
      alinhamento: 'direita',
      celula: (l) => n(l.nosso?.total),
    },
    {
      chave: 'reb',
      rotulo: 'REB',
      descricao: 'Rebotes',
      alinhamento: 'direita',
      celula: (l) => n(l.rebotesTotal),
    },
    {
      chave: 'ast',
      rotulo: 'AST',
      descricao: 'Assistências',
      alinhamento: 'direita',
      celula: (l) => n(l.assistencias),
    },
    {
      chave: 'to',
      rotulo: 'TO',
      descricao: 'Turnovers',
      alinhamento: 'direita',
      celula: (l) => n(l.turnovers),
    },
    {
      chave: 'fg',
      rotulo: 'FG%',
      descricao: 'Aproveitamento de quadra',
      alinhamento: 'direita',
      celula: (l) => pct(l.fgPercentual),
    },
    {
      chave: 'tres',
      rotulo: '3P%',
      descricao: 'Aproveitamento de três',
      alinhamento: 'direita',
      celula: (l) => pct(l.tresPercentual),
    },
  ]
}

/**
 * UM NÚMERO DA CAMPANHA — rótulo condensado por cima, número em Anton por
 * baixo. Era uma caixinha com borda e fundo próprios; a identidade 04 obtém
 * densidade REMOVENDO cromo (spec §2), então a moldura sai e ficam a
 * tipografia e o espaço.
 */
function Numero({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div style={{ minWidth: 62 }}>
      <div
        style={{
          fontFamily: semantico.fonteRotulo,
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
          color: semantico.texto55,
        }}
      >
        {rotulo}
      </div>
      <div
        style={{
          fontFamily: semantico.fonteTitulo,
          fontSize: 24,
          letterSpacing: 0.5,
          marginTop: 2,
          color: semantico.texto100,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {valor}
      </div>
    </div>
  )
}

/**
 * O SELETOR DE ATRIBUTO DA HIERARQUIA — as mesmas abas PTS · REB · AST do
 * rodapé do card (`componente.abaAtributo`), aqui trocando a hierarquia lida.
 * O estado vai na URL: a tela é servidor puro, e o link é compartilhável.
 */
function AbasDeAtributo({ timeId, ativo }: { timeId: string; ativo: AtributoDaHierarquia }) {
  const abas = componente.abaAtributo

  return (
    <nav aria-label="Atributo da hierarquia" style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
      {ATRIBUTOS_DA_HIERARQUIA.map((atributo) => {
        const ativa = atributo.valor === ativo
        return (
          <a
            key={atributo.valor}
            href={`${rotaDoTime(timeId)}?atributo=${atributo.valor}`}
            aria-current={ativa ? 'page' : undefined}
            style={{
              padding: '5px 12px',
              borderRadius: abas.raio,
              fontFamily: semantico.fonteRotulo,
              fontSize: 12,
              fontWeight: ativa ? 700 : 600,
              letterSpacing: 1.2,
              textTransform: 'uppercase',
              textDecoration: 'none',
              border: `1px solid ${ativa ? abas.bordaAtiva : abas.bordaInativa}`,
              background: ativa ? abas.fundoAtiva : 'transparent',
              color: ativa ? abas.textoAtiva : abas.textoInativa,
            }}
          >
            {atributo.curto}
          </a>
        )
      })}
    </nav>
  )
}

export default async function PaginaTime({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await exigirAcessoEstatisticasSeConfigurado()
  const { id } = await params
  const { atributo: atributoBruto } = await searchParams
  if (!process.env.DATABASE_URL) return <SemBanco />

  const atributo = atributoPedido(atributoBruto)
  const agora = new Date()
  const ruleset = await rulesetAtivo()
  const { fuso } = ruleset.rodada
  const temporada = temporadaDe(agora, calendarioDoRuleset(ruleset))
  const db = getDb()
  const tela = await telaDoTime(db, id, { temporada })
  if (tela === null) notFound()

  /*
   * QUAL JOGO MARCA O DESFALQUE.
   *
   * `lesoes_escalacao` é por JOGO, então a hierarquia só sabe quem está fora
   * quando existe um jogo para consultar. O jogo do dia deste time é esse
   * jogo; sem jogo hoje, ninguém é marcado — e a tela DIZ isso, em vez de
   * mostrar um elenco inteiro em quadra que ela não verificou.
   */
  const doDia = await telaJogosDoDia(db, dataDeReferencia(agora, fuso), fuso)
  const jogoDeHoje = doDia.jogos.find((j) => j.casa.id === id || j.visitante.id === id) ?? null
  const hierarquia = await hierarquiaDoTime(db, id, atributo, jogoDeHoje?.id ?? null)

  const { time, campanha } = tela
  const porExtenso = ATRIBUTOS_DA_HIERARQUIA.find((a) => a.valor === atributo)!.porExtenso
  const temProrrogacao = tela.jogosDoTime.some((j) => (j.nosso?.prorrogacao ?? 0) > 0)

  return (
    <Moldura aba={null}>
      <CabecalhoTela
        sobrancelha={SOBRANCELHA_STATS}
        titulo={`${time.sigla} · ${time.nome}`}
        voltarHref={BASE_ESTATISTICAS}
      />
      {time.conferencia && (
        <p style={{ margin: '0 0 12px', fontSize: 13, color: semantico.texto55 }}>
          {time.conferencia}
        </p>
      )}

      <Secao titulo="Campanha" aux={`temporada ${temporada}`}>
        {campanha === null ? (
          <p style={{ fontSize: 13, color: semantico.textoSecundario }}>
            Sem classificação registrada para esta temporada.
          </p>
        ) : (
          <div
            style={{
              display: 'flex',
              gap: 20,
              flexWrap: 'wrap',
              paddingBottom: 12,
              borderBottom: `1px solid ${semantico.divisorSuave}`,
            }}
          >
            <Numero
              rotulo="Classif."
              valor={campanha.posicao === null ? '—' : `${campanha.posicao}º`}
            />
            <Numero rotulo="V–D" valor={`${campanha.vitorias}–${campanha.derrotas}`} />
            <Numero
              rotulo="Aprov."
              valor={
                campanha.aproveitamento === null
                  ? '—'
                  : `${(campanha.aproveitamento * 100).toFixed(1).replace('.', ',')}%`
              }
            />
            <Numero rotulo="Seq." valor={campanha.sequencia ?? '—'} />
          </div>
        )}
      </Secao>

      {/*
       * A HIERARQUIA DO CJ — a curadoria, PROJETADA (Giannis no Miami), não o
       * elenco do provedor. Os dois convivem nesta tela e por isso cada um
       * carrega o seu rótulo: aqui "lista do CJ", no elenco "time atual".
       */}
      <Secao titulo={`Hierarquia do CJ · ${porExtenso}`} aux="lista do CJ">
        <AbasDeAtributo timeId={time.id} ativo={atributo} />
        {jogoDeHoje === null && hierarquia.length > 0 && (
          <p style={{ margin: '0 0 10px', fontSize: 12, color: semantico.texto40 }}>
            Sem jogo hoje: nenhum desfalque a marcar.
          </p>
        )}
        <HierarquiaDoTime
          linhas={hierarquia}
          hrefDoJogador={rotaDoJogador}
          vazio="A lista do CJ ainda não classifica este time neste atributo."
        />
      </Secao>

      {/* A ORDEM das linhas era dita só pela legenda da tabela, que a
          identidade 04 mandou para o leitor de tela (`Tabela` clipa o
          `caption`, e o título da seção acima já a nomeia). Ela volta ao texto
          visível pelo auxiliar da seção — nenhuma outra parte da tela dizia. */}
      <Secao titulo="Box score por jogo" aux="da mais recente para a mais antiga">
        <Tabela
          legenda="Pontos por quarto, da partida mais recente para a mais antiga"
          colunas={colunas(temProrrogacao, fuso)}
          linhas={tela.jogosDoTime}
          chaveDaLinha={(l) => l.jogoId}
          vazio="Nenhuma partida registrada para este time."
        />
      </Secao>

      <Secao titulo="Elenco" aux="time atual">
        {tela.elenco.length === 0 ? (
          <p style={{ fontSize: 13, color: semantico.textoSecundario }}>
            Nenhum jogador vinculado a este time.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {tela.elenco.map((j) => (
              <li key={j.id} style={{ borderBottom: `1px solid ${semantico.divisorSuave}` }}>
                <a
                  href={rotaDoJogador(j.id)}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    gap: 10,
                    padding: '9px 2px',
                    color: semantico.texto100,
                    textDecoration: 'none',
                    fontFamily: semantico.fonteRotulo,
                    fontSize: 14,
                    fontWeight: 600,
                    letterSpacing: 0.6,
                  }}
                >
                  <span>{j.nome}</span>
                  <span
                    style={{
                      color: semantico.texto55,
                      fontSize: 12,
                      letterSpacing: 1,
                      fontVariantNumeric: 'tabular-nums',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {[j.posicao, j.numeroCamisa !== null ? `nº ${j.numeroCamisa}` : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </Secao>

      <UltimaAtualizacao
        em={tela.atualizacao.em}
        fonte={tela.atualizacao.fonte}
        agora={agora}
        fuso={fuso}
      />
    </Moldura>
  )
}
