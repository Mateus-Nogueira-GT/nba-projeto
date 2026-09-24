import { and, eq, isNull } from 'drizzle-orm'
import { getDb } from '@/modules/dominio/db/cliente'
import { identidadesJogador, jogadores, mapaJogadores } from '@/modules/dominio/db/schema'
import { sugerir, type Sugestao } from '@/modules/ingestao/niveis/similaridade'
import { contar } from '@/ui/formato'
import { CabecalhoAdmin, GradeDeMetricas, Metrica, Painel, Status, Vazio } from '@/features/admin/componentes'
import { FormAcao } from '@/features/admin/FormAcao'
import { BancoNaoConfigurado, negarSeNaoForAdmin } from '@/features/admin/guarda'
import { confirmarVinculo } from '@/features/admin/mapeamento/acoes'
import s from '@/features/admin/Admin.module.css'

// Lê banco a cada requisição — nunca prerenderiza no build.
export const dynamic = 'force-dynamic'
export const metadata = { title: 'Mapeamento · Painel' }

const PROVEDOR = process.env.NBA_PRIMARIO_NOME ?? 'balldontlie'

type Estado = 'SEM_CANDIDATO' | 'AMBIGUO' | 'INEQUIVOCO'
type Pendente = { sugestao: Sugestao; estado: Estado }

type LinhaDoMapa = { nomeNaLista: string }
type LinhaDoElenco = { jogadorId: string; idExterno: string; nomeCompleto: string; ativo: boolean }

async function carregar(): Promise<{
  pendentes: Pendente[]
  totalElenco: number
  jogadorPorIdExterno: Record<string, string>
}> {
  const db = getDb()
  const [nomes, elenco] = (await Promise.all([
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
  ])) as [LinhaDoMapa[], LinhaDoElenco[]]

  const candidatosDoProvedor = elenco.map((j) => ({
    idExterno: j.idExterno,
    nomeCompleto: j.nomeCompleto,
    timeSiglaProvedor: null,
    ativo: j.ativo,
  }))

  const pendentes = nomes
    .map((n): Pendente => {
      const sugestao = sugerir(n.nomeNaLista, candidatosDoProvedor)
      const estado: Estado =
        sugestao.candidatos.length === 0 ? 'SEM_CANDIDATO' : sugestao.inequivoco ? 'INEQUIVOCO' : 'AMBIGUO'
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

function ordem(estado: Estado): number {
  return estado === 'AMBIGUO' ? 0 : estado === 'SEM_CANDIDATO' ? 1 : 2
}

const ROTULO: Record<Estado, string> = {
  AMBIGUO: 'Vários candidatos plausíveis — escolha qual',
  SEM_CANDIDATO: 'Nenhum candidato encontrado',
  INEQUIVOCO: 'Um candidato claro — ainda assim precisa de confirmação',
}

export default async function PaginaMapeamento() {
  // A checagem vem ANTES de qualquer leitura: sem ela, a curadoria do
  // mapa_jogadores ficava aberta a quem soubesse a URL.
  const negado = await negarSeNaoForAdmin()
  if (negado) return negado
  if (!process.env.DATABASE_URL) return <BancoNaoConfigurado titulo="Mapeamento de jogadores" />

  const { pendentes, totalElenco, jogadorPorIdExterno } = await carregar()
  const ambiguos = pendentes.filter((p) => p.estado === 'AMBIGUO').length

  return (
    <div className={s.tela}>
      <CabecalhoAdmin
        area="mapeamento"
        titulo="Mapeamento de jogadores"
        apoio={
          <>
            Os elencos da lista são <strong>projetados</strong> e não correspondem à NBA real. O vínculo
            jogador↔time vem da lista; aqui você só liga o <em>nome escrito na lista</em> ao jogador do
            provedor. Toda ligação exige confirmação humana.
          </>
        }
      />

      <GradeDeMetricas rotulo="Fila de mapeamento">
        <Metrica rotulo="Nomes pendentes" valor={pendentes.length} destaque={pendentes.length > 0} />
        <Metrica rotulo="Ambíguos" valor={ambiguos} />
        <Metrica rotulo="Elenco do provedor" valor={totalElenco} apoio={PROVEDOR} />
      </GradeDeMetricas>

      {pendentes.length === 0 ? (
        <Vazio>Nada pendente. Novos nomes da lista do CJ aparecem aqui até serem vinculados.</Vazio>
      ) : (
        <div className={s.grade}>
          {pendentes.map(({ sugestao, estado }) => (
            <Painel
              key={sugestao.nomeNaLista}
              titulo={sugestao.nomeNaLista}
              apoio={ROTULO[estado]}
              acao={<Status valor={estado === 'AMBIGUO' ? 'AMBÍGUO' : estado === 'INEQUIVOCO' ? 'CLARO' : 'SEM CANDIDATO'} />}
            >
              {sugestao.candidatos.length === 0 ? (
                <p className={s.fraco}>
                  Nenhum jogador do provedor se parece com este nome. Pode ser grafia muito distante, jogador
                  fora da liga ou nome que ainda não foi ingerido. Continua listado aqui até ser resolvido — não
                  é descartado.
                </p>
              ) : (
                <ul className={s.lista}>
                  {sugestao.candidatos.map((c) => (
                    <li key={c.idExterno}>
                      <span className={s.pilha}>
                        <span className={s.celulaPrincipal}>{c.nomeCompleto}</span>
                        <span className={s.fraco}>
                          Semelhança <span className="num">{(c.score * 100).toFixed(0)}%</span>
                        </span>
                        {!c.ativo && (
                          <span className={s.erro}>FORA DA LIGA — confirme só se for mesmo esta pessoa</span>
                        )}
                      </span>
                      <FormAcao acao={confirmarVinculo} compacto rotulo={`Vincular ${sugestao.nomeNaLista} a ${c.nomeCompleto}`}>
                        <input type="hidden" name="nomeNaLista" value={sugestao.nomeNaLista} />
                        <input type="hidden" name="jogadorId" value={jogadorPorIdExterno[c.idExterno] ?? ''} />
                        <input type="hidden" name="provedorPlayerId" value={c.idExterno} />
                        <input type="hidden" name="provedor" value={PROVEDOR} />
                        <input type="hidden" name="score" value={c.score} />
                        <button type="submit" className={s.botaoSecundario}>
                          Confirmar
                        </button>
                      </FormAcao>
                    </li>
                  ))}
                </ul>
              )}
            </Painel>
          ))}
        </div>
      )}
      <p className={s.rodapeNota}>{contar(pendentes.length, 'nome pendente', 'nomes pendentes')}.</p>
    </div>
  )
}
