import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getDb } from '@/modules/dominio/db/cliente'
import { sessaoAtual } from '@/modules/plataforma/auth/cookies'
import { painelDoAfiliado, type PainelDoAfiliado } from '@/modules/plataforma/afiliados/servico'
import { filtroDePeriodo } from '@/modules/plataforma/afiliados/periodo'
import { EstadoVazio } from '@/ui/blocos'
import { Campo, GradeDeMetricas, Metrica, Painel, Status, Vazio } from '@/features/admin/componentes'
import { CopiarLink } from '@/features/afiliados/CopiarLink'
import { ShellComercial } from '@/features/afiliados/ShellComercial'
import { dataCurta, dinheiro } from '@/features/afiliados/formato'
import s from '@/features/admin/Admin.module.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Área de parceiro' }

export default async function PaginaAfiliado({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sessao = await sessaoAtual()
  if (!sessao) redirect('/entrar?destino=/afiliados')
  if (!process.env.DATABASE_URL) {
    return (
      <main style={{ padding: 24 }}>
        <EstadoVazio titulo="Área de parceiro" texto="Banco não configurado." />
      </main>
    )
  }

  const parametros = await searchParams
  const valor = (chave: string) => {
    const bruto = parametros[chave]
    return Array.isArray(bruto) ? bruto[0] : bruto
  }
  const inicio = valor('inicio')
  const fim = valor('fim')

  let periodo: ReturnType<typeof filtroDePeriodo> = {}
  let erroPeriodo: string | null = null
  try {
    periodo = filtroDePeriodo(inicio, fim)
  } catch {
    erroPeriodo = 'Período inválido: informe as duas datas, com o início antes do fim. Mostrando todo o período.'
  }

  let painel: PainelDoAfiliado
  try {
    painel = await painelDoAfiliado(getDb(), sessao.usuarioId, periodo)
  } catch {
    return (
      <main style={{ display: 'grid', placeItems: 'center', minHeight: '100dvh', padding: 24 }}>
        <div style={{ maxWidth: 520, width: '100%' }}>
          <EstadoVazio
            titulo="Sua conta ainda não possui uma parceria NIP ativa"
            texto="Se você recebeu um convite, abra o link enviado pela equipe NIP com esta mesma conta."
            acao={{ rotulo: 'Voltar para o app', href: '/' }}
          />
        </div>
      </main>
    )
  }

  const principal = painel.totaisPorMoeda[0] ?? { moeda: 'BRL', comissaoConfirmadaCentavos: 0, repassadoCentavos: 0 }
  const totalFinanceiro = (campo: 'comissaoConfirmadaCentavos' | 'repassadoCentavos') =>
    painel.totaisPorMoeda.length > 1
      ? `${painel.totaisPorMoeda.length} moedas`
      : dinheiro(principal[campo], principal.moeda)

  return (
    <ShellComercial nome={painel.parceiro.nomePublico}>
      <div className={s.tela}>
        <header className={s.cabecalho} id="visao-geral">
          <div>
            <p className={s.sobrancelha}>Área de parceiro</p>
            <h1 className={s.titulo}>Visão geral</h1>
            <p className={s.apoio}>Acompanhe seus links, resultados importados e repasses registrados.</p>
          </div>
          <Status valor="PRIMEIRO TOQUE · 30 DIAS" />
        </header>

        <form method="get" className={s.filtros} aria-label="Período">
          <Campo rotulo="De">
            <input type="date" name="inicio" defaultValue={inicio} />
          </Campo>
          <Campo rotulo="Até">
            <input type="date" name="fim" defaultValue={fim} />
          </Campo>
          <button className={s.botao} type="submit">
            Filtrar período
          </button>
          {inicio || fim ? (
            <Link className={s.botaoSecundario} href="/afiliados">
              Limpar
            </Link>
          ) : null}
        </form>
        {erroPeriodo && (
          <p role="alert" className={s.erro}>
            {erroPeriodo}
          </p>
        )}

        <GradeDeMetricas rotulo="Indicadores do parceiro">
          <Metrica rotulo="Cliques observados" valor={painel.totais.cliquesObservados} />
          <Metrica rotulo="Saídas para casas" valor={painel.totais.saidasParaCasa} />
          <Metrica rotulo="Comissão confirmada" valor={totalFinanceiro('comissaoConfirmadaCentavos')} />
          <Metrica rotulo="Repassado" valor={totalFinanceiro('repassadoCentavos')} destaque />
        </GradeDeMetricas>

        <div className={s.grade}>
          <Painel id="links" titulo="Meus links" apoio="Criados e administrados pela equipe NIP.">
            {painel.links.length === 0 ? (
              <Vazio>Nenhum link disponível.</Vazio>
            ) : (
              <ul className={s.lista}>
                {painel.links.map((link) => (
                  <li key={link.id}>
                    <span className={s.pilha}>
                      <span className={s.celulaPrincipal}>{link.campanha.nome}</span>
                      <span className={s.codigo}>/r/{link.codigo}</span>
                    </span>
                    <CopiarLink caminho={`/r/${link.codigo}`} />
                  </li>
                ))}
              </ul>
            )}
          </Painel>

          <Painel id="repasses" titulo="Extrato de repasses" apoio="Pagamentos externos registrados pela operação.">
            {painel.repasses.length === 0 ? (
              <Vazio>Nenhum repasse registrado.</Vazio>
            ) : (
              <ul className={s.lista}>
                {painel.repasses.map((repasse) => (
                  <li key={repasse.id}>
                    <span className={s.pilha}>
                      <span className={`${s.celulaPrincipal} num`}>{dinheiro(repasse.valorCentavos, repasse.moeda)}</span>
                      <span className={s.fraco}>
                        {dataCurta(repasse.pagoEm)} · {repasse.referenciaExterna}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Painel>

          <Painel
            id="resultados"
            largo
            titulo="Indicados e resultados"
            apoio="Somente identificadores mascarados fornecidos nos relatórios das casas."
          >
            {painel.indicados.length === 0 ? (
              <Vazio>A casa ainda não forneceu resultados conciliáveis.</Vazio>
            ) : (
              <div className={s.rolagem}>
                <table className={s.tabela}>
                  <thead>
                    <tr>
                      <th scope="col">Indicado</th>
                      <th scope="col">Data do evento</th>
                      <th scope="col">Modalidade</th>
                      <th scope="col">Base NIP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {painel.indicados.map((item, indice) => (
                      <tr key={`${item.identificador ?? 'anonimo'}-${indice}`}>
                        <td className={s.codigo}>{item.identificador ?? 'Não identificado'}</td>
                        <td className="num">{dataCurta(item.ocorridoEm)}</td>
                        <td>{item.tipo}</td>
                        <td className="num">{dinheiro(item.baseCentavos, item.moeda)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Painel>
        </div>
      </div>
    </ShellComercial>
  )
}
