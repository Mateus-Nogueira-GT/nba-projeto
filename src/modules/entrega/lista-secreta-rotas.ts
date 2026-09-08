import { LENTES, ORDENS_LISTA, type Lente, type OrdemLista } from '../plataforma/preferencias'
import type { FiltroLista } from './lista-secreta'

/**
 * ROTAS DA LISTA SECRETA — fonte única.
 *
 * A tela tem SEIS recortes que combinam entre si (quantidade, atributo,
 * método, nível do jogador, time e posição). O requisito é que mexer em um
 * NUNCA apague os outros: quem filtrou "OPD · MVP · LAL" e depois pediu
 * "2 vítimas" quer duas vítimas DAQUELE recorte, não a lista inteira.
 *
 * Antes desta função, os chips de quantidade montavam a URL à mão
 * (`/?quantidade=N`) enquanto os demais preservavam o recorte — e a
 * divergência só aparecia clicando. Com uma função só, "os filtros combinam"
 * deixa de ser combinado e vira propriedade testável.
 *
 * Identidade 04: além dos recortes, a URL carrega o ESTADO DE LEITURA —
 * ordem (por jogo / por nível), lente da zona 2 e a aba de atributo aberta em
 * um card. Entram pelo mesmo montador, pelo mesmo motivo: trocar a lente não
 * pode varrer o filtro que o usuário acabou de escolher.
 */

export type Recorte = FiltroLista & { quantidade: number }

/**
 * O que a URL diz. Ordem e lente são OPCIONAIS de propósito: ausentes, quem
 * manda é a preferência da conta (`preferenciasDoUsuario`) — e a URL limpa
 * continua sendo `/`, sem nenhum padrão escrito nela.
 */
export type EstadoDaLista = Recorte & {
  ordem?: OrdemLista
  lente?: Lente
  /**
   * A aba de atributo aberta em UM card: `"<jogadorId>:<ATRIBUTO>"`.
   *
   * Um parâmetro só, não um por card: a aba é um olhar momentâneo ("e os
   * rebotes dele?"), não um recorte. Abrir a aba de outro card fecha a
   * anterior — em troca a URL não cresce com a rolagem e o botão voltar
   * continua legível.
   */
  aba?: string
}

export type CampoDaLista = 'quantidade' | keyof FiltroLista | 'ordem' | 'lente' | 'aba'

/** Quantas vítimas o usuário quer ver. `0` = lista inteira. */
export const QUANTIDADES = [1, 2, 5, 0] as const
export const METODOS = ['OSCILACAO', 'OPD', 'TURBO'] as const
export const NIVEIS = ['MVP', 'ALL_STAR', 'SUPORTE', 'RANDOLA'] as const
export const ATRIBUTOS = ['PONTOS', 'REBOTES', 'ASSISTENCIAS'] as const
export const POSICOES = ['G', 'F', 'C'] as const

type AtributoDaRota = (typeof ATRIBUTOS)[number]

function montar(estado: EstadoDaLista): URLSearchParams {
  const p = new URLSearchParams()
  // Ordem fixa, recortes primeiro: a URL de um mesmo estado é sempre a mesma
  // string — é o que permite comparar `href` em teste.
  if (estado.quantidade !== 0) p.set('quantidade', String(estado.quantidade))
  if (estado.metodo) p.set('metodo', estado.metodo)
  if (estado.nivel) p.set('nivel', estado.nivel)
  if (estado.time) p.set('time', estado.time)
  if (estado.posicao) p.set('posicao', estado.posicao)
  if (estado.atributo) p.set('atributo', estado.atributo)
  if (estado.ordem) p.set('ordem', estado.ordem)
  if (estado.lente) p.set('lente', estado.lente)
  if (estado.aba) p.set('aba', estado.aba)
  return p
}

const comoRota = (p: URLSearchParams): string => {
  const q = p.toString()
  return q === '' ? '/' : `/?${q}`
}

/** A URL do estado como ele está — sem trocar nada. */
export function rotaDaLista(estado: EstadoDaLista): string {
  return comoRota(montar(estado))
}

/**
 * `valor === undefined` REMOVE o campo (é o chip "Todos"). `quantidade` 0
 * significa lista inteira e por isso não viaja na URL — o padrão não precisa
 * ser escrito.
 */
export function comFiltro(
  estado: EstadoDaLista,
  campo: CampoDaLista,
  valor: string | undefined,
): string {
  const p = montar(estado)
  if (valor === undefined) p.delete(campo)
  else p.set(campo, valor)
  return comoRota(p)
}

/** O chip de quantidade é o MESMO caminho dos demais — 0 apaga o parâmetro. */
export function comQuantidade(estado: EstadoDaLista, quantidade: number): string {
  return comFiltro(estado, 'quantidade', quantidade === 0 ? undefined : String(quantidade))
}

/**
 * O seletor POR JOGO · POR NÍVEL. Escreve o valor SEMPRE — inclusive o da
 * opção já ativa: é por esse destino que a server action descobre o que
 * gravar na conta, e clicar na opção ativa tem que gravar também.
 */
export function comOrdem(estado: EstadoDaLista, ordem: OrdemLista): string {
  return comFiltro(estado, 'ordem', ordem)
}

/** O chip de lente. Mesma regra do seletor: escreve sempre. */
export function comLente(estado: EstadoDaLista, lente: Lente): string {
  return comFiltro(estado, 'lente', lente)
}

/** A aba de atributo de UM card. */
export function comAba(estado: EstadoDaLista, jogadorId: string, atributo: string): string {
  return comFiltro(estado, 'aba', `${jogadorId}:${atributo}`)
}

/**
 * O atributo que a URL abriu — só se o card aberto for o deste jogador.
 *
 * Lê pelo PRIMEIRO ':' porque é assim que `lerEstadoDaLista` valida
 * (`[^:]{1,64}:[A-Z_]{1,16}`): o id não pode conter ':'. Ler pelo último faria
 * "a:b:PONTOS" abrir a aba de um jogador "a:b" que a validação recusou —
 * hoje inofensivo porque o id é UUID, e nada travava isso.
 */
export function abaDoJogador(estado: EstadoDaLista, jogadorId: string): AtributoDaRota | undefined {
  if (estado.aba === undefined) return undefined
  const separador = estado.aba.indexOf(':')
  if (estado.aba.slice(0, separador) !== jogadorId) return undefined
  const atributo = estado.aba.slice(separador + 1)
  return ATRIBUTOS.find((a) => a === atributo)
}

const primeiro = (v: string | string[] | undefined): string | undefined => {
  const s = Array.isArray(v) ? v[0] : v
  return s === undefined || s === '' ? undefined : s
}

const dentro = <T extends string>(lista: readonly T[], v: string | undefined): T | undefined =>
  lista.find((item) => item === v)

/**
 * A URL virando estado, COM validação. Valor desconhecido some (a tela cai no
 * padrão) em vez de derrubar o render: querystring é entrada de usuário.
 */
export function lerEstadoDaLista(
  params: Record<string, string | string[] | undefined>,
): EstadoDaLista {
  const quantidadeBruta = Number(primeiro(params.quantidade))
  const aba = primeiro(params.aba)
  return {
    quantidade: QUANTIDADES.find((q) => q === quantidadeBruta) ?? 0,
    metodo: dentro(METODOS, primeiro(params.metodo)),
    nivel: dentro(NIVEIS, primeiro(params.nivel)),
    time: primeiro(params.time),
    posicao: primeiro(params.posicao),
    atributo: dentro(ATRIBUTOS, primeiro(params.atributo)),
    ordem: dentro(ORDENS_LISTA, primeiro(params.ordem)),
    lente: dentro(LENTES, primeiro(params.lente)),
    aba: aba !== undefined && /^[^:]{1,64}:[A-Z_]{1,16}$/.test(aba) ? aba : undefined,
  }
}

/**
 * O estado escondido numa URL de destino — o caminho de volta das server
 * actions do seletor e das lentes.
 *
 * Elas recebem do formulário a URL para onde o clique ia (`destino`) e
 * remontam a rota A PARTIR DAQUI, nunca da string crua: assim um destino
 * forjado não vira redirecionamento para fora do app, e o que a ação grava é
 * sempre um valor do vocabulário.
 */
export function estadoDaUrl(destino: string): EstadoDaLista {
  const separador = destino.indexOf('?')
  const p = new URLSearchParams(separador === -1 ? '' : destino.slice(separador + 1))
  return lerEstadoDaLista(Object.fromEntries(p.entries()))
}
