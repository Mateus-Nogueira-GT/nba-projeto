import { eq, like } from 'drizzle-orm'

import { getDb } from '@/modules/dominio/db/cliente'
import { casas, mapaJogadores, mapaMercados } from '@/modules/dominio/db/schema'
import { atributoEnum } from '@/modules/dominio/db/schema/enums'
import { negarSeNaoForAdmin } from '../guarda'
import { confirmarVinculoDeMercado } from './acoes'

// Lê banco a cada requisição — nunca prerenderiza no build.
export const dynamic = 'force-dynamic'

/**
 * CURADORIA DE MERCADOS E NOMES DAS CASAS (spec 06, fatia 4).
 *
 * O mesmo problema do mapa_jogadores, duas vezes: cada casa nomeia o mercado
 * e grafa o jogador à sua maneira. Vínculo errado aqui mostra a odd de um
 * jogador no card de outro — por isso NADA é automático (regra 3).
 *
 * A fila povoa quando a coleta de odds existir (bloqueada pelo contrato com
 * as casas — G4). A tela já opera sobre as tabelas, com dado de fixture ou real.
 */
export default async function PaginaMercados() {
  const negado = await negarSeNaoForAdmin()
  if (negado) return negado

  if (!process.env.DATABASE_URL) {
    return (
      <main style={{ padding: 24, fontFamily: 'system-ui' }}>
        <h1>Mercados</h1>
        <p>Banco não configurado.</p>
      </main>
    )
  }

  const db = getDb()
  const [listaCasas, mercados, vinculosDeCasa] = await Promise.all([
    db.select().from(casas),
    db.select().from(mapaMercados),
    db.select().from(mapaJogadores).where(like(mapaJogadores.provedor, 'casa:%')),
  ])
  const nomeDaCasa = new Map(listaCasas.map((c) => [c.id, c.nome] as const))
  const pendentes = mercados.filter((m) => !m.confirmado)
  const confirmados = mercados.filter((m) => m.confirmado)

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 720 }}>
      <h1 style={{ marginTop: 0 }}>Curadoria de mercados</h1>
      <p style={{ color: '#555' }}>
        {listaCasas.length} casa{listaCasas.length === 1 ? '' : 's'} · {confirmados.length}{' '}
        mercado{confirmados.length === 1 ? '' : 's'} confirmado{confirmados.length === 1 ? '' : 's'} ·{' '}
        {vinculosDeCasa.length} vínculo{vinculosDeCasa.length === 1 ? '' : 's'} de jogador
      </p>

      {listaCasas.length === 0 && (
        <p>
          Nenhuma casa cadastrada. A coleta de odds aguarda o contrato comercial com as casas
          (spec 06); quando ele chegar, a fila de curadoria povoa sozinha.
        </p>
      )}

      <h2>Mercados pendentes ({pendentes.length})</h2>
      {pendentes.length === 0 && <p style={{ color: '#555' }}>Fila vazia.</p>}
      {pendentes.map((m) => (
        <form
          key={m.id}
          action={confirmarVinculoDeMercado}
          style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}
        >
          <input type="hidden" name="casaId" value={m.casaId} />
          <input type="hidden" name="nomeMercadoNaCasa" value={m.nomeMercadoNaCasa} />
          <span>
            <strong>{m.nomeMercadoNaCasa}</strong> · {nomeDaCasa.get(m.casaId) ?? m.casaId}
          </span>
          <select name="atributo" defaultValue={m.atributo}>
            {atributoEnum.enumValues.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <button type="submit">Confirmar</button>
        </form>
      ))}

      <h2>Confirmados</h2>
      <ul>
        {confirmados.map((m) => (
          <li key={m.id}>
            {m.nomeMercadoNaCasa} → {m.atributo} · {nomeDaCasa.get(m.casaId) ?? m.casaId}
          </li>
        ))}
      </ul>

      <h2>Vínculos de jogador por casa</h2>
      <ul>
        {vinculosDeCasa.map((v) => (
          <li key={v.id}>
            “{v.nomeNaLista}” ({v.provedor}) {v.confirmadoEm ? `· confirmado por ${v.confirmadoPor}` : '· pendente'}
          </li>
        ))}
      </ul>
    </main>
  )
}
