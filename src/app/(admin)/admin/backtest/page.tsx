import { getDb } from '@/modules/dominio/db/cliente'
import { carregarCandidato, listarCandidatos } from '@/modules/entrega/backtest/candidatos'
import { gerarCsv } from '@/modules/entrega/backtest/csv'
import { comparar, executarBacktest } from '@/modules/entrega/backtest/executar'
import type { Diferenca, ResultadoBacktest } from '@/modules/entrega/backtest/executar'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import { negarSeNaoForAdmin } from '../guarda'
import { FormularioCandidato } from './formulario'
import { semantico } from '@/design-system/tokens/semantico'

// Lê banco a cada requisição — nunca prerenderiza no build.
export const dynamic = 'force-dynamic'
// Um período longo percorre a temporada inteira em laço.
export const maxDuration = 300

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/

type Comparativo = {
  a: ResultadoBacktest
  b: ResultadoBacktest
  diferenca: Diferenca
  csv: string
}

/**
 * BACKTEST DE RULESETS — a entrega comercial do ADR-0002.
 *
 * Escolher período e dois rulesets; ver o comparativo; exportar CSV. Nada é
 * gravado em `apitos`. O rodapé P12 não é decorativo: nenhum número desta
 * tela é probabilidade ou promessa de retorno.
 */
export default async function PaginaBacktest({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const negado = await negarSeNaoForAdmin()
  if (negado) return negado

  if (!process.env.DATABASE_URL) {
    return (
      <main style={{ padding: 24, fontFamily: 'system-ui' }}>
        <h1>Backtest</h1>
        <p>Banco não configurado.</p>
      </main>
    )
  }

  const db = getDb()
  const params = await searchParams
  const de = typeof params.de === 'string' ? params.de : ''
  const ate = typeof params.ate === 'string' ? params.ate : ''
  const versaoB = typeof params.candidato === 'string' ? params.candidato : ''

  const candidatos = await listarCandidatos(db)

  let comparativo: Comparativo | null = null
  let erro: string | null = null
  if (DATA_ISO.test(de) && DATA_ISO.test(ate) && versaoB) {
    const ativo = await rulesetAtivo()
    const candidato = await carregarCandidato(db, versaoB)
    if (candidato === null) {
      erro = `Candidato "${versaoB}" não encontrado.`
    } else if (de > ate) {
      erro = 'O início do período vem depois do fim.'
    } else {
      const periodo = { de, ate }
      const a = await executarBacktest(db, ativo, periodo)
      const b = await executarBacktest(db, candidato, periodo)
      const diferenca = comparar(a, b)
      comparativo = { a, b, diferenca, csv: gerarCsv(a, b, diferenca) }
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 760 }}>
      <h1 style={{ marginTop: 0 }}>Backtest de rulesets</h1>
      <p style={{ color: semantico.textoSecundario }}>
        Reexecuta o motor sobre o histórico com um ruleset candidato e compara com o ativo. Nada é
        gravado no histórico real.
      </p>

      <h2>Comparar</h2>
      {candidatos.length === 0 ? (
        <p style={{ color: semantico.textoSecundario }}>Nenhum candidato salvo ainda — cadastre um abaixo.</p>
      ) : (
        <form method="get" style={{ display: 'flex', gap: 8, alignItems: 'end', flexWrap: 'wrap' }}>
          <label>
            De
            <br />
            <input type="date" name="de" defaultValue={de} required />
          </label>
          <label>
            Até
            <br />
            <input type="date" name="ate" defaultValue={ate} required />
          </label>
          <label>
            Candidato (vs ativo)
            <br />
            <select name="candidato" defaultValue={versaoB}>
              {candidatos.map((c) => (
                <option key={c.versao} value={c.versao}>
                  {c.versao}
                </option>
              ))}
            </select>
          </label>
          <button type="submit">Rodar</button>
        </form>
      )}

      {erro && <p style={{ color: semantico.alerta }}>{erro}</p>}

      {comparativo && (
        <>
          <h2>
            Resultado · {comparativo.a.periodo.de} a {comparativo.a.periodo.ate}
          </h2>
          <p style={{ color: semantico.textoSecundario }}>
            Amostra classificável: {comparativo.a.classificaveis} (ativo) vs{' '}
            {comparativo.b.classificaveis} (candidato). Amostra pequena dá número, não conclusão.
          </p>
          <table style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['métrica', 'ativo', 'candidato', 'delta'].map((h) => (
                  <th key={h} style={{ border: `1px solid ${semantico.divisor}`, padding: '4px 10px' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ['apitos', comparativo.a.apitos, comparativo.b.apitos, comparativo.diferenca.apitosDelta],
                  ['acertos', comparativo.a.acertos, comparativo.b.acertos, comparativo.diferenca.acertosDelta],
                  ['indeterminados', comparativo.a.indeterminados, comparativo.b.indeterminados, ''],
                ] as const
              ).map(([nome, va, vb, delta]) => (
                <tr key={nome}>
                  <td style={{ border: `1px solid ${semantico.divisor}`, padding: '4px 10px' }}>{nome}</td>
                  <td style={{ border: `1px solid ${semantico.divisor}`, padding: '4px 10px' }}>{va}</td>
                  <td style={{ border: `1px solid ${semantico.divisor}`, padding: '4px 10px' }}>{vb}</td>
                  <td style={{ border: `1px solid ${semantico.divisor}`, padding: '4px 10px' }}>{delta}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            Entraram: {comparativo.diferenca.entraram.length} · Saíram:{' '}
            {comparativo.diferenca.sairam.length}
          </p>
          <p>
            <a
              download={`backtest-${comparativo.a.periodo.de}-${comparativo.a.periodo.ate}.csv`}
              href={`data:text/csv;charset=utf-8,${encodeURIComponent(comparativo.csv)}`}
            >
              Exportar CSV
            </a>
          </p>
        </>
      )}

      <h2>Novo candidato</h2>
      <FormularioCandidato />

      <p style={{ marginTop: 24, fontSize: 12, color: semantico.textoSecundario }}>
        Medição do comportamento de regra sobre dado histórico — não é sugestão de aposta nem
        promessa de retorno. O ruleset ativo continua versionado em git; promover um candidato é um
        commit do YAML, não um UPDATE.
      </p>
    </main>
  )
}
