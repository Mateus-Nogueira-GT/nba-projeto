import { getDb } from '@/modules/dominio/db/cliente'
import { carregarCandidato, listarCandidatos } from '@/modules/entrega/backtest/candidatos'
import { gerarCsv } from '@/modules/entrega/backtest/csv'
import { comparar, executarBacktest } from '@/modules/entrega/backtest/executar'
import type { Diferenca, ResultadoBacktest } from '@/modules/entrega/backtest/executar'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import { Aviso, CabecalhoAdmin, Campo, GradeDeMetricas, Metrica, Painel, Vazio } from '@/features/admin/componentes'
import { FormAcao } from '@/features/admin/FormAcao'
import { BancoNaoConfigurado, negarSeNaoForAdmin } from '@/features/admin/guarda'
import { salvarCandidato } from '@/features/admin/backtest/acoes'
import s from '@/features/admin/Admin.module.css'

// Lê banco a cada requisição — nunca prerenderiza no build.
export const dynamic = 'force-dynamic'
// Um período longo percorre a temporada inteira em laço.
export const maxDuration = 300
export const metadata = { title: 'Backtest · Painel' }

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/

type Comparativo = { a: ResultadoBacktest; b: ResultadoBacktest; diferenca: Diferenca; csv: string }

const comSinal = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0')

/**
 * BACKTEST DE RULESETS — escolher período e um candidato, comparar com o
 * ativo, exportar CSV. Nada é gravado em `apitos`. Nenhum número desta tela é
 * probabilidade ou promessa de retorno.
 */
export default async function PaginaBacktest({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const negado = await negarSeNaoForAdmin()
  if (negado) return negado
  if (!process.env.DATABASE_URL) return <BancoNaoConfigurado titulo="Backtest" />

  const db = getDb()
  const params = await searchParams
  const de = typeof params.de === 'string' ? params.de : ''
  const ate = typeof params.ate === 'string' ? params.ate : ''
  const versaoB = typeof params.candidato === 'string' ? params.candidato : ''

  const candidatos = await listarCandidatos(db)

  let comparativo: Comparativo | null = null
  let erro: string | null = null
  if (DATA_ISO.test(de) && DATA_ISO.test(ate) && versaoB) {
    const candidato = await carregarCandidato(db, versaoB)
    if (candidato === null) {
      erro = `Candidato "${versaoB}" não encontrado.`
    } else if (de > ate) {
      erro = 'O início do período vem depois do fim.'
    } else {
      try {
        const ativo = await rulesetAtivo()
        const periodo = { de, ate }
        const a = await executarBacktest(db, ativo, periodo)
        const b = await executarBacktest(db, candidato, periodo)
        const diferenca = comparar(a, b)
        comparativo = { a, b, diferenca, csv: gerarCsv(a, b, diferenca) }
      } catch (e) {
        erro = e instanceof Error ? e.message : 'Não foi possível rodar o backtest.'
      }
    }
  }

  return (
    <div className={s.tela}>
      <CabecalhoAdmin
        area="backtest"
        titulo="Backtest de rulesets"
        apoio="Reexecuta o motor sobre o histórico com um ruleset candidato e compara com o ativo. Nada é gravado no histórico real."
      />

      <Painel titulo="Comparar" apoio="Período e candidato; o ativo é sempre o lado A." largo>
        {candidatos.length === 0 ? (
          <Vazio>Nenhum candidato salvo ainda — cadastre um abaixo.</Vazio>
        ) : (
          <form method="get" className={s.linhaCampos}>
            <Campo rotulo="De">
              <input type="date" name="de" defaultValue={de} required />
            </Campo>
            <Campo rotulo="Até">
              <input type="date" name="ate" defaultValue={ate} required />
            </Campo>
            <Campo rotulo="Candidato (vs ativo)">
              <select name="candidato" defaultValue={versaoB}>
                {candidatos.map((c) => (
                  <option key={c.versao} value={c.versao}>
                    {c.versao}
                  </option>
                ))}
              </select>
            </Campo>
            <button type="submit" className={s.botao}>
              Rodar
            </button>
          </form>
        )}
        {erro && (
          <p role="alert" className={s.erro}>
            {erro}
          </p>
        )}
      </Painel>

      {comparativo && (
        <Painel
          titulo={`Resultado · ${comparativo.a.periodo.de} a ${comparativo.a.periodo.ate}`}
          apoio={`Amostra classificável: ${comparativo.a.classificaveis} (ativo) vs ${comparativo.b.classificaveis} (candidato). Amostra pequena dá número, não conclusão.`}
          largo
          acao={
            <a
              className={s.botaoSecundario}
              download={`backtest-${comparativo.a.periodo.de}-${comparativo.a.periodo.ate}.csv`}
              href={`data:text/csv;charset=utf-8,${encodeURIComponent(comparativo.csv)}`}
            >
              Exportar CSV
            </a>
          }
        >
          <GradeDeMetricas rotulo="Diferença entre candidato e ativo">
            <Metrica rotulo="Apitos (Δ)" valor={comSinal(comparativo.diferenca.apitosDelta)} />
            <Metrica rotulo="Acertos (Δ)" valor={comSinal(comparativo.diferenca.acertosDelta)} destaque />
            <Metrica rotulo="Entraram" valor={comparativo.diferenca.entraram.length} apoio="jogadores só no candidato" />
            <Metrica rotulo="Saíram" valor={comparativo.diferenca.sairam.length} apoio="jogadores só no ativo" />
          </GradeDeMetricas>
          <div className={s.rolagem}>
            <table className={s.tabela}>
              <thead>
                <tr>
                  <th scope="col">Métrica</th>
                  <th scope="col">Ativo</th>
                  <th scope="col">Candidato</th>
                  <th scope="col">Delta</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ['Apitos', comparativo.a.apitos, comparativo.b.apitos, comSinal(comparativo.diferenca.apitosDelta)],
                    ['Acertos', comparativo.a.acertos, comparativo.b.acertos, comSinal(comparativo.diferenca.acertosDelta)],
                    ['Indeterminados', comparativo.a.indeterminados, comparativo.b.indeterminados, ''],
                  ] as const
                ).map(([nome, va, vb, delta]) => (
                  <tr key={nome}>
                    <th scope="row">{nome}</th>
                    <td className="num">{va}</td>
                    <td className="num">{vb}</td>
                    <td className="num">{delta}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Painel>
      )}

      <Painel titulo="Novo candidato" apoio="Cole o YAML completo do ruleset; a validação aponta o campo errado." largo>
        <FormAcao acao={salvarCandidato} rotulo="Salvar candidato">
          <Campo rotulo="Versão (rótulo)">
            <input name="versao" placeholder="candidato-delta-7" required />
          </Campo>
          <Campo rotulo="YAML completo do ruleset">
            <textarea name="conteudoYaml" rows={10} required />
          </Campo>
          <div>
            <button type="submit" className={s.botao}>
              Salvar candidato
            </button>
          </div>
        </FormAcao>
      </Painel>

      <Aviso>
        Medição do comportamento de regra sobre dado histórico — não é sugestão de aposta nem promessa de
        retorno. O ruleset ativo continua versionado em git; promover um candidato é um commit do YAML, não
        um UPDATE.
      </Aviso>
    </div>
  )
}
