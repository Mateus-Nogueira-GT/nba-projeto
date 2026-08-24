import { getDb } from '@/modules/dominio/db/cliente'
import Link from 'next/link'
import {
  agruparPorJogador,
  filtrarItens,
  lerFeed,
  ordenarPorConfianca,
  type FiltroLista,
  type ItemFeed,
} from '@/modules/entrega/lista-secreta'
import { rotaDoJogador, BASE_ESTATISTICAS } from '@/modules/entrega/estatisticas/rotas'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import { dataDeReferencia } from '@/modules/dominio/rodada'
import { dataHora } from '@/components/formato'
import { Moldura } from '@/components/navegacao'
import { CardEntrada } from '@/design-system/componentes'
import { semantico } from '@/design-system/tokens/semantico'
import { AtivarAlertas, PainelPwa } from '@/components/pwa'
import { sessaoAtual } from '@/modules/plataforma/auth/cookies'
import { avaliarAcesso } from '@/modules/plataforma/assinatura/direito'
import { politicaHomologacaoDoAmbiente } from '@/modules/entrega/push/fanout'
import { lerConfiguracaoPush } from '@/modules/entrega/push/configuracao'
import { redirect } from 'next/navigation'
import '@/design-system/tokens/tokens.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Lista Secreta · IA da NBA' }

/** Quantas vítimas o usuário quer ver. `0` = lista inteira. */
const QUANTIDADES = [1, 2, 5, 0] as const

function rotuloQuantidade(n: number): string {
  return n === 0 ? 'Lista inteira' : `${n} vítima${n === 1 ? '' : 's'}`
}

type Recorte = FiltroLista & { quantidade: number }

const METODOS = [
  { valor: 'OSCILACAO', rotulo: 'Oscilação' },
  { valor: 'OPD', rotulo: 'OPD' },
  { valor: 'TURBO', rotulo: 'Turbo' },
] as const

const NIVEIS = [
  { valor: 'MVP', rotulo: 'MVP' },
  { valor: 'ALL_STAR', rotulo: 'All Star' },
  { valor: 'SUPORTE', rotulo: 'Suporte' },
  { valor: 'RANDOLA', rotulo: 'Randola' },
] as const

const POSICOES = ['G', 'F', 'C'] as const

const ATRIBUTOS = [
  { valor: 'PONTOS', rotulo: 'Pontos' },
  { valor: 'REBOTES', rotulo: 'Rebotes' },
  { valor: 'ASSISTENCIAS', rotulo: 'Assistências' },
] as const

function primeiroValor(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v
  return s === undefined || s === '' ? undefined : s
}

/** Monta a URL preservando os demais recortes — os filtros combinam entre si. */
function comFiltro(recorte: Recorte, campo: string, valor: string | undefined): string {
  const p = new URLSearchParams()
  if (recorte.quantidade !== 0) p.set('quantidade', String(recorte.quantidade))
  if (recorte.metodo) p.set('metodo', recorte.metodo)
  if (recorte.nivel) p.set('nivel', recorte.nivel)
  if (recorte.time) p.set('time', recorte.time)
  if (recorte.posicao) p.set('posicao', recorte.posicao)
  if (recorte.atributo) p.set('atributo', recorte.atributo)
  if (valor === undefined) p.delete(campo)
  else p.set(campo, valor)
  const q = p.toString()
  return q === '' ? '/' : `/?${q}`
}

function Chip({ href, ativo, children }: { href: string; ativo: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={ativo ? 'page' : undefined}
      style={{
        padding: '5px 12px',
        borderRadius: 999,
        fontSize: 12,
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

function GrupoFiltro({
  titulo,
  children,
}: {
  titulo: string
  children: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <p style={{ margin: '0 0 4px', fontSize: 11, color: semantico.textoSecundario }}>{titulo}</p>
      <nav aria-label={titulo} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {children}
      </nav>
    </div>
  )
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
          <Link
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
          </Link>
        )
      })}
    </nav>
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
  const metodoBruto = primeiroValor(params.metodo)
  const nivelBruto = primeiroValor(params.nivel)
  const atributoBruto = primeiroValor(params.atributo)
  const recorte: Recorte = {
    quantidade,
    metodo: METODOS.some((m) => m.valor === metodoBruto)
      ? (metodoBruto as FiltroLista['metodo'])
      : undefined,
    nivel: NIVEIS.some((n) => n.valor === nivelBruto)
      ? (nivelBruto as FiltroLista['nivel'])
      : undefined,
    time: primeiroValor(params.time),
    posicao: primeiroValor(params.posicao),
    atributo: ATRIBUTOS.some((a) => a.valor === atributoBruto)
      ? (atributoBruto as FiltroLista['atributo'])
      : undefined,
  }

  if (!process.env.DATABASE_URL) {
    return (
      <Moldura aba="lista">
        <h1>Lista Secreta</h1>
        <p style={{ color: semantico.textoSecundario }}>
          Banco não configurado. Rode <code>vercel env pull</code> e <code>npm run db:migrate</code>
          .
        </p>
      </Moldura>
    )
  }

  const sessao = await sessaoAtual()
  if (!sessao) redirect('/entrar?destino=/')
  const acesso = await avaliarAcesso(getDb(), sessao.usuarioId)
  if (!acesso.permitido) redirect('/assinar')

  const configuracaoPush = lerConfiguracaoPush()
  const pushDisponivel = Boolean(
    configuracaoPush.habilitado &&
    politicaHomologacaoDoAmbiente().permitido({
      id: sessao.usuarioId,
      email: sessao.email,
      direitoAtivo: true,
    }),
  )

  const { fuso } = (await rulesetAtivo()).rodada
  const hoje = dataDeReferencia(new Date(), fuso)
  // A tela lê o snapshot MATERIALIZADO. Nunca executa o motor: a avaliação
  // acontece uma vez por evento, não uma vez por usuário.
  const feed = await lerFeed(getDb(), hoje)

  if (feed === null) {
    return (
      <Moldura aba="lista">
        <h1 style={{ marginBottom: 4 }}>Lista Secreta</h1>
        <p style={{ color: semantico.textoSecundario }}>
          A lista de hoje ainda não foi publicada. Ela sai 1 hora antes do primeiro jogo.
        </p>
      </Moldura>
    )
  }

  // Um card por JOGADOR (o doc do CJ desenha uma barra por jogador, com as
  // linhas dentro dela). O recorte é de LEITURA: a tela nunca chama o motor.
  const doDia = feed.conteudo.itens
  const recortados = filtrarItens(doDia, recorte)
  const ordenados = ordenarPorConfianca(agruparPorJogador(recortados))
  const visiveis: ItemFeed[] = quantidade === 0 ? ordenados : ordenados.slice(0, quantidade)

  // Chips construídos do que EXISTE hoje — nunca oferecem recorte vazio.
  const timesDoDia = [...new Set(doDia.map((i) => i.timeSigla))].sort()
  const posicoesDoDia = POSICOES.filter((p) => doDia.some((i) => i.posicao === p))
  const atributosDoDia = ATRIBUTOS.filter((a) => doDia.some((i) => i.atributo === a.valor))
  const recorteVazio = visiveis.length === 0 && agruparPorJogador(doDia).length > 0

  return (
    <Moldura aba="lista">
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Lista Secreta</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: semantico.textoSecundario }}>
          {ordenados.length} entrada{ordenados.length === 1 ? '' : 's'} sugerida
          {ordenados.length === 1 ? '' : 's'} pela estratégia · ordenadas pela escala de confiança
        </p>
        <p style={{ margin: '8px 0 0', fontSize: 12, display: 'flex', gap: 12 }}>
          <Link href="/como-funciona" style={{ color: semantico.textoSecundario }}>
            Como funciona →
          </Link>
          <Link href="/fire-live" style={{ color: semantico.textoSecundario }}>
            Fire Live →
          </Link>
          <Link href="/conta" style={{ color: semantico.textoSecundario }}>
            Minha conta
          </Link>
        </p>
      </header>

      {pushDisponivel && (
        <div style={{ marginBottom: 16 }}>
          <AtivarAlertas />
        </div>
      )}

      <Filtros atual={quantidade} base="/" />

      <section style={{ marginBottom: 14 }}>
        {atributosDoDia.length > 1 && (
          <GrupoFiltro titulo="Atributo">
            <Chip
              href={comFiltro(recorte, 'atributo', undefined)}
              ativo={recorte.atributo === undefined}
            >
              Todos
            </Chip>
            {atributosDoDia.map((a) => (
              <Chip
                key={a.valor}
                href={comFiltro(recorte, 'atributo', a.valor)}
                ativo={recorte.atributo === a.valor}
              >
                {a.rotulo}
              </Chip>
            ))}
          </GrupoFiltro>
        )}

        <GrupoFiltro titulo="Método">
          <Chip href={comFiltro(recorte, 'metodo', undefined)} ativo={recorte.metodo === undefined}>
            Todos
          </Chip>
          {METODOS.map((m) => (
            <Chip
              key={m.valor}
              href={comFiltro(recorte, 'metodo', m.valor)}
              ativo={recorte.metodo === m.valor}
            >
              {m.rotulo}
            </Chip>
          ))}
        </GrupoFiltro>

        <GrupoFiltro titulo="Nível do jogador">
          <Chip href={comFiltro(recorte, 'nivel', undefined)} ativo={recorte.nivel === undefined}>
            Todos
          </Chip>
          {NIVEIS.map((n) => (
            <Chip
              key={n.valor}
              href={comFiltro(recorte, 'nivel', n.valor)}
              ativo={recorte.nivel === n.valor}
            >
              {n.rotulo}
            </Chip>
          ))}
        </GrupoFiltro>

        {timesDoDia.length > 1 && (
          <GrupoFiltro titulo="Time">
            <Chip href={comFiltro(recorte, 'time', undefined)} ativo={recorte.time === undefined}>
              Todos
            </Chip>
            {timesDoDia.map((sigla) => (
              <Chip
                key={sigla}
                href={comFiltro(recorte, 'time', sigla)}
                ativo={recorte.time === sigla}
              >
                {sigla}
              </Chip>
            ))}
          </GrupoFiltro>
        )}

        {posicoesDoDia.length > 1 && (
          <GrupoFiltro titulo="Posição">
            <Chip
              href={comFiltro(recorte, 'posicao', undefined)}
              ativo={recorte.posicao === undefined}
            >
              Todas
            </Chip>
            {posicoesDoDia.map((pos) => (
              <Chip
                key={pos}
                href={comFiltro(recorte, 'posicao', pos)}
                ativo={recorte.posicao === pos}
              >
                {pos}
              </Chip>
            ))}
          </GrupoFiltro>
        )}
      </section>

      {recorteVazio && (
        <div
          style={{
            padding: '28px 16px',
            textAlign: 'center',
            border: `1px dashed ${semantico.divisor}`,
            borderRadius: 12,
            marginBottom: 12,
          }}
        >
          <p style={{ margin: 0, fontWeight: 700 }}>Nada com esse filtro</p>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: semantico.textoSecundario }}>
            A lista de hoje tem entradas, mas nenhuma bate com o recorte escolhido.{' '}
            <Link href="/" style={{ color: semantico.textoPrimario }}>
              Ver todas
            </Link>
          </p>
        </div>
      )}

      <p style={{ margin: '0 0 12px', fontSize: 13 }}>
        <Link href={BASE_ESTATISTICAS} style={{ color: semantico.textoSecundario }}>
          Estatísticas · jogos do dia, jogadores e times →
        </Link>
      </p>

      <div style={{ display: 'grid', gap: 10 }}>
        {visiveis.map((item) => (
          <div key={item.chave}>
            <CardEntrada
            nome={item.nome}
            // Segundo caminho de entrada da aba de estatísticas: o nome do
            // jogador dentro de qualquer card leva à MESMA tela que a busca
            // do menu — a URL sai da mesma função nos dois lugares.
            jogadorHref={rotaDoJogador(item.jogadorId)}
            timeSigla={item.timeSigla}
            timeNome={item.timeNome}
            posicao={item.posicao}
            atributo={item.atributo}
            nivelJogador={item.nivelJogador}
            nivelApito={item.nivelApito}
            confianca={item.confianca}
            turbo={item.turbo}
            modoFire={item.modoFire}
            opdOrigemNivel={item.opdOrigemNivel}
            alvo1Q={item.alvo1Q}
          />
            <p style={{ margin: '4px 0 0', fontSize: 12 }}>
              <Link
                href={`/apito/${item.jogadorId}?atributo=${item.atributo}`}
                style={{ color: semantico.textoSecundario }}
              >
                linhas e confiança →
              </Link>
            </p>
          </div>
        ))}
      </div>

      {visiveis.length === 0 && (
        <p style={{ color: semantico.textoSecundario }}>Nenhuma entrada para hoje.</p>
      )}

      <div style={{ marginTop: 16 }}>
        <PainelPwa />
      </div>

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
        Última atualização: {dataHora(feed.geradoEm, fuso)} · ruleset {feed.conteudo.rulesetVersao}
      </footer>
    </Moldura>
  )
}
