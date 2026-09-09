import { redirect } from 'next/navigation'
import Link from 'next/link'

import { CopiarLink } from '@/components/afiliados/CopiarLink'
import estilos from '@/components/afiliados/PainelComercial.module.css'
import { ShellComercial } from '@/components/afiliados/ShellComercial'
import { dataCurta, dinheiro } from '@/components/afiliados/formato'
import { getDb } from '@/modules/dominio/db/cliente'
import { sessaoAtual } from '@/modules/plataforma/auth/cookies'
import { painelDoAfiliado } from '@/modules/plataforma/afiliados/servico'
import { filtroDePeriodo } from '@/modules/plataforma/afiliados/periodo'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Painel de afiliado' }

export default async function PaginaAfiliado({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sessao = await sessaoAtual()
  if (!sessao) redirect('/entrar?destino=/afiliados')
  if (!process.env.DATABASE_URL) return <main>Banco não configurado.</main>

  const parametros = await searchParams
  const valor = (chave: string) => {
    const bruto = parametros[chave]
    return Array.isArray(bruto) ? bruto[0] : bruto
  }
  const inicio = valor('inicio')
  const fim = valor('fim')
  let painel: Awaited<ReturnType<typeof painelDoAfiliado>>
  try {
    painel = await painelDoAfiliado(getDb(), sessao.usuarioId, filtroDePeriodo(inicio, fim))
  } catch {
    return <main className={estilos.vazio}>Sua conta ainda não possui uma parceria NIP ativa.</main>
  }
  const principal = painel.totaisPorMoeda[0] ?? {
    moeda: 'BRL',
    comissaoConfirmadaCentavos: 0,
    repassadoCentavos: 0,
  }
  const totalFinanceiro = (campo: 'comissaoConfirmadaCentavos' | 'repassadoCentavos') =>
    painel.totaisPorMoeda.length > 1
      ? `${painel.totaisPorMoeda.length} moedas`
      : dinheiro(principal[campo], principal.moeda)

  return (
    <ShellComercial area="afiliado" nome={painel.parceiro.nomePublico}>
      <header className={estilos.topo}>
        <div>
          <h1>Visão geral</h1>
          <p>Acompanhe seus links, resultados importados e repasses registrados.</p>
        </div>
        <span className={estilos.selo}>Primeiro toque · 30 dias</span>
      </header>

      <form method="get" className={estilos.filtros}>
        <label>
          De
          <input type="date" name="inicio" defaultValue={inicio} />
        </label>
        <label>
          Até
          <input type="date" name="fim" defaultValue={fim} />
        </label>
        <button className={estilos.botao} type="submit">
          Filtrar período
        </button>
        {inicio || fim ? (
          <Link className={estilos.botaoSecundario} href="/afiliados">
            Limpar
          </Link>
        ) : null}
      </form>

      <div className={estilos.gradeMetricas} aria-label="Indicadores do afiliado">
        <article className={estilos.metrica}>
          <small>Cliques observados</small>
          <strong>{painel.totais.cliquesObservados}</strong>
        </article>
        <article className={estilos.metrica}>
          <small>Saídas para casas</small>
          <strong>{painel.totais.saidasParaCasa}</strong>
        </article>
        <article className={estilos.metrica}>
          <small>Comissão confirmada</small>
          <strong>{totalFinanceiro('comissaoConfirmadaCentavos')}</strong>
        </article>
        <article className={`${estilos.metrica} ${estilos.destaque}`}>
          <small>Repassado</small>
          <strong>{totalFinanceiro('repassadoCentavos')}</strong>
        </article>
      </div>

      <div className={estilos.grade}>
        <section className={estilos.painel} id="links">
          <h2>Meus links</h2>
          <p>Criados e administrados pela equipe NIP.</p>
          {painel.links.length === 0 ? (
            <div className={estilos.vazio}>Nenhum link disponível.</div>
          ) : (
            <ul className={estilos.lista}>
              {painel.links.map((link) => (
                <li className={estilos.linha} key={link.id}>
                  <div>
                    <strong>{link.campanha.nome}</strong>
                    <small className={estilos.codigo}>/r/{link.codigo}</small>
                  </div>
                  <CopiarLink caminho={`/r/${link.codigo}`} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={estilos.painel} id="repasses">
          <h2>Extrato de repasses</h2>
          <p>Pagamentos externos registrados pela operação.</p>
          {painel.repasses.length === 0 ? (
            <div className={estilos.vazio}>Nenhum repasse registrado.</div>
          ) : (
            <ul className={estilos.lista}>
              {painel.repasses.map((repasse) => (
                <li className={estilos.linha} key={repasse.id}>
                  <div>
                    <strong>{dinheiro(repasse.valorCentavos, repasse.moeda)}</strong>
                    <small>
                      {dataCurta(repasse.pagoEm)} · {repasse.referenciaExterna}
                    </small>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={`${estilos.painel} ${estilos.largo}`} id="resultados">
          <h2>Indicados e resultados</h2>
          <p>Somente identificadores mascarados fornecidos nos relatórios das casas.</p>
          <table className={estilos.tabela}>
            <thead>
              <tr>
                <th>Indicado</th>
                <th>Data do evento</th>
                <th>Modalidade</th>
                <th>Base NIP</th>
              </tr>
            </thead>
            <tbody>
              {painel.indicados.map((item, indice) => (
                <tr key={`${item.identificador ?? 'anonimo'}-${indice}`}>
                  <td>{item.identificador ?? 'Não identificado'}</td>
                  <td>{dataCurta(item.ocorridoEm)}</td>
                  <td>{item.tipo}</td>
                  <td>{dinheiro(item.baseCentavos, item.moeda)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {painel.indicados.length === 0 ? (
            <div className={estilos.vazio}>A casa ainda não forneceu resultados conciliáveis.</div>
          ) : null}
        </section>
      </div>
    </ShellComercial>
  )
}
