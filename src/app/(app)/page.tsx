import { getDb } from '@/modules/dominio/db/cliente'
import Link from 'next/link'
import { agruparPorJogador, filtrarItens, lerFeed } from '@/modules/entrega/lista-secreta'
import {
  agruparPorJogo,
  cartoesPorJogador,
  chaveDaHierarquia,
  confrontoDoItem,
  estadoDoCiclo,
  hierarquiaDosApitados,
  jogosDoDiaResumo,
  ordenarPorSinal,
  type CartaoDeJogador,
  type EstadoDoCiclo,
  type GrupoDeJogo,
  type JogoResumo,
  type PosicaoNaHierarquia,
} from '@/modules/entrega/lista-por-jogo'
import { rotaDoJogador } from '@/modules/entrega/estatisticas/rotas'
import {
  abaDoJogador,
  ATRIBUTOS,
  comAba,
  comFiltro,
  comLente,
  comOrdem,
  comQuantidade,
  lerEstadoDaLista,
  METODOS,
  NIVEIS,
  POSICOES,
  QUANTIDADES,
  rotaDaLista,
  type EstadoDaLista,
} from '@/modules/entrega/lista-secreta-rotas'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import { dataDeReferencia } from '@/modules/dominio/rodada'
import { dataHora, diaDaRodada, horaEmTexto } from '@/components/formato'
import {
  CabecalhoTela,
  Chip,
  FolhaDeFiltros,
  GRADE_DE_CARDS,
  Moldura,
  type RecorteAtivo,
} from '@/components/navegacao'
import { CabecalhoJogo, CardEntrada, SeloContexto } from '@/design-system/componentes'
import { semantico } from '@/design-system/tokens/semantico'
import { AtivarAlertas, PainelPwa } from '@/components/pwa'
import { ConviteDoPlano } from '@/components/planos/ConviteDoPlano'
import { JogosDoDia } from '@/components/planos/JogosDoDia'
import { lateralPadrao } from '@/app/(app)/lateral/montar'
import { atende } from '@/modules/plataforma/assinatura/nivel-do-plano'
import { exigirNivel } from '@/modules/plataforma/assinatura/guarda'
import { politicaHomologacaoDoAmbiente } from '@/modules/entrega/push/fanout'
import { lerConfiguracaoPush } from '@/modules/entrega/push/configuracao'
import { LENTES, preferenciasDoUsuario, type Lente } from '@/modules/plataforma/preferencias'
import { definirLente, definirOrdem } from './preferencias/acoes'
import { estadoExperienciaDoUsuario } from '@/modules/plataforma/experiencia/servico'
import { BotaoAcompanharJogador } from '@/components/preferencias/BotaoAcompanharJogador'
import '@/design-system/tokens/tokens.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Lista Secreta' }

const ROTULO_METODO: Record<(typeof METODOS)[number], string> = {
  OSCILACAO: 'Oscilação',
  OPD: 'OPD',
  TURBO: 'Turbo',
}
const ROTULO_NIVEL: Record<(typeof NIVEIS)[number], string> = {
  MVP: 'MVP',
  ALL_STAR: 'All Star',
  SUPORTE: 'Suporte',
  RANDOLA: 'Randola',
}
const ROTULO_ATRIBUTO: Record<(typeof ATRIBUTOS)[number], string> = {
  PONTOS: 'Pontos',
  REBOTES: 'Rebotes',
  ASSISTENCIAS: 'Assistências',
}
const ROTULO_LENTE: Record<Lente, string> = {
  ULT5: 'ÚLT. 5',
  MEDIA_LINHA: 'MÉDIA × LINHA',
  ODDS: 'ODDS',
  HIERARQUIA: 'HIERARQUIA',
}

/** Quantos jogadores o usuário quer ver. `0` = lista inteira. */
function rotuloQuantidade(n: number): string {
  return n === 0 ? 'Lista inteira' : `${n} jogador${n === 1 ? '' : 'es'}`
}

/** O que "Ver todas" e o × do chip apagam: os seis recortes, nada mais. */
const SEM_RECORTE = {
  quantidade: 0,
  metodo: undefined,
  nivel: undefined,
  time: undefined,
  posicao: undefined,
  atributo: undefined,
} as const

/**
 * O recorte ativo ao lado do botão FILTRAR: UM chip, sempre (spec 04, §4.1).
 * Com dois ou mais recortes o chip vira a contagem — seis pílulas na mesma
 * linha do botão seriam a parede de volta, só que no cabeçalho.
 */
function recortesAtivos(estado: EstadoDaLista): RecorteAtivo[] {
  const ativos = [
    estado.quantidade !== 0 ? rotuloQuantidade(estado.quantidade) : null,
    estado.atributo ? ROTULO_ATRIBUTO[estado.atributo] : null,
    estado.metodo ? ROTULO_METODO[estado.metodo] : null,
    estado.nivel ? ROTULO_NIVEL[estado.nivel] : null,
    estado.time,
    estado.posicao,
  ].filter((r): r is string => Boolean(r))

  if (ativos.length === 0) return []
  return [
    {
      rotulo: ativos.length === 1 ? ativos[0]! : `${ativos.length} filtros`,
      limparHref: rotaDaLista({ ...estado, ...SEM_RECORTE }),
    },
  ]
}

/**
 * O card da varredura. O card INTEIRO leva à análise do apito; o nome, às
 * estatísticas do jogador; as abas trocam o atributo daquele card só.
 */
function CartaoDaLista({
  cartao,
  estado,
  lente,
  jogo,
  ciclo,
  hierarquia,
  acompanhado,
}: {
  cartao: CartaoDeJogador
  estado: EstadoDaLista
  lente: Lente
  jogo: JogoResumo | null
  /** Ponto da noite do card, quando ele já saiu do pré-live (spec 04, §5.1). */
  ciclo: EstadoDoCiclo | null
  hierarquia: PosicaoNaHierarquia | null
  acompanhado: boolean
}) {
  const item = cartao.visivel
  const confronto = confrontoDoItem(item, jogo)

  // Abas quando há mesmo o que alternar. TODOS os atributos entram, inclusive
  // o que ainda não tem linha: filtrá-lo apagava o apito da tela inteira, já
  // que o card por jogador é o único lugar onde ele apareceria. A aba sem
  // linha escreve só "REB" — o card não inventa "REB 0+". A ORDEM vem da
  // entrega (PTS · REB · AST, igual em todo card).
  const abas =
    cartao.atributos.length > 1
      ? cartao.atributos.map((i) => ({
          atributo: i.atributo,
          linha: i.linha,
          ativo: i.atributo === item.atributo,
          href: comAba(estado, i.jogadorId, i.atributo),
        }))
      : undefined

  return (
    <CardEntrada
      nome={item.nome}
      // Segundo caminho de entrada da aba de estatísticas: o nome do jogador
      // dentro de qualquer card leva à MESMA tela que a busca do menu — a URL
      // sai da mesma função nos dois lugares.
      jogadorHref={rotaDoJogador(item.jogadorId)}
      detalheHref={`/apito/${item.jogadorId}?atributo=${item.atributo}`}
      fotoUrl={item.fotoUrl ?? null}
      timeSigla={item.timeSigla}
      adversarioSigla={confronto?.adversarioSigla ?? null}
      emCasa={confronto?.emCasa ?? null}
      posicao={item.posicao}
      atributo={item.atributo}
      nivelJogador={item.nivelJogador}
      nivelApito={item.nivelApito}
      linha={item.linha}
      // O grau já veio calculado na materialização (uma vez por evento). A
      // tela lê; não recalcula nem chama o motor.
      turbo={item.turbo}
      modoFire={item.modoFire}
      opdOrigemNivel={item.opdOrigemNivel}
      alvo1Q={item.alvo1Q}
      // Contexto materializado da identidade 03 — o card mostra barrinhas,
      // média e odd sem nenhuma consulta da tela.
      ultimos5={item.ultimos5 ?? []}
      mediaTemporada={item.mediaTemporada ?? null}
      oddFaixa={item.oddFaixa ?? null}
      narrativa={item.narrativa ?? null}
      atributos={abas}
      lente={lente}
      hierarquia={hierarquia}
      // Sem ciclo, o card não desenha badge — que é o que se quer no pré-live,
      // onde o "PRÉ" seria idêntico em todos os cards e o selo do cabeçalho já
      // disse isso. Quando o jogo começa, o card conta onde está.
      estado={ciclo ?? undefined}
      // A estrela vai para o CANTO do card (identidade 05). Solta embaixo
      // dele, ela deixava cada card terminando numa altura diferente e
      // quebrava o ritmo da grade de duas colunas.
      acaoCanto={
        <BotaoAcompanharJogador
          jogadorId={item.jogadorId}
          inicial={acompanhado}
          variante="estrela"
        />
      }
    />
  )
}

export default async function PaginaListaSecreta({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const estado = lerEstadoDaLista(await searchParams)

  if (!process.env.DATABASE_URL) {
    return (
      // Sem `conta`: este aviso roda antes do login, e não há sessão a mostrar.
      <Moldura aba="lista" largura="dados">
        <h1>Lista Secreta</h1>
        <p style={{ color: semantico.textoSecundario }}>
          Banco não configurado. Rode <code>vercel env pull</code> e <code>npm run db:migrate</code>
          .
        </p>
      </Moldura>
    )
  }

  const { sessao, acesso } = await exigirNivel('GRATIS', '/')

  const configuracaoPush = lerConfiguracaoPush()
  const pushDisponivel = Boolean(
    configuracaoPush.habilitado &&
    politicaHomologacaoDoAmbiente().permitido({
      id: sessao.usuarioId,
      email: sessao.email,
      direitoAtivo: true,
    }),
  )

  const ruleset = await rulesetAtivo()
  const { fuso } = ruleset.rodada
  const hoje = dataDeReferencia(new Date(), fuso)

  // Duas leituras que não dependem uma da outra: a preferência da conta e os
  // jogos do dia (siglas, horário e status dos cabeçalhos de seção).
  const [preferencias, jogosDoDia, experiencia] = await Promise.all([
    preferenciasDoUsuario(getDb(), sessao.usuarioId),
    jogosDoDiaResumo(getDb(), hoje, fuso),
    estadoExperienciaDoUsuario(getDb(), sessao.usuarioId),
  ])
  const acompanhados = new Set(experiencia.jogadoresAcompanhados)
  // A URL manda quando diz alguma coisa; calada, quem manda é a CONTA — e é a
  // preferência que sincroniza a escolha entre os aparelhos.
  const ordem = estado.ordem ?? preferencias.ordemLista
  const lente = estado.lente ?? preferencias.lente

  // O GRÁTIS PARA AQUI — antes de qualquer leitura do snapshot pago. Vê a
  // rodada (siglas, horário, status) e o convite; o sinal é 100% MVP (spec,
  // decisão 5). Nada do feed entra nesta renderização.
  if (!atende(acesso.nivel, 'MVP')) {
    return (
      <Moldura
        aba="lista"
        conta={{ email: sessao.email }}
        lateral={await lateralPadrao({
          assistente: atende(acesso.nivel, 'MVP'),
          gratis: !atende(acesso.nivel, 'MVP'),
        })}
        assistente={atende(acesso.nivel, 'MVP')}
      >
        {/* A MOLDURA é a do assinante: mesma sobrancelha, mesmo H1, mesmo
            selo. O que falta é o conteúdo, e é isso que o convite precisa
            mostrar — uma tela diferente não diria o que ele está perdendo. Sem
            contador e sem controles: não há o que contar nem o que filtrar. */}
        <CabecalhoTela
          sobrancelha="LISTA SECRETA"
          titulo="LISTA DO DIA"
          selo={<SeloContexto contexto="preLive" />}
        >
          <p style={{ margin: 0, fontSize: 14, color: semantico.textoSecundario }}>
            Rodada de {diaDaRodada(hoje)}
          </p>
        </CabecalhoTela>
        {/* A faixa some a partir de 1280: ali ela mora no topo da LATERAL, e
            duas vezes na mesma tela é uma a mais. */}
        <div className="so-ate-lateral">
          <ConviteDoPlano variante="faixa" minimo="MVP" recurso="A Lista Secreta" voltar="/" />
        </div>
        <JogosDoDia
          jogos={jogosDoDia}
          fuso={fuso}
          // A repetição do meio da página: a faixa do topo e a da lateral saem
          // da tela depois de alguns blocos de silhueta, e o visitante de
          // desktop rolava o resto sem nenhuma chamada à vista.
          convite={
            <ConviteDoPlano variante="faixa" minimo="MVP" recurso="A Lista Secreta" voltar="/" />
          }
        />
      </Moldura>
    )
  }

  // A tela lê o snapshot MATERIALIZADO. Nunca executa o motor: a avaliação
  // acontece uma vez por evento, não uma vez por usuário. E lê DEPOIS do
  // paywall, sempre — `paywall.test.ts` vigia esta ordem no próprio fonte.
  const feed = await lerFeed(getDb(), hoje)

  if (feed === null) {
    // NUNCA tela em branco: antes da publicação a tela diz a HORA em que a
    // lista sai (primeiro jogo menos a antecedência do ruleset) e abre o
    // caminho para a noite passada.
    const primeiro = jogosDoDia[0]
    const saida =
      primeiro === undefined
        ? null
        : new Date(
            primeiro.dataHoraUtc.getTime() -
              ruleset.publicacao.lista_secreta.antecedencia_minutos * 60_000,
          )
    return (
      <Moldura
        aba="lista"
        conta={{ email: sessao.email }}
        lateral={await lateralPadrao({
          assistente: atende(acesso.nivel, 'MVP'),
          gratis: !atende(acesso.nivel, 'MVP'),
        })}
        largura="dados"
        assistente={atende(acesso.nivel, 'MVP')}
      >
        <CabecalhoTela
          sobrancelha="LISTA SECRETA"
          titulo="LISTA DO DIA"
          selo={<SeloContexto contexto="preLive" />}
        />
        <section
          style={{
            padding: '28px 16px',
            textAlign: 'center',
            border: `1px dashed ${semantico.divisor}`,
            borderRadius: 12,
          }}
        >
          <p
            style={{
              margin: 0,
              fontFamily: semantico.fonteTitulo,
              fontSize: 22,
              letterSpacing: 0.5,
              textTransform: 'uppercase',
            }}
          >
            {saida ? `Próxima lista às ${horaEmTexto(saida, fuso)}` : 'Sem jogos hoje'}
          </p>
          <p style={{ margin: '8px 0 0', fontSize: 13, color: semantico.texto55 }}>
            {saida
              ? 'A lista sai antes do primeiro jogo da rodada. Enquanto isso, a noite passada:'
              : 'Sem rodada hoje. Enquanto isso, a noite passada:'}
          </p>
          <p style={{ margin: '12px 0 0', fontSize: 13 }}>
            <Link
              href="/resultados"
              style={{
                color: semantico.textoPrimario,
                textDecoration: 'underline',
                textUnderlineOffset: 3,
              }}
            >
              Resultados de ontem →
            </Link>
          </p>
        </section>
      </Moldura>
    )
  }

  const doDia = feed.conteudo.itens
  // Um apito por (jogador, atributo) — a melhor linha de cada — e daí um CARD
  // por jogador, com os demais atributos virando abas no rodapé.
  const recortados = ordenarPorSinal(agruparPorJogador(filtrarItens(doDia, estado)))
  // A regra "um card por jogador" é da ENTREGA (o Fire Live precisa da mesma):
  // a tela só diz qual aba a URL abriu.
  const todos = cartoesPorJogador(
    recortados,
    (jogadorId) => estado.atributo ?? abaDoJogador(estado, jogadorId),
  )
  const cartoes = estado.quantidade === 0 ? todos : todos.slice(0, estado.quantidade)
  const porJogadorId = new Map(cartoes.map((c) => [c.principal.jogadorId, c] as const))

  // O agrupamento também é pelo MELHOR atributo de cada jogador, pelo mesmo
  // motivo da ordenação: a posição do card não muda com a aba aberta.
  const grupos: GrupoDeJogo[] = agruparPorJogo(
    cartoes.map((c) => c.principal),
    jogosDoDia,
  )
  const jogoPorId = new Map(jogosDoDia.map((j) => [j.id, j] as const))

  // A hierarquia do CJ só é lida quando a lente pede — uma consulta na versão
  // ativa de `niveis`, nunca uma por card.
  const hierarquias =
    lente === 'HIERARQUIA'
      ? await hierarquiaDosApitados(
          getDb(),
          cartoes.map((c) => ({ jogadorId: c.visivel.jogadorId, atributo: c.visivel.atributo })),
        )
      : new Map<string, PosicaoNaHierarquia>()

  /**
   * O ponto da noite de um card (spec 04, §5.1). `PRE` não vira badge: a Lista
   * INTEIRA é pré-live (o SeloContexto do cabeçalho já diz) e um "PRÉ" em cada
   * card seria o mesmo sinal repetido 22 vezes — o artboard não desenha badge
   * nenhum aqui. Quando o jogo começa, o card passa a contar onde está.
   *
   * A Lista não confere resultado (isso é dos Resultados, §4.4), então lê o
   * ciclo sem box score: jogo encerrado aparece como FT, nunca com veredito.
   */
  const cicloDoCard = (jogo: JogoResumo | null): EstadoDoCiclo | null => {
    if (jogo === null) return null
    const estadoDoJogo = estadoDoCiclo(jogo, false, ruleset.fire_live.quarto)
    return estadoDoJogo === 'PRE' ? null : estadoDoJogo
  }

  const entradasPublicadas = agruparPorJogador(doDia)
  // O que sobrou na tela, na MESMA unidade do publicado: cada card guarda as
  // entradas do jogador nas abas de atributo, então somá-las é contar entradas
  // visíveis — contar cards diria "31 entradas" onde há 37 (correções de
  // lógica 19/09, §4.1).
  const entradasVisiveis = cartoes.reduce((n, cartao) => n + cartao.atributos.length, 0)
  const jogosComApito = new Set(doDia.map((i) => i.jogoId)).size
  const recorteVazio = cartoes.length === 0 && entradasPublicadas.length > 0

  // Chips construídos do que EXISTE hoje — nunca oferecem recorte vazio.
  const timesDoDia = [...new Set(doDia.map((i) => i.timeSigla))].sort()
  const posicoesDoDia = POSICOES.filter((p) => doDia.some((i) => i.posicao === p))
  const atributosDoDia = ATRIBUTOS.filter((a) => doDia.some((i) => i.atributo === a))

  return (
    <Moldura
      aba="lista"
      conta={{ email: sessao.email }}
      lateral={await lateralPadrao({
        assistente: atende(acesso.nivel, 'MVP'),
        gratis: !atende(acesso.nivel, 'MVP'),
      })}
      largura="dados"
      assistente={atende(acesso.nivel, 'MVP')}
    >
      <CabecalhoTela
        sobrancelha="LISTA SECRETA"
        titulo="LISTA DO DIA"
        // Quem está olhando "SUPORTE · N2 · ODD MÉDIA 1,58" precisa ter de onde
        // perguntar o que isso quer dizer. A metodologia inteira já existe e só
        // o Perfil alcançava.
        aoLadoDoTitulo={
          <Link
            href="/como-funciona"
            className="link-texto"
            style={{
              // Pílula CONTORNADA, não o azul do manual: o primário chapado
              // competiria com o H1 e com as ações reais da tela. Era texto
              // cinza sem moldura — lia como legenda desativada, e o caminho
              // para a metodologia inteira morria aí.
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '7px 14px',
              borderRadius: 999,
              border: `1px solid ${semantico.contornoControle}`,
              fontFamily: semantico.fonteRotulo,
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              // Tinta cheia (18,47 sobre o fundo). O cinza de antes dava 8,01 e
              // passava em AA — o problema nunca foi legibilidade, foi não
              // parecer clicável.
              color: semantico.textoPrimario,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            <span aria-hidden>?</span>
            Como funciona
          </Link>
        }
        selo={<SeloContexto contexto="preLive" />}
        seletor={{
          rotulo: 'Ordem da lista',
          ativa: ordem,
          acao: definirOrdem,
          opcoes: [
            { valor: 'POR_JOGO', rotulo: 'Por jogo', href: comOrdem(estado, 'POR_JOGO') },
            { valor: 'POR_NIVEL', rotulo: 'Por nível', href: comOrdem(estado, 'POR_NIVEL') },
          ],
        }}
        acoes={
          <FolhaDeFiltros
            ativos={recortesAtivos(estado)}
            grupos={[
              {
                titulo: 'Quantidade',
                ativo: estado.quantidade !== 0 ? rotuloQuantidade(estado.quantidade) : undefined,
                chips: QUANTIDADES.map((n) => (
                  // Pelo MESMO montador dos demais chips: quantidade é um
                  // recorte como os outros e não pode varrer o que já foi
                  // escolhido.
                  <Chip key={n} href={comQuantidade(estado, n)} ativo={n === estado.quantidade}>
                    {rotuloQuantidade(n)}
                  </Chip>
                )),
              },
              ...(atributosDoDia.length > 1
                ? [
                    {
                      titulo: 'Atributo',
                      ativo: estado.atributo ? ROTULO_ATRIBUTO[estado.atributo] : undefined,
                      chips: (
                        <>
                          <Chip
                            href={comFiltro(estado, 'atributo', undefined)}
                            ativo={estado.atributo === undefined}
                          >
                            Todos
                          </Chip>
                          {atributosDoDia.map((a) => (
                            <Chip
                              key={a}
                              href={comFiltro(estado, 'atributo', a)}
                              ativo={estado.atributo === a}
                            >
                              {ROTULO_ATRIBUTO[a]}
                            </Chip>
                          ))}
                        </>
                      ),
                    },
                  ]
                : []),
              {
                titulo: 'Método',
                ativo: estado.metodo ? ROTULO_METODO[estado.metodo] : undefined,
                chips: (
                  <>
                    <Chip
                      href={comFiltro(estado, 'metodo', undefined)}
                      ativo={estado.metodo === undefined}
                    >
                      Todos
                    </Chip>
                    {METODOS.map((m) => (
                      <Chip
                        key={m}
                        href={comFiltro(estado, 'metodo', m)}
                        ativo={estado.metodo === m}
                      >
                        {ROTULO_METODO[m]}
                      </Chip>
                    ))}
                  </>
                ),
              },
              {
                titulo: 'Nível do jogador',
                ativo: estado.nivel ? ROTULO_NIVEL[estado.nivel] : undefined,
                chips: (
                  <>
                    <Chip
                      href={comFiltro(estado, 'nivel', undefined)}
                      ativo={estado.nivel === undefined}
                    >
                      Todos
                    </Chip>
                    {NIVEIS.map((n) => (
                      <Chip key={n} href={comFiltro(estado, 'nivel', n)} ativo={estado.nivel === n}>
                        {ROTULO_NIVEL[n]}
                      </Chip>
                    ))}
                  </>
                ),
              },
              ...(timesDoDia.length > 1
                ? [
                    {
                      titulo: 'Time',
                      ativo: estado.time,
                      chips: (
                        <>
                          <Chip
                            href={comFiltro(estado, 'time', undefined)}
                            ativo={estado.time === undefined}
                          >
                            Todos
                          </Chip>
                          {timesDoDia.map((sigla) => (
                            <Chip
                              key={sigla}
                              href={comFiltro(estado, 'time', sigla)}
                              ativo={estado.time === sigla}
                            >
                              {sigla}
                            </Chip>
                          ))}
                        </>
                      ),
                    },
                  ]
                : []),
              ...(posicoesDoDia.length > 1
                ? [
                    {
                      titulo: 'Posição',
                      ativo: estado.posicao,
                      chips: (
                        <>
                          <Chip
                            href={comFiltro(estado, 'posicao', undefined)}
                            ativo={estado.posicao === undefined}
                          >
                            Todas
                          </Chip>
                          {posicoesDoDia.map((pos) => (
                            <Chip
                              key={pos}
                              href={comFiltro(estado, 'posicao', pos)}
                              ativo={estado.posicao === pos}
                            >
                              {pos}
                            </Chip>
                          ))}
                        </>
                      ),
                    },
                  ]
                : []),
            ]}
          />
        }
        lentes={{
          rotulo: 'Lente do card',
          ativa: lente,
          acao: definirLente,
          opcoes: LENTES.map((l) => ({
            valor: l,
            rotulo: ROTULO_LENTE[l],
            href: comLente(estado, l),
          })),
        }}
        contador={{
          // O número grande é o que a tela MOSTRA (depois dos filtros e do
          // corte de quantidade); o total é o que foi publicado. Iguais sem
          // filtro; "3 de 37" com.
          //
          // Conta ENTRADAS, não cards, porque é o que o rótulo diz: um card
          // é um JOGADOR e pode carregar até três entradas nas abas de
          // atributo. Sem filtro os dois lados batem com o publicado.
          numero: entradasVisiveis,
          total: entradasPublicadas.length,
          rotulo: `entrada${entradasPublicadas.length === 1 ? '' : 's'} em ${jogosComApito} jogo${jogosComApito === 1 ? '' : 's'}`,
        }}
      >
        <div style={{ display: 'grid', gap: 8, flex: 1 }}>
          {/* A contagem saiu daqui e virou o CONTADOR do cabeçalho (o número
              da tela, à moda do StatsHub) — repeti-la seria o mesmo dado duas
              vezes na mesma dobra. */}
          <p
            style={{ margin: 0, fontSize: 14, lineHeight: 1.45, color: semantico.textoSecundario }}
          >
            Rodada de {diaDaRodada(feed.conteudo.dataReferencia)} · publicada às{' '}
            {horaEmTexto(feed.geradoEm, fuso)}
          </p>
          {/* Resumo editorial da rodada, gerado na materialização junto com as
              narrativas dos cards. Ausente é caso NORMAL (sem chave de LLM,
              provedor fora, texto reprovado pelo validador) — e ausência não
              abre espaço nenhum, mesma regra da narrativa dentro do card. */}
          {feed.conteudo.resumoDoDia ? (
            <p
              style={{
                margin: 0,
                paddingLeft: 10,
                borderLeft: `2px solid ${semantico.divisor}`,
                fontSize: 13,
                lineHeight: 1.55,
                fontStyle: 'italic',
                color: semantico.textoSecundario,
              }}
            >
              {feed.conteudo.resumoDoDia}
            </p>
          ) : null}
        </div>
      </CabecalhoTela>

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
            <Link
              href={rotaDaLista({ ...estado, ...SEM_RECORTE })}
              style={{ color: semantico.textoPrimario }}
            >
              Ver todas
            </Link>
          </p>
        </div>
      )}

      {ordem === 'POR_JOGO' ? (
        grupos.map((grupo) => (
          <details key={grupo.jogoId} open>
            {/* A ÚNICA fronteira de seção da tela: sem divisória entre cards,
                sem título intermediário (spec 04, §4.1). Desde a identidade 05
                ela também FECHA a seção — `<details>` nativo, aberto por
                padrão e sem persistir: fechar um jogo é gesto da sessão, não
                preferência da conta como a ordem e a lente. */}
            <CabecalhoJogo
              raiz="summary"
              casaSigla={grupo.casaSigla}
              visitanteSigla={grupo.visitanteSigla}
              horarioUtc={grupo.dataHoraUtc}
              fuso={fuso}
              status={grupo.status}
              quartoAtual={grupo.quartoAtual}
            />
            <div style={{ display: 'grid', gridTemplateColumns: GRADE_DE_CARDS, gap: 12 }}>
              {grupo.itens.map((melhor) => {
                const cartao = porJogadorId.get(melhor.jogadorId)!
                return (
                  <CartaoDaLista
                    key={melhor.jogadorId}
                    cartao={cartao}
                    estado={estado}
                    lente={lente}
                    jogo={jogoPorId.get(melhor.jogoId) ?? null}
                    ciclo={cicloDoCard(jogoPorId.get(melhor.jogoId) ?? null)}
                    hierarquia={
                      hierarquias.get(
                        chaveDaHierarquia(cartao.visivel.jogadorId, cartao.visivel.atributo),
                      ) ?? null
                    }
                    acompanhado={acompanhados.has(cartao.visivel.jogadorId)}
                  />
                )
              })}
            </div>
          </details>
        ))
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: GRADE_DE_CARDS, gap: 12 }}>
          {cartoes.map((cartao) => (
            <CartaoDaLista
              key={cartao.principal.jogadorId}
              cartao={cartao}
              estado={estado}
              lente={lente}
              jogo={jogoPorId.get(cartao.principal.jogoId) ?? null}
              ciclo={cicloDoCard(jogoPorId.get(cartao.principal.jogoId) ?? null)}
              hierarquia={
                hierarquias.get(
                  chaveDaHierarquia(cartao.visivel.jogadorId, cartao.visivel.atributo),
                ) ?? null
              }
              acompanhado={acompanhados.has(cartao.visivel.jogadorId)}
            />
          ))}
        </div>
      )}

      {cartoes.length === 0 && !recorteVazio && (
        <p style={{ color: semantico.textoSecundario }}>Nenhuma entrada para hoje.</p>
      )}

      {/* Depois dos cards, nunca antes: nada fica entre o assinante e o apito
          (spec 04, §3.7). */}
      {pushDisponivel && (
        <div style={{ marginTop: 20 }}>
          <AtivarAlertas />
        </div>
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
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <span>
          Última atualização: {dataHora(feed.geradoEm, fuso)} · ruleset{' '}
          {feed.conteudo.rulesetVersao}
        </span>
        <Link href="/resultados" style={{ color: semantico.textoSecundario }}>
          Resultados de ontem →
        </Link>
      </footer>
    </Moldura>
  )
}
