import { and, eq, isNull } from 'drizzle-orm'

import { getDb } from '@/modules/dominio/db/cliente'
import { identidadesJogador, jogadores, mapaJogadores } from '@/modules/dominio/db/schema'
import { sugerir, type Sugestao } from '@/modules/ingestao/niveis/similaridade'
import { negarSeNaoForAdmin } from '../guarda'
import { confirmarVinculo } from './acoes'

// Lê banco a cada requisição — nunca prerenderiza no build.
export const dynamic = 'force-dynamic'

const PROVEDOR = process.env.NBA_PRIMARIO_NOME ?? 'balldontlie'

type Pendente = { sugestao: Sugestao; estado: 'SEM_CANDIDATO' | 'AMBIGUO' | 'INEQUIVOCO' }

async function carregar(): Promise<{
  pendentes: Pendente[]
  totalElenco: number
  jogadorPorIdExterno: Record<string, string>
} | null> {
  if (!process.env.DATABASE_URL) return null

  const db = getDb()

  const [nomes, elenco] = await Promise.all([
    db
      .select()
      .from(mapaJogadores)
      .where(and(eq(mapaJogadores.provedor, PROVEDOR), isNull(mapaJogadores.jogadorId))),
    db
      .select({
        jogadorId: jogadores.id,
        idExterno: identidadesJogador.idExterno,
        nomeCompleto: jogadores.nomeCompleto,
        ativo: jogadores.ativo,
      })
      .from(identidadesJogador)
      .innerJoin(jogadores, eq(jogadores.id, identidadesJogador.jogadorId))
      .where(eq(identidadesJogador.provedor, PROVEDOR)),
  ])

  const candidatosDoProvedor = elenco.map((j) => ({
    idExterno: j.idExterno,
    nomeCompleto: j.nomeCompleto,
    timeSiglaProvedor: null,
    ativo: j.ativo,
  }))

  const pendentes = nomes
    .map((n) => {
      const sugestao = sugerir(n.nomeNaLista, candidatosDoProvedor)
      const estado: Pendente['estado'] =
        sugestao.candidatos.length === 0
          ? 'SEM_CANDIDATO'
          : sugestao.inequivoco
            ? 'INEQUIVOCO'
            : 'AMBIGUO'
      return { sugestao, estado }
    })
    // Ambíguos primeiro: são os que mais custam se decididos no automático.
    .sort((a, b) => ordem(a.estado) - ordem(b.estado))

  return {
    pendentes,
    totalElenco: elenco.length,
    jogadorPorIdExterno: Object.fromEntries(elenco.map((j) => [j.idExterno, j.jogadorId])),
  }
}

function ordem(estado: Pendente['estado']): number {
  return estado === 'AMBIGUO' ? 0 : estado === 'SEM_CANDIDATO' ? 1 : 2
}

const ROTULO: Record<Pendente['estado'], string> = {
  AMBIGUO: 'Vários candidatos plausíveis — escolha qual',
  SEM_CANDIDATO: 'Nenhum candidato encontrado',
  INEQUIVOCO: 'Um candidato claro — ainda assim precisa de confirmação',
}

export default async function PaginaMapeamento() {
  // A checagem vem ANTES de qualquer leitura: sem ela, a tela de curadoria
  // do mapa_jogadores ficava aberta a quem soubesse a URL.
  const negado = await negarSeNaoForAdmin()
  if (negado) return negado

  const dados = await carregar()

  if (dados === null) {
    return (
      <main style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 900 }}>
        <h1>Mapeamento de jogadores</h1>
        <p>
          Banco não configurado. Rode <code>vercel env pull</code> e <code>npm run db:migrate</code>
          .
        </p>
      </main>
    )
  }

  const { pendentes, totalElenco, jogadorPorIdExterno } = dados

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 900, lineHeight: 1.5 }}>
      <h1>Mapeamento de jogadores</h1>

      <p>
        Os elencos da lista são <strong>projetados</strong> e não correspondem à NBA real. O vínculo
        jogador↔time vem da lista; aqui você só liga o <em>nome escrito na lista</em> ao jogador do
        provedor. Toda ligação exige confirmação humana.
      </p>

      <p>
        <strong>{pendentes.length}</strong> nome(s) pendente(s) · {totalElenco} jogador(es) no
        elenco do provedor
      </p>

      {pendentes.length === 0 && <p>Nada pendente.</p>}

      <ul style={{ listStyle: 'none', padding: 0 }}>
        {pendentes.map(({ sugestao, estado }) => (
          <li
            key={sugestao.nomeNaLista}
            style={{ border: '1px solid #ccc', borderRadius: 6, padding: 16, marginBottom: 12 }}
          >
            <h2 style={{ margin: '0 0 4px', fontSize: 18 }}>{sugestao.nomeNaLista}</h2>
            <p style={{ margin: '0 0 12px', fontSize: 13 }}>{ROTULO[estado]}</p>

            {sugestao.candidatos.length === 0 ? (
              <p style={{ fontSize: 13 }}>
                Nenhum jogador do provedor se parece com este nome. Pode ser grafia muito distante,
                jogador fora da liga ou nome que ainda não foi ingerido. Continua listado aqui até
                ser resolvido — não é descartado.
              </p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {sugestao.candidatos.map((c) => (
                  <li
                    key={c.idExterno}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '6px 0',
                      borderTop: '1px solid #eee',
                    }}
                  >
                    <span style={{ flex: 1 }}>
                      {c.nomeCompleto}
                      {!c.ativo && (
                        <strong style={{ marginLeft: 8, fontSize: 12 }}>
                          FORA DA LIGA — confirme só se for mesmo esta pessoa
                        </strong>
                      )}
                    </span>

                    <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>
                      {(c.score * 100).toFixed(0)}%
                    </span>

                    <form action={confirmarVinculo}>
                      <input type="hidden" name="nomeNaLista" value={sugestao.nomeNaLista} />
                      <input
                        type="hidden"
                        name="jogadorId"
                        value={jogadorPorIdExterno[c.idExterno] ?? ''}
                      />
                      <input type="hidden" name="provedorPlayerId" value={c.idExterno} />
                      <input type="hidden" name="provedor" value={PROVEDOR} />
                      <input type="hidden" name="score" value={c.score} />
                      <button type="submit">Confirmar</button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </main>
  )
}
