import { CabecalhoTela, Moldura } from '@/components/navegacao'
import { semantico } from '@/design-system/tokens/semantico'

/**
 * SOBRANCELHA DA ABA — repetida em toda tela de estatísticas (lista e
 * detalhes), porque é a fronteira que mais importa aqui: dado que a liga
 * registrou, nunca a estratégia do CJ. Ver `.dependency-cruiser.cjs` >
 * `estatisticas-nao-passam-pelo-motor`.
 */
export const SOBRANCELHA_STATS = 'DADO CANÔNICO · SEM ESTRATÉGIA'

export function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 24 }}>
      <h2 style={{ fontSize: 15, margin: '0 0 8px', color: semantico.textoPrimario }}>{titulo}</h2>
      {children}
    </section>
  )
}

export function SemBanco() {
  return (
    <Moldura aba="stats">
      <CabecalhoTela sobrancelha={SOBRANCELHA_STATS} titulo="STATS" />
      <p style={{ color: semantico.textoSecundario }}>
        Banco não configurado. Rode <code>vercel env pull</code> e <code>npm run db:migrate</code>.
      </p>
    </Moldura>
  )
}
