import { notFound } from 'next/navigation'
import { Aviso, CabecalhoAdmin, Campo, GradeDeMetricas, Metrica, Painel, Status } from '@/features/admin/componentes'
import { negarSeNaoForAdmin } from '@/features/admin/guarda'
import s from '@/features/admin/Admin.module.css'

export const metadata = { title: 'Prévia visual de afiliados' }

/**
 * Prévia com números SINTÉTICOS, para avaliar o layout do painel comercial
 * cheio antes de haver operação real. Não existe em produção.
 */
const METRICAS = [
  ['Cliques observados', '1.284'],
  ['Saídas para casas', '863'],
  ['Receita NIP', 'R$ 18.420,00'],
  ['Parcela dos parceiros', 'R$ 7.368,00'],
] as const

const CAMPANHAS = [
  { campanha: 'conteudo-setembro', parceiro: 'Parceiro Norte', cliques: 782, comissao: 'R$ 4.860,00', status: 'ATIVA' },
  { campanha: 'comunidade-nba', parceiro: 'Parceiro Sul', cliques: 502, comissao: 'R$ 2.508,00', status: 'ATIVA' },
]

export default async function PreviaVisualAfiliados() {
  if (process.env.NODE_ENV === 'production') notFound()
  const negado = await negarSeNaoForAdmin()
  if (negado) return negado

  return (
    <div className={s.tela}>
      <CabecalhoAdmin
        area="afiliados"
        titulo="Afiliados · prévia visual"
        apoio="Controle de campanhas, conciliação, recebimentos e repasses externos."
      />
      <Aviso tom="atencao">Valores sintéticos exclusivos desta prévia visual. Esta página não existe em produção.</Aviso>

      <div className={s.filtros}>
        <Campo rotulo="De">
          <input type="date" defaultValue="2026-09-01" />
        </Campo>
        <Campo rotulo="Até">
          <input type="date" defaultValue="2026-09-08" />
        </Campo>
        <button className={s.botao} type="button">
          Filtrar período
        </button>
      </div>

      <GradeDeMetricas rotulo="Indicadores (sintéticos)">
        {METRICAS.map(([rotulo, valor], i) => (
          <Metrica key={rotulo} rotulo={rotulo} valor={valor} destaque={i === METRICAS.length - 1} />
        ))}
      </GradeDeMetricas>

      <div className={s.grade}>
        <Painel titulo="Campanhas com mais resultado" apoio="Valores sintéticos exclusivos desta prévia visual." largo>
          <div className={s.rolagem}>
            <table className={s.tabela}>
              <thead>
                <tr>
                  <th scope="col">Campanha</th>
                  <th scope="col">Parceiro</th>
                  <th scope="col">Cliques</th>
                  <th scope="col">Comissão</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {CAMPANHAS.map((c) => (
                  <tr key={c.campanha}>
                    <td className={s.codigo}>{c.campanha}</td>
                    <td className={s.celulaPrincipal}>{c.parceiro}</td>
                    <td className="num">{c.cliques}</td>
                    <td className="num">{c.comissao}</td>
                    <td>
                      <Status valor={c.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Painel>
        <Painel titulo="Importar relatório" apoio="Prévia e confirmação separadas.">
          <div className={s.formulario}>
            <Campo rotulo="Oferta">
              <select defaultValue="oferta">
                <option value="oferta">Oferta de homologação</option>
              </select>
            </Campo>
            <Campo rotulo="Arquivo CSV">
              <input type="file" />
            </Campo>
            <div>
              <button className={s.botao} type="button">
                Validar prévia
              </button>
            </div>
          </div>
        </Painel>
        <Painel titulo="Estado operacional" apoio="Nenhuma transferência é iniciada pela plataforma.">
          <ul className={s.lista}>
            <li>
              <span className={s.pilha}>
                <span className={s.celulaPrincipal}>3 lotes confirmados</span>
                <span className={s.fraco}>Última importação hoje</span>
              </span>
            </li>
            <li>
              <span className={s.pilha}>
                <span className={s.celulaPrincipal}>2 liberações abertas</span>
                <span className={s.fraco}>Revisão administrativa pendente</span>
              </span>
            </li>
          </ul>
        </Painel>
      </div>
    </div>
  )
}
