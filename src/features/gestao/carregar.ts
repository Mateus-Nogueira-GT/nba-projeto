import { getDb } from '@/modules/dominio/db/cliente'
import { dataDeReferencia, somarDias } from '@/modules/dominio/rodada'
import { BANCA_PADRAO, planoDoDia, type EntradaDoPlano, type PlanoDoDia } from '@/modules/entrega/gestao'
import { entradasRealizadasDoDia, type EntradaRealizada } from '@/modules/entrega/gestao-realizadas'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import { exigirNivel } from '@/modules/plataforma/assinatura/guarda'
import { atende } from '@/modules/plataforma/assinatura/nivel-do-plano'
import { lerFeedCacheado } from '@/app/_cache/feed'
import { chaveDoRealizado, realizadoDaJanelaCacheado } from '@/app/_cache/placar'

export type Visao = 'sugeridas' | 'realizadas'

/**
 * Dicionário de `?erro=`: a ação redireciona com um CÓDIGO, nunca com a frase —
 * `/gestao?erro=<texto de terceiro>` não pode virar alerta nesta tela. Código
 * fora daqui some.
 */
const TEXTO_DO_ERRO: Record<string, string> = {
  'entrada-invalida': 'Confira unidades e odd.',
}

/**
 * RETROSPECTIVA DO MÊS — o "Sofascore Season" da banca: as entradas que a
 * pessoa registrou nos últimos 30 dias cruzadas com a conferência de cada
 * noite. Green/red vem da MESMA conferência dos Resultados (a linha
 * registrada contra o que o jogador fez); nada é inventado aqui.
 */
export type Retrospectiva = {
  dias: number
  entradas: number
  greens: number
  reds: number
  pendentes: number
  unidades: number
  /** Saldo em unidades: green soma unidades × (odd − 1); red tira as unidades. Sem odd, o green não entra no saldo. */
  saldo: number
}

const DIAS_DA_RETROSPECTIVA = 30

export type DadosDaGestao = {
  retrospectiva: Retrospectiva
  hoje: string
  fuso: string
  banca: number
  visao: Visao
  /** Registrar entrada é MVP. O grátis entra e vê o histórico e o convite. */
  registra: boolean
  erro: string | null
  /** O apito cujo registro foi recusado — o erro é escrito junto dele. */
  erroEm: string | null
  /** Chaves `jogadorId|atributo` já registradas hoje — a linha abre mostrando. */
  registradas: Set<string>
  plano: PlanoDoDia
  unidadePercentual: number | null
  gruposPorTime: [string, EntradaDoPlano[]][]
  realizadas: (EntradaRealizada & { nomeExibido: string })[]
}

const primeiro = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

function bancaDe(bruto: string | undefined): number {
  const n = Number(bruto)
  // Banca negativa ou zero quebraria a proporcionalidade; texto inválido vira
  // o padrão em vez de NaN atravessando a tela.
  return Number.isFinite(n) && n > 0 ? Math.round(n) : BANCA_PADRAO
}

/**
 * As sugeridas AGRUPADAS POR TIME, na ordem em que o primeiro jogador de cada
 * time aparece no plano (maior aporte primeiro dentro do grupo).
 */
function agruparPorTime(entradas: EntradaDoPlano[]): [string, EntradaDoPlano[]][] {
  const grupos = new Map<string, EntradaDoPlano[]>()
  for (const entrada of entradas) {
    const sigla = entrada.item.timeSigla
    const atual = grupos.get(sigla)
    if (atual) atual.push(entrada)
    else grupos.set(sigla, [entrada])
  }
  return [...grupos]
}

/**
 * O "plano" do grátis: nenhuma entrada, nenhum valor. A tela dele não lê o
 * plano (mostra o convite), e o formato é o mesmo para a tela não ramificar
 * por tipo.
 */
function semPlano(ruleset: Awaited<ReturnType<typeof rulesetAtivo>>, banca: number): PlanoDoDia {
  const modelo = ruleset.gestao_banca
  return {
    temModelo: modelo !== undefined,
    origem: modelo?.origem ?? null,
    banca,
    unidade: null,
    limites: null,
    entradas: [],
    totalExposto: 0,
  }
}

export async function carregarGestao(
  params: Record<string, string | string[] | undefined>,
): Promise<DadosDaGestao> {
  const { sessao, acesso } = await exigirNivel('GRATIS', '/gestao')
  const registra = atende(acesso.nivel, 'MVP')

  const banca = bancaDe(primeiro(params.banca))
  // Por URL, não por estado de cliente: dá para linkar "o que eu registrei
  // hoje" e continua funcionando sem JavaScript.
  const visao: Visao = primeiro(params.ver) === 'realizadas' ? 'realizadas' : 'sugeridas'
  const codigo = primeiro(params.erro)
  const erro = codigo ? (TEXTO_DO_ERRO[codigo] ?? null) : null
  const jogadorDoErro = primeiro(params.jogador)
  const atributoDoErro = primeiro(params.atributo)
  const erroEm =
    erro && jogadorDoErro && /^[0-9a-f-]{36}$/i.test(jogadorDoErro) && atributoDoErro
      ? `${jogadorDoErro}|${atributoDoErro}`
      : null

  const ruleset = await rulesetAtivo()
  const { fuso } = ruleset.rodada
  const hoje = dataDeReferencia(new Date(), fuso)
  // O plano lê o FEED do dia — sinal pago. Só quem registra (MVP+) o recebe:
  // o grátis vê a silhueta e o convite, e o dado nem sai do banco para ele
  // (antes o plano inteiro era montado e só o JSX o escondia).
  // O feed vem do cache, como na Lista: o plano não relê o snapshot por visita.
  const plano = registra
    ? await planoDoDia(getDb(), ruleset, hoje, banca, await lerFeedCacheado(hoje))
    : semPlano(ruleset, banca)

  // Lidas SEMPRE: além do histórico, elas dizem quais sugestões já foram
  // registradas hoje — é isso que deixa o formulário da linha aberto.
  const lidas = await entradasRealizadasDoDia(getDb(), sessao.usuarioId, hoje)
  // O nome vem de `jogadores` na própria leitura (nosso back): não depende do
  // plano, que o grátis nem recebe.
  const realizadas = lidas.map((e) => ({ ...e, nomeExibido: e.nome }))

  // Retrospectiva: registros dos últimos 30 dias + a conferência deles.
  const datas = Array.from({ length: DIAS_DA_RETROSPECTIVA }, (_, i) => somarDias(hoje, -i))
  // A conferência da janela é a mesma para todo usuário na rodada: vem do
  // cache (tag da lateral). O grátis também a lê — ele mantém o histórico
  // (decisão 8) e o v2 mostra o "Seu mês" a quem tem registro, em qualquer plano.
  const [porDia, feito] = await Promise.all([
    Promise.all(datas.map((dia) => entradasRealizadasDoDia(getDb(), sessao.usuarioId, dia))),
    realizadoDaJanelaCacheado(somarDias(hoje, 1), DIAS_DA_RETROSPECTIVA),
  ])
  const retrospectiva: Retrospectiva = { dias: DIAS_DA_RETROSPECTIVA, entradas: 0, greens: 0, reds: 0, pendentes: 0, unidades: 0, saldo: 0 }
  for (const e of porDia.flat()) {
    retrospectiva.entradas++
    retrospectiva.unidades += e.unidades
    const fez = feito[chaveDoRealizado(e.dataReferencia, e.jogadorId, e.atributo)]
    if (fez === undefined || fez === null) {
      retrospectiva.pendentes++
    } else if (fez >= e.linha) {
      retrospectiva.greens++
      if (e.odd !== null) retrospectiva.saldo += e.unidades * (e.odd - 1)
    } else {
      retrospectiva.reds++
      retrospectiva.saldo -= e.unidades
    }
  }

  return {
    retrospectiva,
    hoje,
    fuso,
    banca,
    visao,
    registra,
    erro,
    erroEm,
    registradas: new Set(lidas.map((e) => `${e.jogadorId}|${e.atributo}`)),
    plano,
    unidadePercentual: ruleset.gestao_banca?.unidade_percentual_banca ?? null,
    gruposPorTime: agruparPorTime(plano.entradas),
    realizadas,
  }
}
