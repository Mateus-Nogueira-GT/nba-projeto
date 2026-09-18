import Link from 'next/link'
import { notFound } from 'next/navigation'
import { z } from 'zod'

import { getDb } from '@/modules/dominio/db/cliente'
import { calendarioDoRuleset, temporadaDe } from '@/modules/dominio/temporada'
import { estadoExperienciaDoUsuario } from '@/modules/plataforma/experiencia/servico'
import { exigirNivel } from '@/modules/plataforma/assinatura/guarda'
import { lateralPadrao } from '@/app/(app)/lateral/montar'
import { atende } from '@/modules/plataforma/assinatura/nivel-do-plano'
import { ConviteDoPlano } from '@/components/planos/ConviteDoPlano'
import { apitosDoJogador, telaDoJogador } from '@/modules/entrega/estatisticas/jogador'
import type {
  ApitoDoJogador,
  LinhaHistorico,
  Numeros,
  TelaJogador,
} from '@/modules/entrega/estatisticas/jogador'
import {
  BASE_ESTATISTICAS,
  contextoEstatisticas,
  parametrosEstatisticas,
  rotaDoJogador,
  rotaDoJogo,
  rotaDoTime,
} from '@/modules/entrega/estatisticas/rotas'
import type { ContextoEstatisticas } from '@/modules/entrega/estatisticas/rotas'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import { diaMes } from '@/components/formato'
import { CabecalhoTela, Moldura } from '@/components/navegacao'
import { BotaoAcompanharJogador } from '@/components/preferencias/BotaoAcompanharJogador'
import {
  Avatar,
  IconeVeredito,
  NotaPartida,
  Tabela,
  UltimaAtualizacao,
} from '@/design-system/componentes'
import type { Coluna } from '@/design-system/componentes'
import { componente } from '@/design-system/tokens/componente'
import { semantico } from '@/design-system/tokens/semantico'
import '@/design-system/tokens/tokens.css'
import {
  LIMITE_DE_APITOS_DO_JOGADOR,
  resumoDosApitos,
  Secao,
  SemBanco,
  SOBRANCELHA_STATS,
} from '../../moldura'
import { SilhuetaPaga } from '@/components/planos/SilhuetaPaga'

export const dynamic = 'force-dynamic'

/**
 * O PERFIL DO JOGADOR — dado canônico, com o que a estratégia fez com ele
 * rotulado como tal.
 *
 * Quatro números no topo (pontos, rebotes, assistências e a NOTA média
 * recente, que é "o número" do jogador na identidade 04), o histórico de
 * apitos com ✓/✗ — a conferência verificável — e o jogo a jogo com a nota de
 * cada partida.
 *
 * As DUAS VISÕES DE TIME aparecem sempre, e sempre rotuladas: "time atual" é
 * `jogadores.time_id`, o real do provedor; "na lista do CJ" é `niveis`, o
 * elenco projetado da curadoria (Giannis no Miami). Elas divergem de
 * propósito, e sem rótulo a divergência é lida como bug.
 */

const ATRIBUTO_ROTULO: Record<ApitoDoJogador['atributo'], string> = {
  PONTOS: 'PONTOS',
  REBOTES: 'REBOTES',
  ASSISTENCIAS: 'ASSISTÊNCIAS',
}

/**
 * Nível do JOGADOR por extenso. Dicionário local, tipado pelo enum do schema:
 * a aba de estatísticas não importa do motor, nem tipo.
 */
type NivelDaLista = NonNullable<TelaJogador['timeNaListaDoCj']>['nivel']
const NIVEL_ROTULO: Record<NivelDaLista, string> = {
  MVP: 'MVP',
  ALL_STAR: 'All Star',
  SUPORTE: 'Suporte',
  RANDOLA: 'Randola',
}

/**
 * "vs SAS" / "@ SAS" — o confronto do ponto de vista do jogador, na MESMA
 * forma nas duas seções que o imprimem (o histórico de apitos e a tabela jogo
 * a jogo). As duas leem o mesmo mando, de `mandoDoJogador`.
 *
 * "—" quando não há mando: o vínculo jogador↔time não põe o jogador em nenhum
 * dos dois lados. Chutar "@ <time da casa>" dava como adversário um time que
 * podia ser o DELE.
 */
function confronto(l: { emCasa: boolean | null; adversarioSigla: string | null }): string {
  if (l.emCasa === null || l.adversarioSigla === null) return '—'
  return `${l.emCasa ? 'vs' : '@'} ${l.adversarioSigla}`
}

function num(v: number | null, casas = 1): string {
  if (v === null) return '—'
  return v.toFixed(casas).replace('.', ',')
}

function pct(v: number | null): string {
  return v === null ? '—' : `${v.toFixed(1).replace('.', ',')}%`
}

function colunas(fuso: string, hrefDoJogo: (id: string) => string): Coluna<LinhaHistorico>[] {
  return [
    {
      chave: 'jogo',
      rotulo: 'Jogo',
      fixa: true,
      celula: (l) => (
        <Link href={hrefDoJogo(l.jogoId)}>
          {/* MESMA forma curta da linha de apito ("5/9"): duas grafias da
              mesma data, a uma seção de distância, leem-se como dois dados. */}
          <span style={{ color: semantico.texto40, fontSize: 11, letterSpacing: 0.8 }}>
            {diaMes(l.data, fuso)}
          </span>{' '}
          <span style={{ color: semantico.texto70, fontWeight: 600 }}>{confronto(l)}</span>
        </Link>
      ),
    },
    {
      chave: 'estado',
      rotulo: 'Dado',
      celula: (l) =>
        l.estado === 'DNP' ? 'DNP' : l.estado === 'PENDENTE' ? 'Pendente' : 'Oficial',
    },
    {
      chave: 'min',
      rotulo: 'MIN',
      descricao: 'minutos',
      alinhamento: 'direita',
      celula: (l) => num(l.minutos, 0),
    },
    {
      chave: 'pts',
      rotulo: 'PTS',
      descricao: 'pontos',
      alinhamento: 'direita',
      celula: (l) => (l.estado === 'CONFERIDO' ? l.pontos : '—'),
    },
    {
      chave: 'reb',
      rotulo: 'REB',
      descricao: 'rebotes',
      alinhamento: 'direita',
      celula: (l) => (l.estado === 'CONFERIDO' ? l.rebotes : '—'),
    },
    {
      chave: 'ast',
      rotulo: 'AST',
      descricao: 'assistências',
      alinhamento: 'direita',
      celula: (l) => (l.estado === 'CONFERIDO' ? l.assistencias : '—'),
    },
    {
      chave: 'nota',
      rotulo: 'NOTA',
      descricao: 'nota da partida',
      alinhamento: 'direita',
      celula: (l) => <NotaPartida nota={l.nota} />,
    },
  ]
}

/** Uma das quatro caixas do topo. O valor é o protagonista tipográfico. */
function Numero({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: '10px 8px',
        borderRadius: 12,
        border: `1px solid ${semantico.divisor}`,
        background: componente.contextoFrio.cardGradiente,
        textAlign: 'center',
      }}
    >
      <div
        style={{
          fontFamily: semantico.fonteRotulo,
          fontSize: 10,
          letterSpacing: 1.2,
          fontWeight: 600,
          color: semantico.textoSecundario,
        }}
      >
        {rotulo}
      </div>
      {children}
    </div>
  )
}

function ValorGrande({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: semantico.fonteTitulo,
        fontSize: 24,
        letterSpacing: 0.5,
        marginTop: 2,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {children}
    </div>
  )
}

/**
 * O veredito de um apito. O ✓/✗ acompanha a cor — cor nunca é canal único.
 *
 * Quem não jogou não ganha nem ✓ nem ✗ (é neutro). Tudo o que ainda não tem
 * veredito — inclusive o jogo ENCERRADO cujo box score não chegou — fica em
 * "aguardando dado oficial": inferir de parcial, ou de ausência de dado, é o
 * que a spec §5.1 proíbe explicitamente.
 */
function Veredito({ apito }: { apito: ApitoDoJogador }) {
  const base = {
    fontFamily: semantico.fonteRotulo,
    fontSize: 14,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    fontVariantNumeric: 'tabular-nums',
  } as const

  if (apito.estado !== 'CONFERIDO') {
    // Estes dois não têm largura fixa e não podem ficar em `nowrap`: a 390 px
    // "aguardando dado oficial" empurraria o mercado para fora da linha.
    return (
      <span
        style={{ ...base, fontWeight: 500, color: componente.conferido.neutro, textAlign: 'right' }}
      >
        {apito.estado === 'NAO_JOGOU' ? 'não jogou' : 'aguardando dado oficial'}
      </span>
    )
  }

  const cor = apito.bateu ? componente.conferido.bateu : componente.conferido.falhou
  return (
    <span
      style={{
        ...base,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        whiteSpace: 'nowrap',
        fontWeight: 700,
        color: cor,
      }}
    >
      {`fez ${apito.fez}`}
      {/* O mesmo ✓/✗ NOMEADO do card conferido — cor nunca é canal único, e
          glifo cru não é verbalizado por boa parte dos leitores de tela. */}
      <IconeVeredito tipo={apito.bateu ? 'bateu' : 'falhou'} cor={cor} />
    </span>
  )
}

function LinhaDeApito({ apito, fuso }: { apito: ApitoDoJogador; fuso: string }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '52px 1fr auto',
        gap: 10,
        alignItems: 'center',
        padding: '9px 12px',
        borderRadius: 12,
        border: `1px solid ${semantico.divisor}`,
        background: componente.contextoFrio.cardGradiente,
        marginBottom: 6,
      }}
    >
      <span
        style={{
          fontFamily: semantico.fonteRotulo,
          fontSize: 11,
          letterSpacing: 1,
          color: semantico.texto55,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {/* MESMA coluna e MESMO fuso da tabela jogo a jogo. Formatar aqui
            `data_referencia` (rótulo de calendário, lido em UTC) e lá
            `data_hora_utc` fazia a MESMA partida sair "8/1" no apito e "9/1"
            três linhas abaixo, para todo jogo que começa às 22h ET. */}
        {diaMes(apito.data, fuso)}
      </span>
      <span
        style={{
          fontFamily: semantico.fonteRotulo,
          fontSize: 14,
          fontWeight: 600,
          letterSpacing: 0.8,
          textTransform: 'uppercase',
          minWidth: 0,
        }}
      >
        {/* Linha SEMPRE inteira, com "+" — nunca meio ponto. */}
        {`${ATRIBUTO_ROTULO[apito.atributo]} ${apito.linhaMaisBaixa}+`}
        <span
          style={{
            color: semantico.textoSecundario,
            fontWeight: 500,
            letterSpacing: 0.6,
            marginLeft: 6,
          }}
        >
          {confronto(apito)}
        </span>
      </span>
      <Veredito apito={apito} />
    </div>
  )
}

function Grupo({ titulo, itens }: { titulo: string; itens: [string, string][] }) {
  return (
    <div
      style={{
        border: `1px solid ${semantico.divisor}`,
        borderRadius: 12,
        padding: 12,
        background: semantico.superficie,
      }}
    >
      <h3
        style={{
          margin: '0 0 8px',
          fontFamily: semantico.fonteRotulo,
          // Menor e mais leve que o <h2> da seção que os contém: três títulos
          // do mesmo peso dentro de um só não formam hierarquia nenhuma.
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
          color: semantico.texto55,
        }}
      >
        {titulo}
      </h3>
      <dl style={{ margin: 0, display: 'grid', gap: 4 }}>
        {itens.map(([rotulo, valor]) => (
          <div
            key={rotulo}
            style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}
          >
            <dt style={{ color: semantico.textoSecundario }}>{rotulo}</dt>
            <dd style={{ margin: 0, fontVariantNumeric: 'tabular-nums' }}>{valor}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function NumerosCompletos({ n }: { n: Numeros }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 10,
      }}
    >
      {/* PTS, REB e AST já são três dos quatro números do topo: repeti-los
          aqui era o mesmo dado duas vezes na mesma tela. */}
      <Grupo
        titulo="Ataque"
        itens={[
          ['FG%', pct(n.ataque.fgPercentual)],
          ['2P%', pct(n.ataque.doisPercentual)],
          ['3P%', pct(n.ataque.tresPercentual)],
          ['LL%', pct(n.ataque.lancePercentual)],
        ]}
      />
      <Grupo
        titulo="Defesa"
        itens={[
          ['Ofensivos', num(n.defesa.rebotesOf)],
          ['Defensivos', num(n.defesa.rebotesDef)],
          ['Roubos', num(n.defesa.roubos)],
          ['Bloqueios', num(n.defesa.bloqueios)],
        ]}
      />
      <Grupo
        titulo="Posse"
        itens={[
          ['Minutos', num(n.posse.minutos)],
          ['Turnovers', num(n.posse.turnovers)],
          ['Faltas', num(n.posse.faltas)],
          ['Saldo em quadra', num(n.posse.saldoQuadra)],
        ]}
      />
    </div>
  )
}

/** Rótulo das duas visões de time: pequeno, condensado, sempre presente. */
function RotuloDeTime({ children }: { children: React.ReactNode }) {
  return <span style={{ color: semantico.texto70, fontWeight: 600 }}>{children}</span>
}

/**
 * A SIGLA QUE LEVA AO TIME — os únicos links do hero.
 *
 * Na cor do parágrafo e sem sublinhado eles eram indistinguíveis de texto
 * estático (WCAG 1.4.1: a cor, quando existe, nunca é canal único — aqui não
 * havia canal nenhum), e mais fracos que os rótulos vizinhos, que não são
 * links. O acento MAIS o sublinhado são dois canais, e é só isso que este link
 * faz. Os links de BLOCO da aba (índice, tabela do time) dispensam sublinhado
 * porque a borda e o fundo já os anunciam; este é inline, no meio de uma frase.
 *
 * SEM `inline-block` com padding, que estava aqui em nome do alvo de toque: o
 * alvo produzido parava em ~22 px (12 px de texto + 8 de padding), abaixo do
 * mínimo de 24 que ele dizia atingir, e o critério 2.5.8 do WCAG 2.2 tem
 * exceção explícita para alvo *Inline* — link dentro de frase, com o tamanho
 * limitado pela entrelinha do texto vizinho, que é exatamente este caso. O
 * custo, esse, era real: a caixa de linha de 18 px (12 px · 1,5) estourava e a
 * segunda linha do apoio ficava mais alta que a primeira, quebrando o ritmo do
 * `.apoio` do artboard.
 */
function LinkDeTime({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      style={{
        fontWeight: 700,
        color: semantico.textoPrimario,
        textDecoration: 'underline',
        textUnderlineOffset: 3,
      }}
    >
      {children}
    </a>
  )
}

export default async function PaginaJogador({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const contexto = contextoEstatisticas((await searchParams) ?? {})
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  if (!process.env.DATABASE_URL) return <SemBanco />

  const agora = new Date()
  const ruleset = await rulesetAtivo()
  const db = getDb()
  const calendario = calendarioDoRuleset(ruleset)
  const temporada = temporadaDe(agora, calendario)
  // O calendário vai junto porque a tabela jogo a jogo NOMEIA a temporada:
  // `jogos` guarda a data, não o rótulo, e sem ele a leitura não teria como
  // recortar a janela — o auxiliar voltaria a afirmar "temporada 2025-26"
  // sobre linhas que podem atravessar duas.
  const tela = await telaDoJogador(db, id, { temporada, calendario, periodo: contexto.periodo })
  if (tela === null) notFound()

  // R-A3: a aba inteira passa a exigir login — DEPOIS do "não encontrado",
  // não antes: um id que não existe responde 404 sem tocar sessão nem cookie
  // (mesma ordem que `sessaoAtual()` já respeitava aqui). O resumo (hero,
  // desempenho) continua grátis; a profundidade (apitos, jogo a jogo,
  // números completos) é MVP — ver a régua da spec §5.
  const { sessao, acesso } = await exigirNivel('GRATIS', `/estatisticas/jogador/${id}`)
  const experiencia = await estadoExperienciaDoUsuario(db, sessao.usuarioId)

  const { perfil, aoVivo, timeNaListaDoCj } = tela
  /** O caso comum: o time do provedor e o da lista do CJ são o mesmo. */
  const mesmoTimeNasDuasVisoes = timeNaListaDoCj !== null && timeNaListaDoCj.id === perfil.timeId
  // UM A MAIS que o limite: é assim que a tela sabe que cortou. Sem isso "14
  // de 20 bateu" era lido como o retrospecto inteiro de um jogador que tem 60
  // apitos — numa seção que a spec §4.5 chama de confiança verificável.
  const lista = await apitosDoJogador(db, id, LIMITE_DE_APITOS_DO_JOGADOR + 1)
  const apitos = lista.slice(0, LIMITE_DE_APITOS_DO_JOGADOR)
  const truncado = lista.length > LIMITE_DE_APITOS_DO_JOGADOR

  const rotuloPeriodo =
    contexto.periodo === 'temporada' ? `Temporada ${temporada}` : `Últimos ${contexto.periodo}`
  const amostra = tela.recorte!
  const recorte = `${rotuloPeriodo} · ${amostra.disponiveis} partida${amostra.disponiveis === 1 ? '' : 's'} ${amostra.disponiveis === 1 ? 'disponível' : 'disponíveis'}`
  const identidade = [perfil.posicao, recorte].filter(Boolean).join(' · ')
  const hrefDoJogo = (jogoId: string) =>
    `${rotaDoJogo(jogoId)}?jogador=${id}&${parametrosEstatisticas(contexto)}`
  // A PROFUNDIDADE — apitos, jogo a jogo e números completos — é MVP; o
  // resumo acima (quatro números, hero) continua grátis para todo mundo.
  const profundidade = atende(acesso.nivel, 'MVP')

  return (
    <Moldura aba="stats" largura="dados" conta={{ email: sessao.email }}
      lateral={await lateralPadrao({
        assistente: atende(acesso.nivel, 'MVP'),
        gratis: !atende(acesso.nivel, 'MVP'),
      })} assistente={atende(acesso.nivel, 'MVP')}>
      {/* Cabeçalho SEM título: o nome do jogador é o <h1> do hero, ao lado do
          rosto, como no artboard. Repeti-lo aqui em 30 px seria o mesmo nome
          duas vezes, e deixava o hero com um rosto de 72 px ao lado de duas
          linhas de 12. */}
      <CabecalhoTela
        sobrancelha={SOBRANCELHA_STATS}
        voltarHref={
          contexto.q
            ? `${BASE_ESTATISTICAS}?q=${encodeURIComponent(contexto.q)}`
            : BASE_ESTATISTICAS
        }
      />

      {/* HERO — rosto, nome, quem é, e as duas visões de time.
          Sem anel de apito: a aba não calcula estratégia (`nivelApito: null` é
          a marca disso, não um esquecimento). */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <Avatar
          nome={perfil.nome}
          fotoUrl={perfil.fotoUrl}
          timeSigla={perfil.timeSigla ?? ''}
          nivelApito={null}
          tamanho={72}
          raio={16}
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
            {perfil.nome}
          </h1>
          <div
            style={{
              marginTop: 4,
              fontFamily: semantico.fonteRotulo,
              fontSize: 12,
              letterSpacing: 1.2,
              lineHeight: 1.5,
              textTransform: 'uppercase',
              color: semantico.textoSecundario,
            }}
          >
            <p style={{ margin: 0 }}>{identidade}</p>
            <p style={{ margin: 0 }}>
              <RotuloDeTime>TIME ATUAL</RotuloDeTime>{' '}
              {perfil.timeId ? (
                <LinkDeTime href={rotaDoTime(perfil.timeId)}>{perfil.timeSigla ?? '—'}</LinkDeTime>
              ) : (
                '—'
              )}{' '}
              · <RotuloDeTime>NA CURADORIA NIP</RotuloDeTime>{' '}
              {/* As DUAS visões são escritas sempre — é o rótulo que separa
                  uma da outra, e sem ele a divergência é lida como bug. Mas
                  quando elas coincidem (o caso comum) o destino é o MESMO:
                  dois links laranja sublinhados idênticos a poucos pixels um
                  do outro são ruído para quem vê e dois destinos iguais na
                  lista de links do leitor de tela. A sigla repetida fica em
                  texto — que é como o artboard escreve as duas. */}
              {timeNaListaDoCj === null ? (
                '—'
              ) : mesmoTimeNasDuasVisoes ? (
                timeNaListaDoCj.sigla
              ) : (
                <LinkDeTime href={rotaDoTime(timeNaListaDoCj.id)}>
                  {timeNaListaDoCj.sigla}
                </LinkDeTime>
              )}
              {timeNaListaDoCj && ` · ${NIVEL_ROTULO[timeNaListaDoCj.nivel]} em pontos`}
            </p>
          </div>
        </div>
      </div>

      {experiencia && (
        <div style={{ marginTop: 12 }}>
          <BotaoAcompanharJogador
            jogadorId={id}
            inicial={experiencia.jogadoresAcompanhados.includes(id)}
          />
        </div>
      )}

      {!perfil.ativo && (
        <p
          style={{
            margin: '12px 0 0',
            padding: '8px 10px',
            borderRadius: 8,
            fontSize: 13,
            color: semantico.alerta,
            border: `1px solid ${semantico.alerta}`,
          }}
        >
          Jogador fora da liga segundo o provedor.
        </p>
      )}

      <nav
        aria-label="Período das estatísticas"
        style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}
      >
        {(['5', '10', 'temporada'] as const).map((periodo) => (
          <Link
            key={periodo}
            aria-current={contexto.periodo === periodo ? 'page' : undefined}
            href={rotaDoJogador(id, { ...contexto, periodo })}
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              border: `1px solid ${contexto.periodo === periodo ? 'transparent' : semantico.divisor}`,
              background: contexto.periodo === periodo ? semantico.acento : 'transparent',
              color:
                contexto.periodo === periodo
                  ? semantico.textoSobreAcento
                  : semantico.textoPrimario,
            }}
          >
            {periodo === 'temporada' ? 'Temporada' : `Últimos ${periodo}`}
          </Link>
        ))}
      </nav>
      <p style={{ color: semantico.textoSecundario, fontSize: 12 }}>
        {`${amostra.conferidos} com dado oficial · ${amostra.dnp} DNP · ${amostra.pendentes} pendente${amostra.pendentes === 1 ? '' : 's'}. Médias apenas das partidas com participação confirmada.`}
      </p>

      {/* QUATRO NÚMEROS — os três do box e a NOTA, que é o número do jogador. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: 8,
          marginTop: 16,
        }}
      >
        <Numero rotulo="PTS">
          <ValorGrande>{num(tela.perfilNumeros.ataque.pontos)}</ValorGrande>
        </Numero>
        <Numero rotulo="REB">
          <ValorGrande>{num(tela.perfilNumeros.defesa.rebotesTotal)}</ValorGrande>
        </Numero>
        <Numero rotulo="AST">
          <ValorGrande>{num(tela.perfilNumeros.ataque.assistencias)}</ValorGrande>
        </Numero>
        {/* A nota tem paleta PRÓPRIA e não vira número de impacto: ela mede
            desempenho já acontecido, não a força de um sinal. */}
        <Numero rotulo="NOTA · RECORTE">
          <div style={{ marginTop: 4 }}>
            <NotaPartida nota={tela.notaMediaRecente} destaque />
          </div>
        </Numero>
      </div>

      {aoVivo && (
        <section
          aria-label="Em jogo agora"
          style={{
            border: `1px solid ${semantico.apitoModoFire}`,
            borderRadius: 12,
            padding: 12,
            background: semantico.superficieElevada,
            marginTop: 16,
          }}
        >
          <h2
            style={{
              margin: '0 0 6px',
              fontFamily: semantico.fonteRotulo,
              fontSize: 12,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
              color: semantico.apitoModoFire,
            }}
          >
            Em jogo · {aoVivo.adversarioSigla}
            {aoVivo.quartoAtual !== null && ` · ${aoVivo.quartoAtual}º quarto`}
            {aoVivo.tempoRestante && ` · ${aoVivo.tempoRestante}`}
          </h2>
          <p style={{ margin: 0, fontSize: 20, fontVariantNumeric: 'tabular-nums' }}>
            {aoVivo.pontos} PTS · {aoVivo.rebotes} REB · {aoVivo.assistencias} AST
            {aoVivo.placar && (
              <span style={{ fontSize: 13, color: semantico.textoSecundario }}>
                {' '}
                · placar {aoVivo.placar}
              </span>
            )}
          </p>
          {aoVivo.porQuarto.length > 0 && (
            <p style={{ margin: '6px 0 0', fontSize: 12, color: semantico.textoSecundario }}>
              {aoVivo.porQuarto.map((q) => `${q.quarto}º: ${q.pontos}`).join(' · ')}
            </p>
          )}
        </section>
      )}

      <Secao
        titulo={`Desempenho · ${ROTULO_ATRIBUTO[contexto.atributo]}`}
        aux={`${recorte} · jogo inteiro`}
      >
        <nav
          aria-label="Atributo das estatísticas"
          style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}
        >
          {(['PONTOS', 'REBOTES', 'ASSISTENCIAS'] as const).map((atributo) => (
            <Link
              key={atributo}
              aria-current={contexto.atributo === atributo ? 'page' : undefined}
              href={rotaDoJogador(id, { ...contexto, atributo })}
              style={{
                padding: '8px 10px',
                borderRadius: 8,
                border: `1px solid ${contexto.atributo === atributo ? 'transparent' : semantico.divisor}`,
                background: contexto.atributo === atributo ? semantico.acento : 'transparent',
                color:
                  contexto.atributo === atributo
                    ? semantico.textoSobreAcento
                    : semantico.textoPrimario,
              }}
            >
              {ROTULO_ATRIBUTO[atributo]}
            </Link>
          ))}
        </nav>
        <GraficoDeDesempenho
          historico={tela.historico}
          atributo={contexto.atributo}
          fuso={ruleset.rodada.fuso}
          hrefDoJogo={hrefDoJogo}
        />
      </Secao>

      {/* APITOS — o que a ESTRATÉGIA fez com este jogador, conferido. É a
          única parte da aba que fala de apito, e por isso vem rotulada. */}
      {/* O auxiliar mora em `resumoDosApitos` (moldura): ele tem três casos
          que se contradizem em silêncio, e caso que se contradiz em silêncio
          precisa de teste. */}
      <Secao
        titulo="Apitos da estratégia"
        aux={profundidade ? resumoDosApitos(apitos, truncado) : undefined}
      >
        {!profundidade ? (
          <SilhuetaPaga forma="cards">
            <ConviteDoPlano
              minimo="MVP"
              recurso="O histórico de apitos"
              voltar={`/estatisticas/jogador/${id}`}
            />
          </SilhuetaPaga>
        ) : apitos.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: semantico.textoSecundario }}>
            A Lista Secreta ainda não apitou este jogador.
          </p>
        ) : (
          /* Lista semântica, como nas outras telas da aba: sem ela o leitor de
             tela perde a contagem de itens da seção. */
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {apitos.map((apito) => (
              <li key={`${apito.jogoId}-${apito.atributo}`}>
                <LinhaDeApito apito={apito} fuso={ruleset.rodada.fuso} />
              </li>
            ))}
          </ul>
        )}
      </Secao>

      {/* O auxiliar PRECISA dizer o corte: a tabela para no limite do histórico
          e o hero, duas linhas acima, conta a temporada inteira. Some no
          grátis de propósito — ele descreve um recorte de um conteúdo que
          não está lá. */}
      <Secao titulo="Jogo a jogo" aux={profundidade ? recorte : undefined}>
        {profundidade ? (
          <Tabela
            legenda="Uma linha por partida, da mais recente para a mais antiga"
            colunas={colunas(ruleset.rodada.fuso, hrefDoJogo)}
            linhas={tela.historico}
            chaveDaLinha={(l) => l.jogoId}
            vazio="Nenhuma partida registrada para este jogador."
          />
        ) : (
          <SilhuetaPaga forma="tabela">
            <ConviteDoPlano
              minimo="MVP"
              recurso="O jogo a jogo"
              voltar={`/estatisticas/jogador/${id}`}
            />
          </SilhuetaPaga>
        )}
      </Secao>

      {/* Estas médias (FG%, 2P%, LL%, rebotes, roubos, saldo…) nascem da MESMA
          janela cortada — o recorte vale para elas do mesmo jeito. */}
      <Secao
        titulo="Números completos"
        aux={profundidade ? `${recorte} · médias de jogo inteiro` : undefined}
      >
        {profundidade ? (
          <NumerosCompletos n={tela.perfilNumeros} />
        ) : (
          <SilhuetaPaga forma="numeros">
            <ConviteDoPlano
              minimo="MVP"
              recurso="Os números completos"
              voltar={`/estatisticas/jogador/${id}`}
            />
          </SilhuetaPaga>
        )}
      </Secao>

      <UltimaAtualizacao
        em={tela.atualizacao.em}
        fonte={tela.atualizacao.fonte}
        agora={agora}
        fuso={ruleset.rodada.fuso}
      />
    </Moldura>
  )
}

const ROTULO_ATRIBUTO: Record<ContextoEstatisticas['atributo'], string> = {
  PONTOS: 'Pontos',
  REBOTES: 'Rebotes',
  ASSISTENCIAS: 'Assistências',
}

function GraficoDeDesempenho({
  historico,
  atributo,
  fuso,
  hrefDoJogo,
}: {
  historico: LinhaHistorico[]
  atributo: ContextoEstatisticas['atributo']
  fuso: string
  hrefDoJogo: (id: string) => string
}) {
  const valor = (l: LinhaHistorico) =>
    atributo === 'PONTOS' ? l.pontos : atributo === 'REBOTES' ? l.rebotes : l.assistencias
  const maior = Math.max(1, ...historico.filter((l) => l.estado === 'CONFERIDO').map(valor))
  if (historico.length === 0) return <p>Nenhuma partida disponível neste recorte.</p>
  return (
    <div style={{ overflowX: 'auto' }}>
      <ol
        aria-label={`${ROTULO_ATRIBUTO[atributo]} por partida, da mais antiga para a mais recente`}
        style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
          display: 'flex',
          gap: 8,
          minWidth: historico.length * 42,
        }}
      >
        {[...historico].reverse().map((l) => (
          <li key={l.jogoId} style={{ flex: 1, textAlign: 'center', minWidth: 34 }}>
            <Link
              href={hrefDoJogo(l.jogoId)}
              style={{ color: semantico.textoPrimario, textDecoration: 'none' }}
            >
              <span
                style={{
                  height: 115,
                  display: 'flex',
                  alignItems: 'flex-end',
                  justifyContent: 'center',
                }}
              >
                <span
                  style={{
                    display: 'block',
                    width: 20,
                    height: l.estado === 'CONFERIDO' ? Math.max(2, (valor(l) / maior) * 100) : 2,
                    background: l.estado === 'CONFERIDO' ? semantico.acento : semantico.divisor,
                    borderRadius: 3,
                  }}
                />
              </span>
              <strong style={{ display: 'block', marginTop: 4, fontSize: 12 }}>
                {l.estado === 'CONFERIDO' ? valor(l) : l.estado === 'DNP' ? 'DNP' : 'Pendente'}
              </strong>
              <span style={{ display: 'block', fontSize: 11, marginTop: 4 }}>
                {diaMes(l.data, fuso)}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  )
}
