import { notFound } from 'next/navigation'

import estilos from '@/components/afiliados/PainelComercial.module.css'
import { ShellComercial } from '@/components/afiliados/ShellComercial'

export const metadata = { title: 'Prévia visual de afiliados' }

const metricas = [
  ['Cliques observados', '1.284'],
  ['Saídas para casas', '863'],
  ['Receita NIP', 'R$ 18.420,00'],
  ['Parcela dos parceiros', 'R$ 7.368,00'],
] as const

export default function PreviaVisualAfiliados() {
  if (process.env.NODE_ENV === 'production') notFound()
  return (
    <ShellComercial area="admin" nome="Equipe NIP">
      <header className={estilos.topo}>
        <div>
          <h1>Afiliados</h1>
          <p>Controle de campanhas, conciliação, recebimentos e repasses externos.</p>
        </div>
        <span className={estilos.selo}>Operação manual e auditável</span>
      </header>
      <form className={estilos.filtros}>
        <label>
          De
          <input type="date" defaultValue="2026-09-01" />
        </label>
        <label>
          Até
          <input type="date" defaultValue="2026-09-08" />
        </label>
        <button className={estilos.botao}>Filtrar período</button>
      </form>
      <div className={estilos.gradeMetricas}>
        {metricas.map(([rotulo, valor], indice) => (
          <article
            className={`${estilos.metrica} ${indice === metricas.length - 1 ? estilos.destaque : ''}`}
            key={rotulo}
          >
            <small>{rotulo}</small>
            <strong>{valor}</strong>
          </article>
        ))}
      </div>
      <div className={estilos.grade}>
        <section className={`${estilos.painel} ${estilos.largo}`}>
          <h2>Campanhas com mais resultado</h2>
          <p>Valores sintéticos exclusivos desta prévia visual.</p>
          <table className={estilos.tabela}>
            <thead>
              <tr>
                <th>Campanha</th>
                <th>Parceiro</th>
                <th>Cliques</th>
                <th>Comissão</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>conteudo-setembro</td>
                <td>Parceiro Norte</td>
                <td>782</td>
                <td>R$ 4.860,00</td>
                <td>Ativa</td>
              </tr>
              <tr>
                <td>comunidade-nba</td>
                <td>Parceiro Sul</td>
                <td>502</td>
                <td>R$ 2.508,00</td>
                <td>Ativa</td>
              </tr>
            </tbody>
          </table>
        </section>
        <section className={estilos.painel}>
          <h2>Importar relatório</h2>
          <p>Prévia e confirmação separadas.</p>
          <form className={estilos.formulario}>
            <label>
              Oferta
              <select defaultValue="oferta">
                <option value="oferta">Oferta de homologação</option>
              </select>
            </label>
            <label>
              Arquivo CSV
              <input type="file" />
            </label>
            <button className={estilos.botao}>Validar prévia</button>
          </form>
        </section>
        <section className={estilos.painel}>
          <h2>Estado operacional</h2>
          <p>Nenhuma transferência é iniciada pela plataforma.</p>
          <ul className={estilos.lista}>
            <li className={estilos.linha}>
              <div>
                <strong>3 lotes confirmados</strong>
                <small>Última importação hoje</small>
              </div>
            </li>
            <li className={estilos.linha}>
              <div>
                <strong>2 liberações abertas</strong>
                <small>Revisão administrativa pendente</small>
              </div>
            </li>
          </ul>
        </section>
      </div>
    </ShellComercial>
  )
}
