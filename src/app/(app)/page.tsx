import { getDb } from '@/modules/dominio/db/cliente'
import { lerFeed, ordenarPorConfianca, type ItemFeed } from '@/modules/entrega/lista-secreta'
import { rotaDoJogador, BASE_ESTATISTICAS } from '@/modules/entrega/estatisticas/rotas'
import { CardEntrada } from '@/design-system/componentes'
import { semantico } from '@/design-system/tokens/semantico'
import '@/design-system/tokens/tokens.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Lista Secreta · IA da NBA' }

/** Quantas vítimas o usuário quer ver. `0` = lista inteira. */
const QUANTIDADES = [1, 2, 5, 0] as const

function rotuloQuantidade(n: number): string {
  return n === 0 ? 'Lista inteira' : `${n} vítima${n === 1 ? '' : 's'}`
}

function horaLocal(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

function Filtros({ atual, base }: { atual: number; base: string }) {
  return (
    <nav
      aria-label="Quantidade de entradas"
      style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}
    >
      {QUANTIDADES.map((n) => {
        const ativo = n === atual
        return (
          <a
            key={n}
            href={`${base}?quantidade=${n}`}
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
            {rotuloQuantidade(n)}
          </a>
        )
      })}
    </nav>
  )
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

export default async function PaginaListaSecreta({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const bruto = Number(Array.isArray(params.quantidade) ? params.quantidade[0] : params.quantidade)
  const quantidade = QUANTIDADES.includes(bruto as (typeof QUANTIDADES)[number]) ? bruto : 0

  if (!process.env.DATABASE_URL) {
    return (
      <Moldura>
        <h1>Lista Secreta</h1>
        <p style={{ color: semantico.textoSecundario }}>
          Banco não configurado. Rode <code>vercel env pull</code> e{' '}
          <code>npm run db:migrate</code>.
        </p>
      </Moldura>
    )
  }

  const hoje = new Date().toISOString().slice(0, 10)
  // A tela lê o snapshot MATERIALIZADO. Nunca executa o motor: a avaliação
  // acontece uma vez por evento, não uma vez por usuário.
  const feed = await lerFeed(getDb(), hoje)

  if (feed === null) {
    return (
      <Moldura>
        <h1 style={{ marginBottom: 4 }}>Lista Secreta</h1>
        <p style={{ color: semantico.textoSecundario }}>
          A lista de hoje ainda não foi publicada. Ela sai 1 hora antes do primeiro jogo.
        </p>
      </Moldura>
    )
  }

  const ordenados = ordenarPorConfianca(feed.conteudo.itens)
  const visiveis: ItemFeed[] = quantidade === 0 ? ordenados : ordenados.slice(0, quantidade)

  return (
    <Moldura>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Lista Secreta</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: semantico.textoSecundario }}>
          {ordenados.length} entrada{ordenados.length === 1 ? '' : 's'} sugerida
          {ordenados.length === 1 ? '' : 's'} pela estratégia · ordenadas pela escala de
          confiança
        </p>
      </header>

      <Filtros atual={quantidade} base="/" />

      <p style={{ margin: '0 0 12px', fontSize: 13 }}>
        <a href={BASE_ESTATISTICAS} style={{ color: semantico.textoSecundario }}>
          Estatísticas · jogos do dia, jogadores e times →
        </a>
      </p>

      <div style={{ display: 'grid', gap: 10 }}>
        {visiveis.map((item) => (
          <CardEntrada
            key={item.chave}
            nome={item.nome}
            // Segundo caminho de entrada da aba de estatísticas: o nome do
            // jogador dentro de qualquer card leva à MESMA tela que a busca
            // do menu — a URL sai da mesma função nos dois lugares.
            jogadorHref={rotaDoJogador(item.jogadorId)}
            timeSigla={item.timeSigla}
            timeNome={item.timeNome}
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
        ))}
      </div>

      {visiveis.length === 0 && (
        <p style={{ color: semantico.textoSecundario }}>Nenhuma entrada para hoje.</p>
      )}

      {/* Toda tela informa o quão recente é o número que está sendo visto. */}
      <footer
        style={{
          marginTop: 24,
          paddingTop: 12,
          borderTop: `1px solid ${semantico.divisor}`,
          fontSize: 12,
          color: semantico.textoSecundario,
        }}
      >
        Última atualização: {horaLocal(feed.geradoEm)} · ruleset{' '}
        {feed.conteudo.rulesetVersao}
      </footer>
    </Moldura>
  )
}
