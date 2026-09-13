import { CabecalhoTela, Moldura } from '@/components/navegacao'
import type { EstadoDoApito } from '@/modules/entrega/estatisticas/jogador'
import { semantico } from '@/design-system/tokens/semantico'

/**
 * SOBRANCELHA DA ABA — repetida em toda tela de estatísticas (lista e
 * detalhes), porque é a fronteira que mais importa aqui: dado que a liga
 * registrou, nunca a estratégia do CJ. Ver `.dependency-cruiser.cjs` >
 * `estatisticas-nao-passam-pelo-motor`.
 */
export const SOBRANCELHA_STATS = 'DADO CANÔNICO · SEM ESTRATÉGIA'

/**
 * Quantos apitos o perfil do jogador mostra.
 *
 * Mora aqui, e não dentro da página, porque o teste precisa contar a mesma
 * coisa que a tela ("X de Y bateu"): o mesmo número escrito à mão em dois
 * arquivos diverge no dia em que um dos dois muda.
 */
export const LIMITE_DE_APITOS_DO_JOGADOR = 20

/**
 * O AUXILIAR DA SEÇÃO "Apitos da estratégia" — "1 de 3 bateu".
 *
 * Três armadilhas, e é por isso que ele é uma função testável e não um ternário
 * dentro do JSX:
 *
 * - Contar só os conferidos e cair em "aguardando dado oficial" quando não há
 *   nenhum anunciava dado pendente por cima de linhas que já diziam "não jogou"
 *   — o cabeçalho contradizendo o corpo. Jogador que se lesionou na véspera de
 *   toda partida apitada não é caso exótico: é quem mais aparece na lista.
 * - "14 de 20 bateu" numa lista cortada no limite é lido como o retrospecto
 *   INTEIRO do jogador. Numa seção que a spec §4.5 chama de mecanismo de
 *   confiança verificável, o recorte tem que estar escrito.
 * - Sem apito nenhum não há auxiliar: a linha de baixo já diz que a Lista
 *   Secreta nunca apitou este jogador.
 */
export function resumoDosApitos(
  apitos: readonly { estado: EstadoDoApito; bateu: boolean | null }[],
  truncado: boolean,
): string | undefined {
  if (apitos.length === 0) return undefined
  const recorte = truncado ? ` · últimos ${LIMITE_DE_APITOS_DO_JOGADOR}` : ''
  const conferidos = apitos.filter((a) => a.estado === 'CONFERIDO')
  if (conferidos.length > 0) {
    const bateram = conferidos.filter((a) => a.bateu === true).length
    return `${bateram} de ${conferidos.length} bateu${recorte}`
  }
  if (apitos.some((a) => a.estado === 'AGUARDANDO_OFICIAL')) {
    return `aguardando dado oficial${recorte}`
  }
  return `sem apito conferido${recorte}`
}

/**
 * O AUXILIAR DAS SEÇÕES QUE LEEM O HISTÓRICO DE PARTIDAS.
 *
 * `telaDoJogador` corta o histórico num limite (25 por padrão) e as duas
 * seções que nascem dele — a tabela jogo a jogo e as médias de "Números
 * completos" — valiam só pelas últimas N partidas enquanto o auxiliar
 * continuava NOMEANDO a temporada. Numa temporada de 82 jogos, o hero escreve
 * "68 jogos · 2025-26" duas linhas acima de uma tabela de 25 linhas rotulada
 * "temporada 2025-26": ou o rótulo muda, ou o corte aparece. Aqui ele aparece.
 *
 * Sem corte o rótulo é o do artboard, intacto.
 */
export function recorteDoHistorico(partidas: number, cortado: boolean, inteiro: string): string {
  return cortado ? `últimas ${partidas} partidas` : inteiro
}

/**
 * TÍTULO DE SEÇÃO (identidade 04): rótulo condensado em maiúsculas à
 * esquerda, um auxiliar discreto à direita — "temporada 2025-26", "1 de 3
 * bateu". O auxiliar existe para tirar o contexto de dentro do conteúdo; é
 * assim que a seção fica densa sem ganhar mais uma linha de texto.
 */
export function Secao({
  titulo,
  aux,
  children,
}: {
  titulo: string
  aux?: string
  children: React.ReactNode
}) {
  return (
    <section style={{ marginTop: 22 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 10,
          marginBottom: 10,
        }}
      >
        <h2
          style={{
            margin: 0,
            fontFamily: semantico.fonteRotulo,
            fontSize: 11,
            letterSpacing: 1.5,
            fontWeight: 700,
            textTransform: 'uppercase',
            color: semantico.textoSecundario,
          }}
        >
          {titulo}
        </h2>
        {aux && (
          <span
            style={{
              fontFamily: semantico.fonteRotulo,
              fontSize: 11,
              letterSpacing: 1,
              fontWeight: 500,
              textTransform: 'uppercase',
              color: semantico.texto40,
            }}
          >
            {aux}
          </span>
        )}
      </div>
      {children}
    </section>
  )
}

export function SemBanco() {
  return (
    <Moldura aba="stats" largura="dados">
      <CabecalhoTela sobrancelha={SOBRANCELHA_STATS} titulo="STATS" />
      <p style={{ color: semantico.textoSecundario }}>
        Banco não configurado. Rode <code>vercel env pull</code> e <code>npm run db:migrate</code>.
      </p>
    </Moldura>
  )
}
