import Link from 'next/link'
import { redirect } from 'next/navigation'

import { getDb } from '@/modules/dominio/db/cliente'
import {
  agruparFireLivePorJogo,
  alvosAguardandoPorJogo,
  comAlvoDoModoFire,
  lerFeedFireLive,
} from '@/modules/entrega/fire-live/leitura'
import type {
  EstadoDoJogoNoFireLive,
  EstadoVazio,
  FiltroFireLive,
  GrupoFireLive,
  ItemFireLiveNaTela,
} from '@/modules/entrega/fire-live/leitura'
import { confrontoDoItem, estadoDoCiclo } from '@/modules/entrega/lista-por-jogo'
import { lerFeed } from '@/modules/entrega/lista-secreta'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import { rotaDoJogador } from '@/modules/entrega/estatisticas/rotas'
import {
  CabecalhoJogo,
  CardEntrada,
  SeloContexto,
  UltimaAtualizacao,
} from '@/design-system/componentes'
import { semantico } from '@/design-system/tokens/semantico'
import { sessaoAtual } from '@/modules/plataforma/auth/cookies'
import { filtrarOcultos, jogadoresOcultosComNome } from '@/modules/plataforma/jogadores-ocultos'
import { exibir, ocultar } from './acoes'
import { avaliarAcesso } from '@/modules/plataforma/assinatura/direito'
import '@/design-system/tokens/tokens.css'
import { decorridoCurto, horaCurta } from '@/components/formato'
import { AtualizarAoVivo } from '@/components/AtualizarAoVivo'
import { CabecalhoTela, Chip, Moldura } from '@/components/navegacao'
import { dataDeReferencia } from '@/modules/dominio/rodada'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Fire Live · IA da NBA' }

/**
 * OS TRÊS ESTADOS COMO CHIPS — e como ORDEM da tela (spec 04, §4.2).
 *
 * O mesmo par vira filtro na URL e rótulo na tela. A ordem em que as seções
 * aparecem é a desta lista, e quem a aplica é `agruparFireLivePorJogo`; aqui
 * só se escreve o nome de cada estado.
 */
const CHIPS: { estado: EstadoDoJogoNoFireLive; valor: string; rotulo: string }[] = [
  { estado: 'EM_1Q', valor: 'agora', rotulo: 'No 1º Q agora' },
  { estado: 'AGUARDANDO', valor: 'aguardando', rotulo: 'Aguardando' },
  { estado: 'FIM_1Q', valor: 'encerrado', rotulo: '1º Q encerrado' },
]

/**
 * A tela vazia é a experiência dominante desta tela — o Fire Live só existe
 * durante o 1º quarto dos jogos. Cada motivo tem o próprio texto: parecer
 * defeito aqui faria o produto parecer quebrado a maior parte do tempo.
 */
function TextoVazio({
  estado,
  primeiroJogo,
  fuso,
}: {
  estado: EstadoVazio
  primeiroJogo: Date | null
  fuso: string
}) {
  const textos: Record<EstadoVazio, { titulo: string; corpo: string }> = {
    SEM_JOGO_HOJE: {
      titulo: 'Sem jogos hoje',
      corpo: 'A NBA não tem partidas hoje. O Fire Live volta na próxima rodada.',
    },
    AGUARDANDO_PRIMEIRO_JOGO: {
      titulo: 'Ainda não começou',
      corpo: primeiroJogo
        ? `O primeiro jogo de hoje começa às ${horaCurta(primeiroJogo, fuso)}. Os apitos aparecem aqui durante o 1º quarto.`
        : 'Os apitos aparecem aqui durante o 1º quarto de cada jogo.',
    },
    NENHUM_EM_1Q: {
      titulo: 'Nenhum jogo no 1º quarto agora',
      corpo:
        'O Fire Live observa somente o 1º quarto. Quando o próximo jogo começar, ele volta a olhar.',
    },
    SEM_APITO_AINDA: {
      titulo: 'Observando o 1º quarto',
      corpo:
        'Jogo em andamento e ninguém cruzou o alvo ainda. O apito aparece aqui — e chega por push — no instante em que a marca for atingida.',
    },
  }
  const t = textos[estado]
  return (
    <div
      style={{
        padding: '32px 16px',
        textAlign: 'center',
        border: `1px dashed ${semantico.divisor}`,
        borderRadius: 12,
      }}
    >
      <p style={{ margin: 0, fontWeight: 700 }}>{t.titulo}</p>
      <p style={{ margin: '8px 0 0', fontSize: 14, color: semantico.textoSecundario }}>{t.corpo}</p>
    </div>
  )
}

/** Caixa de recorte vazio — o mesmo desenho para os dois motivos. */
function Aviso({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: '32px 16px',
        textAlign: 'center',
        border: `1px dashed ${semantico.divisor}`,
        borderRadius: 12,
        marginBottom: 12,
      }}
    >
      <p style={{ margin: 0, fontWeight: 700 }}>{titulo}</p>
      <p style={{ margin: '8px 0 0', fontSize: 14, color: semantico.textoSecundario }}>
        {children}
      </p>
    </div>
  )
}

/** A linha de apoio sob um cabeçalho de jogo — a contagem, ou o silêncio. */
function LinhaDeApoio({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ margin: '0 0 4px', padding: '4px 2px 0', fontSize: 13, color: semantico.texto55 }}>
      {children}
    </p>
  )
}

/**
 * O card do Fire Live: o MESMO `CardEntrada` da Lista e dos Resultados, vestido
 * de quente e sabendo em que ponto da noite o jogo dele está.
 */
function CartaoAoVivo({
  item,
  grupo,
  quartoFireLive,
}: {
  item: ItemFireLiveNaTela
  grupo: GrupoFireLive
  quartoFireLive: number
}) {
  // O estado do card sai do JOGO, nunca do `encerrado` gravado no snapshot: o
  // quarto vira entre um ciclo e outro, e o badge tem que virar com ele. Sem
  // box score aqui — conferir resultado é dos Resultados (spec 04, §4.4).
  const ciclo = estadoDoCiclo(grupo, false, quartoFireLive)
  // O marco do modo fire só entra quando cai DENTRO da régua da barra, que é o
  // alvo do 1º quarto. Com o ruleset homologado ele fica sempre FORA — em
  // pontos o alvo é `média/4 × 1,5` e o modo fire acende em `média × 0,75`, o
  // dobro — e um traço encostado na ponta direita diria que a marca do modo
  // fire é o alvo. Ele aparece se o YAML mudar; hoje a barra fica com o marco
  // do alvo, que é a verdade que ela tem para contar.
  const marcoFire =
    item.alvoFire !== null && item.alvo1Q !== null && item.alvoFire.valor < item.alvo1Q
      ? item.alvoFire
      : null

  return (
    <CardEntrada
      nome={item.nome}
      jogadorHref={rotaDoJogador(item.jogadorId)}
      detalheHref={`/apito/${item.jogadorId}?atributo=${item.atributo}`}
      fotoUrl={item.fotoUrl ?? null}
      timeSigla={item.timeSigla}
      adversarioSigla={item.adversarioSigla}
      // "@ ADV" ou "vs ADV" — o lado sai do JOGO. Quando a curadoria do CJ põe
      // o jogador num time que não está em campo, o card simplesmente não diz
      // o mando (`null`), em vez de chutar um.
      emCasa={confrontoDoItem(item, grupo)?.emCasa ?? null}
      posicao={item.posicao}
      atributo={item.atributo}
      nivelJogador={item.nivelJogador}
      nivelApito={item.nivelApito}
      // Confiança é conceito PRÉ-LIVE (docs/02-motor-regras.md): o item
      // do Fire Live traz `confianca: null` e a pílula sai neutra, sem
      // brilho — não é dado faltando, é a regra do produto.
      confianca={item.confianca}
      grauConfianca={null}
      turbo={item.turbo}
      modoFire={item.modoFire}
      opdOrigemNivel={item.opdOrigemNivel}
      alvo1Q={item.alvo1Q}
      estado={ciclo}
      vivo={grupo.estado === 'EM_1Q'}
      // Alvo nulo NÃO vira {alvo: 0}: sem alvo, sem barra — nunca
      // "LINHA BATIDA · 0" para quem não tem marca (errata 25/08).
      progresso1Q={
        item.alvo1Q === null ? null : { observado: item.valorNoQuarto, alvo: item.alvo1Q }
      }
      alvoFire={marcoFire}
      // `apitouEm` fica AUSENTE de propósito: o apito grava o INSTANTE do push
      // (`apitos.gerado_em`), não o valor do jogador naquele instante, e não há
      // coluna para ele. Ausente ≠ `null`: a barra CALA, em vez de escrever
      // "ainda sem apito" embaixo de um card que já é um apito.
      //
      // O Fire Live INTEIRO é o universo quente — urgência é da tela ao vivo,
      // não só do modo fire.
      temperatura="quente"
    />
  )
}

function primeiroValor(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

export default async function PaginaFireLive({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const filtro: FiltroFireLive = {
    time: primeiroValor(params.time),
    jogo: primeiroValor(params.jogo),
  }
  const recorte = CHIPS.find((c) => c.valor === primeiroValor(params.estado)) ?? null

  /** A URL da tela com o recorte de estado trocado — os outros seguem intactos. */
  const rota = (estado: string | null): string => {
    const busca = new URLSearchParams()
    if (filtro.time) busca.set('time', filtro.time)
    if (filtro.jogo) busca.set('jogo', filtro.jogo)
    if (estado) busca.set('estado', estado)
    const consulta = busca.toString()
    return consulta ? `/fire-live?${consulta}` : '/fire-live'
  }

  if (!process.env.DATABASE_URL) {
    return (
      <Moldura aba="fire-live">
        <h1>Fire Live</h1>
        <p style={{ color: semantico.textoSecundario }}>
          Banco não configurado. Rode <code>vercel env pull</code> e <code>npm run db:migrate</code>
          .
        </p>
      </Moldura>
    )
  }

  const sessao = await sessaoAtual()
  if (!sessao) redirect('/entrar?destino=/fire-live')
  const acesso = await avaliarAcesso(getDb(), sessao.usuarioId)
  if (!acesso.permitido) redirect('/assinar')

  const ruleset = await rulesetAtivo()
  const { fuso } = ruleset.rodada
  const quartoFireLive = ruleset.fire_live.quarto
  const agora = new Date()
  const hoje = dataDeReferencia(agora, fuso)
  // A tela lê o snapshot MATERIALIZADO por jogo — nunca executa o motor. A
  // Lista de hoje entra como terceira leitura: é dela que sai a contagem de
  // alvos esperando o 1º quarto de cada jogo agendado.
  const [feed, listaDoDia, nomesOcultos] = await Promise.all([
    lerFeedFireLive(getDb(), hoje, quartoFireLive, filtro),
    lerFeed(getDb(), hoje),
    // Preferência por CONTA: recorte de LEITURA puro sobre o snapshot — o feed
    // é por evento e não sabe quem está olhando. Uma consulta só (id + nome).
    jogadoresOcultosComNome(getDb(), sessao.usuarioId),
  ])
  // Cabeçalhos e cards pertencem à mesma rodada, inclusive na madrugada.
  const jogosDoDia = feed.jogos

  const ocultos = new Set(nomesOcultos.map((j) => j.id))
  const itensVisiveis = filtrarOcultos(feed.itens, ocultos)
  const naTela = await comAlvoDoModoFire(getDb(), ruleset, itensVisiveis)

  // Os recortes da URL valem também para os jogos: com `?time=`, o cabeçalho
  // mudo de outro jogo contradiria o filtro que a tela acabou de anunciar.
  const jogosRecortados = jogosDoDia.filter(
    (j) =>
      (filtro.jogo === undefined || j.id === filtro.jogo) &&
      (filtro.time === undefined ||
        j.casaSigla === filtro.time ||
        j.visitanteSigla === filtro.time),
  )
  const grupos = agruparFireLivePorJogo(
    naTela,
    jogosRecortados,
    quartoFireLive,
    alvosAguardandoPorJogo(filtrarOcultos(listaDoDia?.conteudo.itens ?? [], ocultos)),
  )
  const visiveis = recorte === null ? grupos : grupos.filter((g) => g.estado === recorte.estado)

  // Dois vazios DIFERENTES (errata 25/08): o recorte da URL zerou a tela
  // (estadoVazio null vem da leitura exatamente para este caso) — ou o próprio
  // usuário ocultou todos os apitados, que precisa da própria explicação.
  const tudoOculto = feed.itens.length > 0 && itensVisiveis.length === 0
  const temRecorte = recorte !== null || filtro.time !== undefined || filtro.jogo !== undefined
  const recorteVazio = temRecorte && visiveis.length === 0 && !tudoOculto
  // A frase do push é UMA por tela: ela abre a primeira seção que espera o 1º
  // quarto e não se repete nas seguintes (artboard `FireLive.dc.html`).
  const primeiraEspera = visiveis.find((g) => g.estado === 'AGUARDANDO')?.jogoId ?? null

  return (
    <Moldura aba="fire-live">
      <CabecalhoTela
        sobrancelha="FIRE LIVE"
        titulo="ACONTECENDO"
        contexto="aoVivo"
        selo={<SeloContexto contexto="aoVivo" />}
      >
        <div style={{ display: 'grid', gap: 12, flex: 1 }}>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.45, color: semantico.texto55 }}>
            Alvos do 1º quarto.{' '}
            {feed.geradoEm !== null && (
              <span style={{ color: semantico.texto70 }}>
                {`Atualizado ${decorridoCurto(feed.geradoEm, agora)}.`}
              </span>
            )}{' '}
            O apito chega no push; a tela é o detalhe.
          </p>
          {/* Os três estados: recorte e sumário ao mesmo tempo. O chip ativo
              volta para a tela inteira — não há um "todos" a mais numa tela
              que existe para ser varrida. */}
          <nav
            aria-label="Estado do 1º quarto"
            style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
          >
            {CHIPS.map((chip) => (
              <Chip
                key={chip.valor}
                href={rota(recorte?.valor === chip.valor ? null : chip.valor)}
                ativo={recorte?.valor === chip.valor}
              >
                {chip.rotulo}
              </Chip>
            ))}
          </nav>
        </div>
      </CabecalhoTela>

      {/* Só com jogo no 1º quarto a tela se atualiza sozinha (identidade 04):
          o servidor decide, o cliente obedece — fora da janela dos jogos
          nenhum JavaScript de refresh é entregue. O recorte da URL não desliga
          o refresh: quem filtrou continua com a bola rolando. */}
      {jogosDoDia.some((j) => j.status === 'AO_VIVO' && j.quartoAtual === quartoFireLive) && (
        <AtualizarAoVivo />
      )}

      {feed.estadoVazio !== null && !temRecorte && visiveis.length === 0 && (
        <TextoVazio estado={feed.estadoVazio} primeiroJogo={feed.primeiroJogoUtc} fuso={fuso} />
      )}

      {recorteVazio && (
        <Aviso titulo="Nada com esse filtro">
          Nenhum jogo ou apito neste recorte.{' '}
          <Link href="/fire-live" style={{ color: semantico.textoPrimario }}>
            Ver todos
          </Link>
        </Aviso>
      )}

      {tudoOculto && (
        <Aviso titulo="Todos os apitados estão ocultos">
          Há apitos agora, mas você escolheu não acompanhar estes jogadores. Reative quem quiser na
          lista logo abaixo.
        </Aviso>
      )}

      {visiveis.map((grupo) => (
        <section key={grupo.jogoId}>
          {/* A ÚNICA fronteira de seção da tela. Quente, com o placar do 1º
              quarto entre as siglas; MUDO, com o horário, enquanto o jogo não
              começou (spec 04, §4.2). */}
          <CabecalhoJogo
            casaSigla={grupo.casaSigla}
            visitanteSigla={grupo.visitanteSigla}
            horarioUtc={grupo.dataHoraUtc}
            fuso={fuso}
            status={grupo.status}
            quartoAtual={grupo.quartoAtual}
            placarCasa={grupo.placarCasa}
            placarVisitante={grupo.placarVisitante}
            primeiroQuartoEncerrado={grupo.estado === 'FIM_1Q'}
            temperatura="quente"
          />

          {grupo.estado === 'AGUARDANDO' && (
            <LinhaDeApoio>
              {`${grupo.alvosAguardando} alvo${grupo.alvosAguardando === 1 ? '' : 's'} aguardando o 1º quarto.`}
              {grupo.jogoId === primeiraEspera ? ' O push avisa no instante do apito.' : ''}
            </LinhaDeApoio>
          )}
          {grupo.estado !== 'AGUARDANDO' && grupo.itens.length === 0 && (
            <LinhaDeApoio>
              {feed.itens.some((i) => i.jogoId === grupo.jogoId)
                ? 'Apitos deste jogo ocultos. Reative os jogadores abaixo para acompanhá-los.'
                : filtro.time !== undefined
                  ? 'Nenhum apito deste time no jogo até agora.'
                  : 'Ninguém cruzou o alvo neste jogo ainda.'}
            </LinhaDeApoio>
          )}

          <div style={{ display: 'grid', gap: 10 }}>
            {grupo.itens.map((item) => (
              <div key={item.chave}>
                <CartaoAoVivo item={item} grupo={grupo} quartoFireLive={quartoFireLive} />
                <form action={ocultar} style={{ margin: '4px 0 0', textAlign: 'right' }}>
                  <input type="hidden" name="jogadorId" value={item.jogadorId} />
                  <button
                    type="submit"
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      fontSize: 12,
                      fontFamily: 'inherit',
                      color: semantico.textoSecundario,
                    }}
                  >
                    não acompanhar este jogador
                  </button>
                </form>
              </div>
            ))}
          </div>
        </section>
      ))}

      {nomesOcultos.length > 0 && (
        <section style={{ marginTop: 20 }}>
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
            Jogadores ocultos
          </h2>
          <div style={{ display: 'grid', gap: 6 }}>
            {nomesOcultos.map((j) => (
              <form
                key={j.id}
                action={exibir}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '8px 12px',
                  borderRadius: 10,
                  border: `1px solid ${semantico.divisor}`,
                }}
              >
                <span style={{ fontSize: 14 }}>{j.nome}</span>
                <input type="hidden" name="jogadorId" value={j.id} />
                <button
                  type="submit"
                  style={{
                    background: 'none',
                    border: `1px solid ${semantico.divisor}`,
                    borderRadius: 8,
                    padding: '4px 10px',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontFamily: 'inherit',
                    color: semantico.textoPrimario,
                  }}
                >
                  mostrar de novo
                </button>
              </form>
            ))}
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 12, color: semantico.textoSecundario }}>
            Ocultar tira o jogador desta tela em todos os seus aparelhos. As notificações continuam
            — silenciá-las por jogador é decisão que ainda vai ao CJ.
          </p>
        </section>
      )}

      {/* Nunca esconder a defasagem: o carimbo do topo diz há quanto tempo, o
          rodapé diz de quando é o dado — um serve para decidir, o outro para
          conferir. */}
      <UltimaAtualizacao
        em={feed.geradoEm ?? new Date(0)}
        fonte="ao vivo"
        agora={agora}
        fuso={fuso}
      />
      <p style={{ margin: '8px 0 0', fontSize: 12 }}>
        <Link href="/como-funciona" style={{ color: semantico.textoSecundario }}>
          Como funciona →
        </Link>
      </p>
    </Moldura>
  )
}
