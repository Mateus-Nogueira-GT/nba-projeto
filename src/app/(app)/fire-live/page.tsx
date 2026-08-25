import Link from 'next/link'
import { redirect } from 'next/navigation'

import { getDb } from '@/modules/dominio/db/cliente'
import { lerFeedFireLive, placaresAoVivo } from '@/modules/entrega/fire-live/leitura'
import type { FiltroFireLive } from '@/modules/entrega/fire-live/leitura'
import type { EstadoVazio } from '@/modules/entrega/fire-live/leitura'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import { rotaDoJogador } from '@/modules/entrega/estatisticas/rotas'
import { CardEntrada, PlacarMini } from '@/design-system/componentes'
import { semantico } from '@/design-system/tokens/semantico'
import { sessaoAtual } from '@/modules/plataforma/auth/cookies'
import { filtrarOcultos, jogadoresOcultosDe } from '@/modules/plataforma/jogadores-ocultos'
import { jogadores } from '@/modules/dominio/db/schema'
import { inArray } from 'drizzle-orm'
import { exibir, ocultar } from './acoes'
import { avaliarAcesso } from '@/modules/plataforma/assinatura/direito'
import '@/design-system/tokens/tokens.css'
import { dataHora, horaCurta } from '@/components/formato'
import { CabecalhoTela, Chip, Moldura } from '@/components/navegacao'
import { dataDeReferencia } from '@/modules/dominio/rodada'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Fire Live · IA da NBA' }


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
      corpo: 'O Fire Live observa somente o 1º quarto. Quando o próximo jogo começar, ele volta a olhar.',
    },
    SEM_APITO_AINDA: {
      titulo: 'Observando o 1º quarto',
      corpo: 'Jogo em andamento e ninguém cruzou o alvo ainda. O apito aparece aqui — e chega por push — no instante em que a marca for atingida.',
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
  if (!process.env.DATABASE_URL) {
    return (
      <Moldura aba="fire-live">
        <h1>Fire Live</h1>
        <p style={{ color: semantico.textoSecundario }}>
          Banco não configurado. Rode <code>vercel env pull</code> e <code>npm run db:migrate</code>.
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
  const hoje = dataDeReferencia(new Date(), fuso)
  // A tela lê o snapshot MATERIALIZADO por jogo — nunca executa o motor.
  const [feed, placares] = await Promise.all([
    lerFeedFireLive(getDb(), hoje, ruleset.fire_live.quarto, filtro),
    placaresAoVivo(getDb(), hoje, ruleset.fire_live.quarto),
  ])

  // Chips construídos do que está NA TELA: times e jogos com apito hoje.
  const semFiltro =
    filtro.time !== undefined || filtro.jogo !== undefined
      ? await lerFeedFireLive(getDb(), hoje, ruleset.fire_live.quarto)
      : feed
  const timesComApito = [...new Set(semFiltro.itens.map((i) => i.timeSigla))].sort()

  // Preferência por CONTA: recorte de LEITURA puro sobre o snapshot — o feed
  // é por evento e não sabe quem está olhando.
  const ocultos = await jogadoresOcultosDe(getDb(), sessao.usuarioId)
  const itensVisiveis = filtrarOcultos(feed.itens, ocultos)
  const nomesOcultos =
    ocultos.size > 0
      ? await getDb()
          .select({ id: jogadores.id, nome: jogadores.nomeCompleto })
          .from(jogadores)
          .where(inArray(jogadores.id, [...ocultos]))
      : []
  const recorteVazio =
    itensVisiveis.length === 0 && feed.estadoVazio === null && feed.itens.length > 0

  return (
    <Moldura aba="fire-live">
      <CabecalhoTela sobrancelha="FIRE LIVE · AO VIVO" titulo="ACONTECENDO" contexto="aoVivo" />

      <p style={{ margin: '0 0 4px', fontSize: 13, color: semantico.textoSecundario }}>
        Alvos do 1º quarto, ao vivo · o push chega no instante do apito
      </p>
      <p style={{ margin: '0 0 16px', fontSize: 12, display: 'flex', gap: 12 }}>
        <Link href="/" style={{ color: semantico.textoSecundario }}>
          ← Lista Secreta
        </Link>
        <Link href="/como-funciona" style={{ color: semantico.textoSecundario }}>
          Como funciona →
        </Link>
      </p>

      {placares.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: 8,
            marginBottom: 16,
          }}
        >
          {placares.map((p) => (
            <PlacarMini key={p.jogoId} placar={p} />
          ))}
        </div>
      )}

      {timesComApito.length > 1 && (
        <nav
          aria-label="Filtrar por time"
          style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}
        >
          <Chip href="/fire-live" ativo={filtro.time === undefined && filtro.jogo === undefined}>
            Todos
          </Chip>
          {timesComApito.map((sigla) => (
            <Chip key={sigla} href={`/fire-live?time=${sigla}`} ativo={filtro.time === sigla}>
              {sigla}
            </Chip>
          ))}
        </nav>
      )}

      {feed.estadoVazio !== null && (
        <TextoVazio estado={feed.estadoVazio} primeiroJogo={feed.primeiroJogoUtc} fuso={fuso} />
      )}

      {recorteVazio && (
        <div
          style={{
            padding: '32px 16px',
            textAlign: 'center',
            border: `1px dashed ${semantico.divisor}`,
            borderRadius: 12,
          }}
        >
          <p style={{ margin: 0, fontWeight: 700 }}>Nada com esse filtro</p>
          <p style={{ margin: '8px 0 0', fontSize: 14, color: semantico.textoSecundario }}>
            Há apitos hoje, mas nenhum bate com o recorte escolhido.{' '}
            <Link href="/fire-live" style={{ color: semantico.textoPrimario }}>
              Ver todos
            </Link>
          </p>
        </div>
      )}

      <div style={{ display: 'grid', gap: 10 }}>
        {itensVisiveis.map((item) => (
          <div key={item.chave} style={{ opacity: item.encerrado ? 0.75 : 1 }}>
            {/* PROPOSTA aguardando CJ — spec 05, pergunta 2: o item fica até o
                fim do jogo, marcado como encerrado. */}
            {item.encerrado && (
              <p style={{ margin: '0 0 4px', fontSize: 11, color: semantico.textoSecundario }}>
                1º quarto encerrado
              </p>
            )}
            <CardEntrada
              nome={item.nome}
              jogadorHref={rotaDoJogador(item.jogadorId)}
              fotoUrl={item.fotoUrl ?? null}
              timeSigla={item.timeSigla}
              adversarioSigla={item.adversarioSigla}
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
              vivo={!item.encerrado}
              progresso1Q={{ observado: item.valorNoQuarto, alvo: item.alvo1Q ?? 0 }}
              // O Fire Live INTEIRO é o universo quente — urgência é da tela
              // ao vivo, não só do modo fire.
              temperatura="quente"
            />
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

      <footer
        style={{
          marginTop: 24,
          paddingTop: 12,
          borderTop: `1px solid ${semantico.divisor}`,
          fontSize: 12,
          color: semantico.textoSecundario,
        }}
      >
        {feed.geradoEm
          ? `Última atualização: ${dataHora(feed.geradoEm, fuso)}`
          : 'Sem dado ao vivo no momento.'}
      </footer>
    </Moldura>
  )
}
