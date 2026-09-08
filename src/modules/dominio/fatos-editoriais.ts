import { and, inArray, isNotNull } from 'drizzle-orm'

import type { Atributo, JogadorFato, Nivel } from '../motor/tipos'
import { mapaJogadores } from './db/schema'
import type { Db } from './db/tipos'
import { normalizarTexto } from './texto'

type Classificacao = {
  jogadorId: string
  timeId: string
  atributo: Atributo
  nivel: Nivel
  posicaoHierarquia: number
}

type DadosEditoriais = Pick<JogadorFato, 'classificacoes' | 'posicaoHierarquia'> & {
  posicaoHierarquiaPorAtributo: Partial<Record<Atributo, number>>
}

/** O elenco canônico lê a classe do jogador; cada bloco editorial lê só o seu time. */
export function indexarClassificacoes(linhas: readonly Classificacao[]) {
  const porJogador = new Map<string, DadosEditoriais>()
  const porTime = new Map<string, Map<string, DadosEditoriais>>()

  const acrescentar = (mapa: Map<string, DadosEditoriais>, c: Classificacao) => {
    const dados: DadosEditoriais = mapa.get(c.jogadorId) ?? {
      classificacoes: {},
      posicaoHierarquia: c.posicaoHierarquia,
      posicaoHierarquiaPorAtributo: {},
    }
    dados.classificacoes[c.atributo] = c.nivel
    dados.posicaoHierarquiaPorAtributo[c.atributo] = c.posicaoHierarquia
    // O ordinal legado ordena a apresentação. A estratégia consulta o mapa
    // por atributo; pontos tem preferência para preservar a ordem anterior.
    dados.posicaoHierarquia =
      dados.posicaoHierarquiaPorAtributo.PONTOS ??
      Math.min(...Object.values(dados.posicaoHierarquiaPorAtributo))
    mapa.set(c.jogadorId, dados)
  }

  for (const c of linhas) {
    acrescentar(porJogador, c)
    const doTime = porTime.get(c.timeId) ?? new Map<string, DadosEditoriais>()
    acrescentar(doTime, c)
    porTime.set(c.timeId, doTime)
  }
  return { porJogador, porTime }
}

/**
 * A exceção nominal do ruleset usa a identidade editorial reconciliada,
 * nunca um palpite baseado no nome atual do provedor. Preserva os nomes
 * confirmados: cadastrar o alias de uma casa não revoga a identidade do CJ.
 */
export async function chavesEstrategiaConfirmadas(db: Db, idsJogador: string[]) {
  const chaves = new Map<string, string[]>()
  if (idsJogador.length === 0) return chaves
  const vinculos = await db
    .select({ jogadorId: mapaJogadores.jogadorId, nomeNaLista: mapaJogadores.nomeNaLista })
    .from(mapaJogadores)
    .where(
      and(
        inArray(mapaJogadores.jogadorId, idsJogador),
        isNotNull(mapaJogadores.confirmadoEm),
        isNotNull(mapaJogadores.confirmadoPor),
      ),
    )

  for (const vinculo of vinculos) {
    if (vinculo.jogadorId === null) continue
    const chave = normalizarTexto(vinculo.nomeNaLista).replace(/ /g, '-')
    if (!chave) continue
    const nomes = chaves.get(vinculo.jogadorId) ?? []
    if (!nomes.includes(chave)) nomes.push(chave)
    chaves.set(vinculo.jogadorId, nomes.sort())
  }
  return chaves
}
