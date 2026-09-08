import { eq } from 'drizzle-orm'

import { jogadores } from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import { identidadesDeApresentacao } from '../../dominio/identidade-apresentacao'

import { IDENTIDADES_NBA } from '../../dominio/identidades-nba'

/** Compatibilidade do mapa de fotos; personId e nome oficial têm uma única fonte. */
export const MAPA_FOTOS: Record<string, number | null> = Object.fromEntries(
  IDENTIDADES_NBA.map((i) => [i.alias, i.personId]),
)

export function urlDaFoto(personId: number): string {
  return `https://cdn.nba.com/headshots/nba/latest/1040x760/${personId}.png`
}

export type ResultadoFotos = {
  gravadas: number
  /** Sem jogador correspondente ou falha na verificação da URL — é problema. */
  puladas: string[]
  /** `null` no mapa: ambiguidade declarada, fica sem foto de propósito. */
  semId: string[]
}

/**
 * Grava `foto_url` só para nomes cuja URL o `verificar` aprovou (respondeu
 * 200). Verificação na GRAVAÇÃO, não na renderização: nenhuma imagem quebrada
 * pode chegar a aparecer numa apresentação ao cliente.
 *
 * `verificar` entra por injeção de propósito — o script real passa `fetch`,
 * o teste passa um verificador falso. O motor de fotos não toca rede sozinho.
 */
export async function aplicarFotos(
  db: Db,
  verificar: (url: string) => Promise<boolean>,
): Promise<ResultadoFotos> {
  const identidades = await identidadesDeApresentacao(db)
  const porPersonId = new Map<number, string[]>()
  for (const [id, identidade] of identidades) {
    if (identidade.personId === null || identidade.pendencia) continue
    const ids = porPersonId.get(identidade.personId) ?? []
    ids.push(id)
    porPersonId.set(identidade.personId, ids)
  }
  let gravadas = 0
  const puladas: string[] = []
  const semId: string[] = []
  for (const [nome, personId] of Object.entries(MAPA_FOTOS)) {
    if (personId === null) {
      semId.push(nome)
      continue
    }
    const candidatos = porPersonId.get(personId) ?? []
    const id = candidatos.length === 1 ? candidatos[0] : undefined
    const url = urlDaFoto(personId)
    if (id === undefined) {
      puladas.push(nome)
      continue
    }
    let disponivel = false
    try {
      disponivel = await verificar(url)
    } catch {
      // Uma URL indisponível não impede as demais fotos de serem preenchidas.
      // A pendência aparece no resultado para permitir nova tentativa do CLI.
    }
    if (!disponivel) {
      puladas.push(nome)
      continue
    }
    await db.update(jogadores).set({ fotoUrl: url }).where(eq(jogadores.id, id))
    gravadas += 1
  }
  return { gravadas, puladas, semId }
}
