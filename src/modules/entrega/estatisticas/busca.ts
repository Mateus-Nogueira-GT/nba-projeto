import { and, eq } from 'drizzle-orm'

import { classificacao, jogadores, times } from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import { contemTrecho, pontuar } from '../../dominio/texto'

export type ResultadoJogador = {
  tipo: 'JOGADOR'
  id: string
  nome: string
  fotoUrl: string | null
  posicao: string | null
  timeSigla: string | null
  ativo: boolean
  score: number
}

export type ResultadoTime = {
  tipo: 'TIME'
  id: string
  sigla: string
  nome: string
  conferencia: string | null
  score: number
}

export type ResultadoBusca = ResultadoJogador | ResultadoTime

/**
 * Piso de similaridade para a busca por grafia aproximada.
 *
 * Mais frouxo que o da reconciliação de nomes na ingestão (0,55): errar aqui
 * mostra um jogador a mais numa lista, enquanto errar lá grava um vínculo
 * errado no banco. O custo do falso positivo é assimétrico, então o corte é.
 */
const SCORE_MINIMO = 0.45

/** Acima disso o resultado é bom o bastante para dispensar os aproximados. */
const SCORE_EXATO = 0.999

/**
 * Tamanho mínimo para o casamento por TRECHO valer.
 *
 * Com 1 ou 2 letras, "contém" casa com quase todo mundo — "a" devolvia o
 * elenco inteiro, que é ruído com cara de resultado. Abaixo deste tamanho só
 * a grafia aproximada responde, e ela naturalmente não casa com fragmento.
 * Três letras é o menor termo que ainda discrimina, e cobre sigla de time.
 */
const MINIMO_PARA_TRECHO = 3

export type OpcoesBusca = {
  limite?: number
  /** Restringe a um tipo. Ausente = jogadores e times juntos. */
  apenas?: 'JOGADOR' | 'TIME'
}

/**
 * BUSCA da aba de estatísticas.
 *
 * Duas perguntas diferentes, respondidas juntas:
 *
 *   nome PARCIAL     "brun"    -> Jalen Brunson   (contém o trecho)
 *   grafia APROXIMADA "doncick" -> Luka Doncic    (distância de edição)
 *
 * Só o Levenshtein não resolve a primeira: "brun" e "jalen brunson" são
 * distantes como strings. Só o "contém" não resolve a segunda: "doncick" não
 * está contido em "doncic". Por isso as duas medidas convivem, e a maior
 * vence.
 *
 * Roda em memória sobre o elenco. São ~500 jogadores e 30 times — carregar e
 * pontuar é mais barato do que manter um índice de trigrama no Postgres, e
 * mantém a mesma régua de similaridade que a ingestão usa (dominio/texto.ts).
 */
export async function buscar(
  db: Db,
  consulta: string,
  opcoes: OpcoesBusca = {},
): Promise<ResultadoBusca[]> {
  const termo = consulta.trim()
  if (termo.length === 0) return []

  const limite = opcoes.limite ?? 20
  const resultados: ResultadoBusca[] = []

  if (opcoes.apenas !== 'TIME') {
    const [elenco, listaTimes] = await Promise.all([
      db.select().from(jogadores),
      db.select().from(times),
    ])
    const siglaPorTime = new Map(listaTimes.map((t) => [t.id, t.sigla] as const))

    for (const j of elenco) {
      const score = pontuarNome(termo, j.nomeCompleto)
      if (score < SCORE_MINIMO) continue
      resultados.push({
        tipo: 'JOGADOR',
        id: j.id,
        nome: j.nomeCompleto,
        fotoUrl: j.fotoUrl,
        posicao: j.posicao,
        timeSigla: j.timeId === null ? null : (siglaPorTime.get(j.timeId) ?? null),
        ativo: j.ativo,
        score,
      })
    }
  }

  if (opcoes.apenas !== 'JOGADOR') {
    const listaTimes = await db.select().from(times)
    for (const t of listaTimes) {
      // Um time é achável pela sigla ("LAL") e pelo nome ("Lakers").
      const score = Math.max(pontuarNome(termo, t.nome), pontuarNome(termo, t.sigla))
      if (score < SCORE_MINIMO) continue
      resultados.push({
        tipo: 'TIME',
        id: t.id,
        sigla: t.sigla,
        nome: t.nome,
        conferencia: t.conferencia,
        score,
      })
    }
  }

  return resultados
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      // Empate: jogador fora da liga desce. Schröder foi dispensado e continua
      // no banco — ele deve aparecer, mas nunca na frente de quem está ativo.
      const ativoA = a.tipo === 'JOGADOR' && !a.ativo ? 1 : 0
      const ativoB = b.tipo === 'JOGADOR' && !b.ativo ? 1 : 0
      if (ativoA !== ativoB) return ativoA - ativoB
      return a.nome.localeCompare(b.nome)
    })
    .slice(0, limite)
}

/**
 * A maior das duas medidas.
 *
 * O trecho contido recebe 0,9 em vez de 1 para que um acerto exato de grafia
 * ainda fique à frente de um prefixo qualquer: quem digita "lebron james"
 * inteiro quer o LeBron, não alguém cujo nome contenha o trecho por acaso.
 */
function pontuarNome(consulta: string, alvo: string): number {
  const aproximado = pontuar(consulta, alvo)
  if (aproximado >= SCORE_EXATO) return aproximado

  const porTrecho =
    consulta.trim().length >= MINIMO_PARA_TRECHO && contemTrecho(consulta, alvo) ? 0.9 : 0

  return Math.max(aproximado, porTrecho)
}

export type TimeNoMenu = {
  id: string
  sigla: string
  nome: string
  conferencia: string | null
  posicao: number | null
}

/** Times ordenados pela classificação — a entrada "por time" do menu. */
export async function listarTimes(db: Db, temporada: string): Promise<TimeNoMenu[]> {
  const linhas = await db
    .select({
      id: times.id,
      sigla: times.sigla,
      nome: times.nome,
      conferencia: times.conferencia,
      posicao: classificacao.posicao,
    })
    .from(times)
    // LEFT JOIN com a temporada DENTRO da condição: um time sem linha de
    // classificação ainda aparece no menu, sem posição. Filtrar por temporada
    // no WHERE o eliminaria da lista.
    .leftJoin(
      classificacao,
      and(eq(classificacao.timeId, times.id), eq(classificacao.temporada, temporada)),
    )

  return linhas.sort(
    (a, b) => (a.posicao ?? 99) - (b.posicao ?? 99) || a.nome.localeCompare(b.nome),
  )
}
