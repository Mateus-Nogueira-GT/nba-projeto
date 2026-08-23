import Link from 'next/link'
import { redirect } from 'next/navigation'

import { getDb } from '@/modules/dominio/db/cliente'
import { lerFeedFireLive } from '@/modules/entrega/fire-live/leitura'
import type { FiltroFireLive } from '@/modules/entrega/fire-live/leitura'
import type { EstadoVazio } from '@/modules/entrega/fire-live/leitura'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import { rotaDoJogador } from '@/modules/entrega/estatisticas/rotas'
import { CardEntrada } from '@/design-system/componentes'
import { semantico } from '@/design-system/tokens/semantico'
import { sessaoAtual } from '@/modules/plataforma/auth/cookies'
import { avaliarAcesso } from '@/modules/plataforma/assinatura/direito'
import '@/design-system/tokens/tokens.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Fire Live · IA da NBA' }

function horaLocal(d: Date): string {
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

function horaCurta(d: Date): string {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <main
      style={{
        background: semantico.fundo,
        color: semantico.textoPrimario,
        minHeight: '100vh',
        padding: '24px 16px 64px',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div style={{ maxWidth: 640, margin: '0 auto' }}>{children}</div>
    </main>
  )
}

/**
 * A tela vazia é a experiência dominante desta tela — o Fire Live só existe
 * durante o 1º quarto dos jogos. Cada motivo tem o próprio texto: parecer
 * defeito aqui faria o produto parecer quebrado a maior parte do tempo.
 */
function TextoVazio({ estado, primeiroJogo }: { estado: EstadoVazio; primeiroJogo: Date | null }) {
  const textos: Record<EstadoVazio, { titulo: string; corpo: string }> = {
    SEM_JOGO_HOJE: {
      titulo: 'Sem jogos hoje',
      corpo: 'A NBA não tem partidas hoje. O Fire Live volta na próxima rodada.',
    },
    AGUARDANDO_PRIMEIRO_JOGO: {
      titulo: 'Ainda não começou',
      corpo: primeiroJogo
        ? `O primeiro jogo de hoje começa às ${horaCurta(primeiroJogo)}. Os apitos aparecem aqui durante o 1º quarto.`
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

function Chip({ href, ativo, children }: { href: string; ativo: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={ativo ? 'page' : undefined}
      style={{
        padding: '6px 14px',
        borderRadius: 999,
        fontSize: 13,
        fontWeight: ativo ? 700 : 500,
        textDecoration: 'none',
        color: ativo ? semantico.textoSobreCor : semantico.textoPrimario,
        background: ativo ? semantico.textoPrimario : semantico.superficie,
        border: `1px solid ${semantico.divisor}`,
      }}
    >
      {children}
    </Link>
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
      <Moldura>
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
  const hoje = new Date().toISOString().slice(0, 10)
  // A tela lê o snapshot MATERIALIZADO por jogo — nunca executa o motor.
  const feed = await lerFeedFireLive(getDb(), hoje, ruleset.fire_live.quarto, filtro)

  // Chips construídos do que está NA TELA: times e jogos com apito hoje.
  const semFiltro =
    filtro.time !== undefined || filtro.jogo !== undefined
      ? await lerFeedFireLive(getDb(), hoje, ruleset.fire_live.quarto)
      : feed
  const timesComApito = [...new Set(semFiltro.itens.map((i) => i.timeSigla))].sort()
  const recorteVazio = feed.itens.length === 0 && feed.estadoVazio === null

  return (
    <Moldura>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Fire Live</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: semantico.textoSecundario }}>
          Alvos do 1º quarto, ao vivo · o push chega no instante do apito
        </p>
        <p style={{ margin: '8px 0 0', fontSize: 12 }}>
          <Link href="/" style={{ color: semantico.textoSecundario }}>
            ← Lista Secreta
          </Link>
        </p>
      </header>

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
        <TextoVazio estado={feed.estadoVazio} primeiroJogo={feed.primeiroJogoUtc} />
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
        {feed.itens.map((item) => (
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
              timeSigla={item.timeSigla}
              timeNome={`${item.timeNome} · vs ${item.adversarioSigla}`}
              posicao={null}
              atributo={item.atributo}
              nivelJogador={item.nivelJogador}
              nivelApito={item.nivelApito}
              confianca={item.confianca}
              turbo={item.turbo}
              modoFire={item.modoFire}
              opdOrigemNivel={item.opdOrigemNivel}
              alvo1Q={item.alvo1Q}
            />
            <p style={{ margin: '4px 0 0', fontSize: 12, color: semantico.textoSecundario }}>
              {item.valorNoQuarto} no 1º quarto · alvo {item.alvo1Q}
            </p>
          </div>
        ))}
      </div>

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
          ? `Última atualização: ${horaLocal(feed.geradoEm)}`
          : 'Sem dado ao vivo no momento.'}
      </footer>
    </Moldura>
  )
}
