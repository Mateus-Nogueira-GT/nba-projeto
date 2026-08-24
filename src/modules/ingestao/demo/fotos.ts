import { eq } from 'drizzle-orm'

import { jogadores } from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'

/**
 * FOTOS DA DEMONSTRAÇÃO — mapa curado nome (grafia EXATA da lista do CJ) →
 * personId oficial da NBA.
 *
 * A lista de níveis usa grafias próprias do Mestre da NBA, diferentes da
 * grafia oficial da NBA (ex.: "Shai", "stephen Curry", "Giannis"). Os ids
 * abaixo foram conferidos manualmente contra o CDN (ver task-11-report.md) —
 * um id trocado responde 200 igual, mas é a foto de outro jogador.
 */
export const MAPA_FOTOS: Record<string, number> = {
  // OKC / DEN — o jogo ao vivo da demo
  Shai: 1628983,
  Jokic: 203999,
  'Jamal Murray': 1627750,
  Gordon: 203932,
  // LAL / PHI
  'Luka Doncic': 1629029,
  'LeBron James': 2544,
  'Austin Reaves': 1630559,
  // GSW / BOS
  'stephen Curry': 201939,
  Tatum: 1628369,
  // MIA / NYK
  Giannis: 203507,
  Adebayo: 1628389,
  Brunson: 1628973,
  Towns: 1626157,
}

export function urlDaFoto(personId: number): string {
  return `https://cdn.nba.com/headshots/nba/latest/1040x760/${personId}.png`
}

export type ResultadoFotos = { gravadas: number; puladas: string[] }

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
  const todos = await db.select().from(jogadores)
  const porNome = new Map(todos.map((j) => [j.nomeCompleto, j.id] as const))
  let gravadas = 0
  const puladas: string[] = []
  for (const [nome, personId] of Object.entries(MAPA_FOTOS)) {
    const id = porNome.get(nome)
    const url = urlDaFoto(personId)
    if (id === undefined || !(await verificar(url))) {
      puladas.push(nome)
      continue
    }
    await db.update(jogadores).set({ fotoUrl: url }).where(eq(jogadores.id, id))
    gravadas += 1
  }
  return { gravadas, puladas }
}
