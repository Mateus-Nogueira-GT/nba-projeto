import { asc, count, eq, isNull } from 'drizzle-orm'

import { jogadores, mapaJogadores, niveis, niveisVersao, times } from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import { ativarVersaoNiveis } from '../../dominio/repositorios/niveis'
import { normalizarTexto } from '../../dominio/texto'
import type { Atributo, Nivel } from '../../motor/tipos'

/**
 * BACKUP DA LISTA DO CJ — o que sobrevive à limpeza da demo.
 *
 * `niveis.jogador_id` aponta para os jogadores de demonstração; apagar a demo
 * leva a lista junto. O backup guarda a lista pelo que NÃO depende de id: o
 * nome do jogador, o nome escrito pelo CJ, a sigla do time. É por esses que a
 * restauração religa a lista aos jogadores reais.
 */
export type BackupListaCj = {
  geradoEm: string
  versoes: {
    versao: string
    origemArquivo: string | null
    importadoPor: string | null
    importadoEm: string
    ativa: boolean
    niveis: {
      nome: string
      nomeNaLista: string | null
      timeSigla: string
      atributo: Atributo
      nivel: Nivel
      posicaoHierarquia: number
    }[]
  }[]
}

export async function exportarListaDoCj(db: Db): Promise<BackupListaCj> {
  const versoes = await db
    .select()
    .from(niveisVersao)
    .orderBy(asc(niveisVersao.importadoEm), asc(niveisVersao.versao))

  // Um jogador pode ter linha no mapa de mais de um provedor. A confirmada
  // vence: é a grafia que um humano já disse que é dele.
  const nomeNaListaPorJogador = new Map<string, { nome: string; confirmado: boolean }>()
  const mapa = await db.select().from(mapaJogadores).orderBy(asc(mapaJogadores.nomeNaLista))
  for (const m of mapa) {
    if (!m.jogadorId) continue
    const atual = nomeNaListaPorJogador.get(m.jogadorId)
    const confirmado = m.confirmadoEm !== null
    if (!atual || (confirmado && !atual.confirmado)) {
      nomeNaListaPorJogador.set(m.jogadorId, { nome: m.nomeNaLista, confirmado })
    }
  }

  const resultado: BackupListaCj['versoes'] = []
  for (const v of versoes) {
    const linhas = await db
      .select({
        jogadorId: niveis.jogadorId,
        nome: jogadores.nomeCompleto,
        timeSigla: times.sigla,
        atributo: niveis.atributo,
        nivel: niveis.nivel,
        posicaoHierarquia: niveis.posicaoHierarquia,
      })
      .from(niveis)
      .innerJoin(jogadores, eq(jogadores.id, niveis.jogadorId))
      .innerJoin(times, eq(times.id, niveis.timeId))
      .where(eq(niveis.niveisVersaoId, v.id))
      .orderBy(asc(times.sigla), asc(niveis.atributo), asc(niveis.posicaoHierarquia))

    resultado.push({
      versao: v.versao,
      origemArquivo: v.origemArquivo,
      importadoPor: v.importadoPor,
      importadoEm: v.importadoEm.toISOString(),
      ativa: v.ativa,
      niveis: linhas.map((l) => ({
        nome: l.nome,
        nomeNaLista: nomeNaListaPorJogador.get(l.jogadorId)?.nome ?? null,
        timeSigla: l.timeSigla,
        atributo: l.atributo,
        nivel: l.nivel,
        posicaoHierarquia: l.posicaoHierarquia,
      })),
    })
  }

  return { geradoEm: new Date().toISOString(), versoes: resultado }
}

/**
 * Religa a lista do backup aos jogadores que estão no banco AGORA.
 *
 * Identidade errada aqui põe o nível do CJ no jogador errado da NBA — então a
 * restauração SÓ liga o que um humano já confirmou: o nome da lista com vínculo
 * CONFIRMADO em `mapa_jogadores`, no provedor da opção. Nome igual nunca
 * autoriza vínculo sozinho.
 *
 * Todo o resto vira pendente com `jogador_id` NULL — é o filtro da tela
 * /admin/mapeamento, que só lista o que não tem jogador. Quando há UM jogador
 * com o mesmo nome normalizado, o nome volta em `sugeridos`: a tela mostra a
 * sugestão e o parceiro confirma com um clique. Zero ou vários candidatos: não
 * sugerimos nada — homônimo não se escolhe por nós.
 *
 * A restauração é a fonte da verdade das versões que ela restaura: cada rodada
 * apaga e regrava os `niveis` da versão a partir do mapa confirmado. Assim,
 * reconfirmar um nome para outro jogador e rodar de novo TROCA o vínculo, em
 * vez de deixar a linha velha para trás.
 */
export async function restaurarListaDoCj(
  db: Db,
  backup: BackupListaCj,
  opcoes: { provedor: string },
): Promise<{ versoes: number; ligados: number; pendentes: string[]; sugeridos: string[] }> {
  const timesPorSigla = new Map(
    (await db.select().from(times)).map((t) => [t.sigla, t.id] as const),
  )
  const candidatosPorNome = new Map<string, number>()
  for (const j of await db.select({ nome: jogadores.nomeCompleto }).from(jogadores)) {
    const chave = normalizarTexto(j.nome)
    candidatosPorNome.set(chave, (candidatosPorNome.get(chave) ?? 0) + 1)
  }

  // 1 · Resolve cada nome UMA vez (o mesmo nome aparece em várias versões).
  const confirmados = new Map(
    (await db.select().from(mapaJogadores).where(eq(mapaJogadores.provedor, opcoes.provedor)))
      .filter((m) => m.confirmadoEm !== null)
      .map((m) => [m.nomeNaLista, m.jogadorId] as const),
  )
  const jogadorPorChave = new Map<string, string | null>()
  const pendentes = new Set<string>()
  const sugeridos = new Set<string>()

  for (const v of backup.versoes) {
    for (const n of v.niveis) {
      const chaveMapa = n.nomeNaLista ?? n.nome
      if (jogadorPorChave.has(chaveMapa)) continue

      if (confirmados.has(chaveMapa)) {
        // Decisão humana — inclusive "confirmado sem jogador", que fica pendente.
        jogadorPorChave.set(chaveMapa, confirmados.get(chaveMapa) ?? null)
        continue
      }

      jogadorPorChave.set(chaveMapa, null)
      if (candidatosPorNome.get(normalizarTexto(n.nome)) === 1) sugeridos.add(chaveMapa)
      // Pendente para a tela. O `setWhere` garante que uma linha confirmada
      // entre a leitura e a escrita não é tocada.
      await db
        .insert(mapaJogadores)
        .values({ nomeNaLista: chaveMapa, provedor: opcoes.provedor, jogadorId: null })
        .onConflictDoUpdate({
          target: [mapaJogadores.nomeNaLista, mapaJogadores.provedor],
          set: { jogadorId: null },
          setWhere: isNull(mapaJogadores.confirmadoEm),
        })
    }
  }

  // 2 · Cada versão numa transação: recria (ou reaproveita) e regrava os níveis.
  let ligados = 0
  let versaoAtivaId: string | null = null

  for (const v of backup.versoes) {
    // A chave única é (versão, jogador, atributo). Dois nomes do backup que
    // caem no MESMO jogador real são dúvida de identidade: nenhum entra.
    const porChave = new Map<
      string,
      { nomeExibido: string; linha: Omit<typeof niveis.$inferInsert, 'niveisVersaoId'> }[]
    >()
    for (const n of v.niveis) {
      const nomeExibido = n.nomeNaLista ?? n.nome
      const jogadorId = jogadorPorChave.get(nomeExibido) ?? null
      const timeId = timesPorSigla.get(n.timeSigla)
      if (!jogadorId || !timeId) {
        pendentes.add(nomeExibido)
        continue
      }
      const chave = `${jogadorId}:${n.atributo}`
      porChave.set(chave, [
        ...(porChave.get(chave) ?? []),
        {
          nomeExibido,
          linha: {
            jogadorId,
            timeId,
            atributo: n.atributo,
            nivel: n.nivel,
            posicaoHierarquia: n.posicaoHierarquia,
          },
        },
      ])
    }
    const linhas: Omit<typeof niveis.$inferInsert, 'niveisVersaoId'>[] = []
    for (const grupo of porChave.values()) {
      if (grupo.length === 1) linhas.push(grupo[0]!.linha)
      else for (const g of grupo) pendentes.add(g.nomeExibido)
    }

    const { versaoId, presentes } = await db.transaction(async (tx) => {
      // Mesma `versao` (texto): se já existe, reaproveita. Nasce inativa; a
      // ativação é um passo só, no fim, para nunca haver duas.
      await tx
        .insert(niveisVersao)
        .values({
          versao: v.versao,
          origemArquivo: v.origemArquivo,
          importadoPor: v.importadoPor,
          importadoEm: new Date(v.importadoEm),
          ativa: false,
        })
        .onConflictDoNothing({ target: niveisVersao.versao })
      const [versao] = await tx.select().from(niveisVersao).where(eq(niveisVersao.versao, v.versao))

      await tx.delete(niveis).where(eq(niveis.niveisVersaoId, versao!.id))
      if (linhas.length > 0) {
        await tx.insert(niveis).values(linhas.map((l) => ({ ...l, niveisVersaoId: versao!.id })))
      }
      const [contagem] = await tx
        .select({ n: count() })
        .from(niveis)
        .where(eq(niveis.niveisVersaoId, versao!.id))
      return { versaoId: versao!.id, presentes: contagem?.n ?? 0 }
    })

    ligados += presentes
    if (v.ativa) versaoAtivaId = versaoId
  }

  // Sem versão ativa no backup não há o que impor: a ativação atual fica.
  if (versaoAtivaId) await ativarVersaoNiveis(db, versaoAtivaId)

  return {
    versoes: backup.versoes.length,
    ligados,
    pendentes: [...pendentes].sort(),
    sugeridos: [...sugeridos].filter((nome) => pendentes.has(nome)).sort(),
  }
}
