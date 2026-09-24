import {
  lerEstadoDaLista,
  rotaDaLista,
  type EstadoDaLista,
} from '@/modules/entrega/lista-secreta-rotas'

/**
 * O estado da Lista na URL. A base (filtros, ordem, lente) é a de
 * `entrega/lista-secreta-rotas.ts`, sem alteração. O v2 acrescenta dois campos
 * que só a tabela precisa — busca e ordenação por coluna — montados POR CIMA
 * da rota da entrega, nunca reescrevendo-a.
 */
/**
 * Quantos JOGADORES a lista mostra. Reunião com os sócios (23/09/2026): de 1 a
 * 5, e depois 10, 15 e 20. A entrega aceita só 1, 2 e 5; o v2 lê o parâmetro
 * por conta própria (a rota da entrega já escreve qualquer número).
 */
export const QUANTIDADES_DA_LISTA = [1, 2, 3, 4, 5, 10, 15, 20] as const

export const COLUNAS_ORDENAVEIS = ['sinal', 'confianca', 'odd', 'media', 'ultimos', 'jogo'] as const
export type ColunaOrdenavel = (typeof COLUNAS_ORDENAVEIS)[number]

export type EstadoDaTabela = EstadoDaLista & {
  busca?: string
  /** Só os jogadores que a pessoa segue ("Meus jogos" do Flashscore). */
  seguidos: boolean
  ordenarPor: ColunaOrdenavel
}

type Params = Record<string, string | string[] | undefined>

const primeiro = (v: string | string[] | undefined): string | undefined => {
  const s = Array.isArray(v) ? v[0] : v
  return s === undefined || s.trim() === '' ? undefined : s.trim()
}

export function lerEstadoDaTabela(params: Params): EstadoDaTabela {
  const base = lerEstadoDaLista(params)
  const busca = primeiro(params.busca)?.slice(0, 60)
  const ordenar = primeiro(params.ordenar)
  const quantidadeBruta = Number(primeiro(params.quantidade))
  return {
    ...base,
    quantidade: QUANTIDADES_DA_LISTA.find((q) => q === quantidadeBruta) ?? 0,
    seguidos: primeiro(params.seguidos) === '1',
    // A aba de atributo por card não existe na tabela: uma linha por apito.
    aba: undefined,
    busca,
    ordenarPor: COLUNAS_ORDENAVEIS.find((c) => c === ordenar) ?? 'sinal',
  }
}

/** A rota da Lista com o estado dado, mais as mudanças pedidas. */
export function hrefDaLista(estado: EstadoDaTabela, mudancas: Partial<EstadoDaTabela> = {}): string {
  const final = { ...estado, ...mudancas }
  const base = rotaDaLista(final)
  const [, consulta = ''] = base.split('?')
  const p = new URLSearchParams(consulta)
  if (final.busca) p.set('busca', final.busca)
  if (final.seguidos) p.set('seguidos', '1')
  if (final.ordenarPor !== 'sinal') p.set('ordenar', final.ordenarPor)
  const q = p.toString()
  return q === '' ? '/' : `/?${q}`
}

/** Todos os recortes zerados — o "Limpar filtros". Mantém ordem e lente. */
export const SEM_RECORTE: Partial<EstadoDaTabela> = {
  quantidade: 0,
  metodo: undefined,
  nivel: undefined,
  time: undefined,
  posicao: undefined,
  atributo: undefined,
  busca: undefined,
  seguidos: false,
}

export function quantosRecortes(estado: EstadoDaTabela): number {
  return [
    estado.quantidade !== 0,
    estado.metodo,
    estado.nivel,
    estado.time,
    estado.posicao,
    estado.busca,
    estado.seguidos,
  ].filter(Boolean).length
}
