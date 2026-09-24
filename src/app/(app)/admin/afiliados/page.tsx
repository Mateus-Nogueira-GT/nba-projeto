import Link from 'next/link'
import { getDb } from '@/modules/dominio/db/cliente'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import { exigirAdmin } from '@/modules/plataforma/auth/cookies'
import { painelAdministrativo, type PainelAdministrativo } from '@/modules/plataforma/afiliados/servico'
import { filtroDePeriodo } from '@/modules/plataforma/afiliados/periodo'
import { Chip } from '@/ui/controles'
import {
  AcessoRestrito,
  BancoNaoConfigurado,
} from '@/features/admin/guarda'
import {
  Aviso,
  CabecalhoAdmin,
  Campo,
  GradeDeMetricas,
  Metrica,
  Painel,
  Status,
  Vazio,
} from '@/features/admin/componentes'
import { FormAcao } from '@/features/admin/FormAcao'
import { FormularioConvite } from '@/features/admin/afiliados/FormularioConvite'
import {
  acaoAjustarComissao,
  acaoConfirmarImportacao,
  acaoCriarAcordo,
  acaoCriarCampanha,
  acaoCriarCasa,
  acaoCriarOferta,
  acaoCriarParceiro,
  acaoDefinirSaidaDoApito,
  acaoImportar,
  acaoLiberar,
  acaoRecebimento,
  acaoRepasse,
  acaoStatusLink,
  acaoStatusOferta,
  acaoStatusParceiro,
} from '@/features/admin/afiliados/acoes'
import { dataCurta, dataHoraCurta, dinheiro } from '@/features/afiliados/formato'
import s from '@/features/admin/Admin.module.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Afiliados · Painel' }

type TotalDoLote = { moeda: string; baseCentavos: number; componentesCentavos: number; diferencaCentavos: number }

function Opcoes<T extends { id: string }>({ itens, rotulo }: { itens: T[]; rotulo: (item: T) => string }) {
  return (
    <>
      {itens.map((item) => (
        <option key={item.id} value={item.id}>
          {rotulo(item)}
        </option>
      ))}
    </>
  )
}

export default async function PaginaAdminAfiliados({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sessao = await exigirAdmin()
  if (!sessao) return <AcessoRestrito />
  if (!process.env.DATABASE_URL) return <BancoNaoConfigurado titulo="Afiliados" />

  const parametros = await searchParams
  const valor = (chave: string) => {
    const bruto = parametros[chave]
    return Array.isArray(bruto) ? bruto[0] : bruto
  }
  const inicio = valor('inicio')
  const fim = valor('fim')

  // Período inválido (fim antes do início, só uma ponta) não derruba a tela:
  // avisa e mostra o período inteiro.
  let periodo: ReturnType<typeof filtroDePeriodo> = {}
  let erroPeriodo: string | null = null
  try {
    periodo = filtroDePeriodo(inicio, fim)
  } catch {
    erroPeriodo = 'Período inválido: informe as duas datas, com o início antes do fim. Mostrando todo o período.'
  }

  // O fuso do casamento da trilha é o da RODADA, não o comercial de
  // `periodo.ts`: `entradas_realizadas.data_referencia` é escrita pela gestão
  // com `ruleset.rodada.fuso`.
  const ruleset = await rulesetAtivo()
  const painel: PainelAdministrativo = await painelAdministrativo(getDb(), periodo, { fuso: ruleset.rodada.fuso })

  const principal = painel.totaisPorMoeda[0] ?? { moeda: 'BRL', receitaNipCentavos: 0, parcelaParceirosCentavos: 0 }
  const financeiro = (campo: 'receitaNipCentavos' | 'parcelaParceirosCentavos') =>
    painel.totaisPorMoeda.length > 1
      ? `${painel.totaisPorMoeda.length} moedas`
      : dinheiro(principal[campo], principal.moeda)

  const nomeDaCasa = (id: string) => painel.casas.find((c) => c.id === id)?.nome ?? '—'
  const semParceiroOuOferta = !painel.parceiros.length || !painel.ofertas.length
  const liberacoesAbertas = painel.liberacoes.filter((l) => l.estado === 'ABERTA')

  return (
    <div className={s.tela}>
      <CabecalhoAdmin
        area="afiliados"
        titulo="Afiliados"
        apoio="Controle de campanhas, conciliação, recebimentos e repasses externos. Operação manual e auditável: nenhuma transferência é iniciada pela plataforma."
        acao={
          <Link className={s.botaoSecundario} href="/afiliados">
            Ver como parceiro
          </Link>
        }
      />

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
          <Link className={s.botaoSecundario} href="/admin/afiliados">
            Limpar
          </Link>
        ) : null}
      </form>
      {erroPeriodo && (
        <p role="alert" className={s.erro}>
          {erroPeriodo}
        </p>
      )}

      <nav className={s.ancoras} aria-label="Seções da página">
        <Chip href="#operacao">Configuração</Chip>
        <Chip href="#ofertas">Casas e ofertas</Chip>
        <Chip href="#links">Parceiros e links</Chip>
        <Chip href="#resultados">Importação</Chip>
        <Chip href="#financeiro">Recebimentos e repasses</Chip>
        <Chip href="#trilha">Trilha de saídas</Chip>
      </nav>

      <GradeDeMetricas rotulo="Indicadores administrativos">
        <Metrica rotulo="Cliques observados" valor={painel.totais.cliquesObservados} />
        <Metrica rotulo="Saídas para casas" valor={painel.totais.saidasParaCasa} />
        <Metrica rotulo="Receita NIP" valor={financeiro('receitaNipCentavos')} />
        <Metrica rotulo="Parcela dos parceiros" valor={financeiro('parcelaParceirosCentavos')} destaque />
      </GradeDeMetricas>

      <div className={s.grade}>
        <Painel
          id="operacao"
          largo
          titulo="Configuração da operação"
          apoio="Comece por casa e parceiro; depois cadastre oferta, acordo e campanha."
        >
          <div className={s.formularios}>
            <FormAcao acao={acaoCriarCasa} className={`${s.formulario} ${s.cartaoForm}`} rotulo="Nova casa">
              <h3 className={s.subtitulo}>Nova casa</h3>
              <Campo rotulo="Nome">
                <input name="nome" required minLength={2} />
              </Campo>
              <div>
                <button className={s.botao}>Cadastrar casa</button>
              </div>
            </FormAcao>

            <FormAcao acao={acaoCriarParceiro} className={`${s.formulario} ${s.cartaoForm}`} rotulo="Novo parceiro">
              <h3 className={s.subtitulo}>Novo parceiro</h3>
              <Campo rotulo="Nome público">
                <input name="nomePublico" required />
              </Campo>
              <Campo rotulo="Código" dica="Minúsculas, números e hífen; 3 a 64 caracteres.">
                <input name="codigo" required pattern="[a-z0-9][a-z0-9-]{2,63}" />
              </Campo>
              <div>
                <button className={s.botao}>Cadastrar parceiro</button>
              </div>
            </FormAcao>

            <FormularioConvite />

            <FormAcao acao={acaoCriarOferta} className={`${s.formulario} ${s.cartaoForm}`} rotulo="Nova oferta">
              <h3 className={s.subtitulo}>Nova oferta</h3>
              <Campo rotulo="Casa">
                <select name="casaId" required>
                  <Opcoes itens={painel.casas} rotulo={(c) => c.nome} />
                </select>
              </Campo>
              <Campo rotulo="Nome">
                <input name="nome" required />
              </Campo>
              <Campo rotulo="Modalidade">
                <select name="modalidade">
                  <option>CPA</option>
                  <option>REVSHARE</option>
                  <option>HIBRIDO</option>
                </select>
              </Campo>
              <Campo rotulo="Moeda">
                <input name="moeda" defaultValue="BRL" maxLength={3} required />
              </Campo>
              <Campo rotulo="URL HTTPS">
                <input name="urlDestino" type="url" required />
              </Campo>
              <Campo rotulo="Host exato">
                <input name="hostDestino" placeholder="ofertas.exemplo.com" required />
              </Campo>
              <input type="hidden" name="status" value="RASCUNHO" />
              <div>
                <button className={s.botao} disabled={painel.casas.length === 0}>
                  Criar rascunho
                </button>
              </div>
            </FormAcao>

            <FormAcao acao={acaoCriarAcordo} className={`${s.formulario} ${s.cartaoForm}`} rotulo="Novo acordo">
              <h3 className={s.subtitulo}>Novo acordo</h3>
              <Campo rotulo="Parceiro">
                <select name="parceiroId" required>
                  <Opcoes itens={painel.parceiros} rotulo={(p) => p.nomePublico} />
                </select>
              </Campo>
              <Campo rotulo="Oferta">
                <select name="ofertaId" required>
                  <Opcoes itens={painel.ofertas} rotulo={(o) => o.nome} />
                </select>
              </Campo>
              <Campo rotulo="Percentual do parceiro">
                <input name="percentual" type="number" min="0" max="100" step="0.01" required />
              </Campo>
              <Campo rotulo="Moeda do acordo">
                <input name="moeda" defaultValue="BRL" maxLength={3} required />
              </Campo>
              <div>
                <button className={s.botao} disabled={semParceiroOuOferta}>
                  Salvar acordo
                </button>
              </div>
            </FormAcao>

            <FormAcao acao={acaoCriarCampanha} className={`${s.formulario} ${s.cartaoForm}`} rotulo="Nova campanha e link">
              <h3 className={s.subtitulo}>Nova campanha e link</h3>
              <Campo rotulo="Parceiro">
                <select name="parceiroId" required>
                  <Opcoes itens={painel.parceiros} rotulo={(p) => p.nomePublico} />
                </select>
              </Campo>
              <Campo rotulo="Oferta">
                <select name="ofertaId" required>
                  <Opcoes itens={painel.ofertas} rotulo={(o) => o.nome} />
                </select>
              </Campo>
              <Campo rotulo="Nome">
                <input name="nome" required />
              </Campo>
              <Campo rotulo="Canal">
                <input name="canal" placeholder="social, whatsapp…" required />
              </Campo>
              <Campo rotulo="Código do link" dica="Vira /r/<código>.">
                <input name="codigo" required />
              </Campo>
              <Campo rotulo="Destino">
                <select name="tipoDestino">
                  <option value="NIP">Página NIP</option>
                  <option value="CASA">Direto à casa</option>
                </select>
              </Campo>
              <div>
                <button className={s.botao} disabled={semParceiroOuOferta}>
                  Gerar link
                </button>
              </div>
            </FormAcao>
          </div>
        </Painel>

        <Painel id="ofertas" largo titulo="Casas e ofertas" apoio="Ative somente destinos e condições já homologados.">
          {painel.ofertas.length === 0 ? (
            <Vazio>Nenhuma oferta cadastrada.</Vazio>
          ) : (
            <div className={s.rolagem}>
              <table className={s.tabela}>
                <thead>
                  <tr>
                    <th scope="col">Oferta</th>
                    <th scope="col">Casa</th>
                    <th scope="col">Modalidade</th>
                    <th scope="col">Moeda</th>
                    <th scope="col">Acordos</th>
                    <th scope="col">Status</th>
                    <th scope="col">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {painel.ofertas.map((oferta) => (
                    <tr key={oferta.id}>
                      <td className={s.celulaPrincipal}>{oferta.nome}</td>
                      <td>{nomeDaCasa(oferta.casaId)}</td>
                      <td>{oferta.modalidade}</td>
                      <td>{oferta.moeda}</td>
                      <td>
                        <span className={s.pilha}>
                          {painel.acordos
                            .filter((acordo) => acordo.ofertaId === oferta.id)
                            .map((acordo) => (
                              <span key={acordo.id} className={s.codigo}>
                                {acordo.id.slice(0, 8)} · {acordo.moeda} · {acordo.percentualPontosBase / 100}%
                              </span>
                            ))}
                        </span>
                      </td>
                      <td>
                        <Status valor={oferta.status} />
                      </td>
                      <td>
                        {oferta.status === 'ATIVA' ? (
                          <FormAcao acao={acaoStatusOferta} compacto rotulo={`Pausar ${oferta.nome}`}>
                            <input type="hidden" name="id" value={oferta.id} />
                            <input type="hidden" name="status" value="PAUSADA" />
                            <button className={s.botaoSecundario}>Pausar</button>
                          </FormAcao>
                        ) : (
                          <details className={s.detalhes}>
                            <summary>Ativar oferta…</summary>
                            <FormAcao acao={acaoStatusOferta} rotulo={`Ativar ${oferta.nome}`}>
                              <input type="hidden" name="id" value={oferta.id} />
                              <input type="hidden" name="status" value="ATIVA" />
                              <Campo rotulo="Registro da homologação" dica="10 a 500 caracteres.">
                                <input
                                  name="motivoHomologacao"
                                  minLength={10}
                                  maxLength={500}
                                  placeholder="URL, contrato e teste conferidos em…"
                                  required
                                />
                              </Campo>
                              <label className={s.checagem}>
                                <input type="checkbox" name="homologado" value="sim" required />
                                Confirmo URL, contrato e teste de destino
                              </label>
                              <div>
                                <button className={s.botao}>Ativar</button>
                              </div>
                            </FormAcao>
                          </details>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Painel>

        <Painel
          id="links"
          largo
          titulo="Parceiros e links"
          apoio="Pausas entram em vigor no próximo acesso ao link. A saída do apito (detalhe do jogador) é sempre UM link, escolhido aqui — nunca o primeiro ativo."
          acao={
            <FormAcao acao={acaoDefinirSaidaDoApito} compacto rotulo="Remover saída do apito">
              <button className={s.botaoSecundario}>Nenhuma saída</button>
            </FormAcao>
          }
        >
          {painel.parceiros.length === 0 ? (
            <Vazio>Nenhum parceiro cadastrado.</Vazio>
          ) : (
            <div className={s.rolagem}>
              <table className={s.tabela}>
                <thead>
                  <tr>
                    <th scope="col">Parceiro</th>
                    <th scope="col">Status</th>
                    <th scope="col">Links</th>
                    <th scope="col">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {painel.parceiros.map((parceiro) => {
                    const campanhas = painel.campanhas.filter((c) => c.parceiroId === parceiro.id)
                    const links = painel.links.filter((link) => campanhas.some((c) => c.id === link.campanhaId))
                    return (
                      <tr key={parceiro.id}>
                        <td>
                          <span className={s.pilha}>
                            <span className={s.celulaPrincipal}>{parceiro.nomePublico}</span>
                            <span className={s.codigo}>{parceiro.codigo}</span>
                          </span>
                        </td>
                        <td>
                          <Status valor={parceiro.status} />
                        </td>
                        <td>
                          <div className={s.pilha} style={{ gap: 8 }}>
                            {links.length === 0 && <span className={s.fraco}>Sem links</span>}
                            {links.map((link) => (
                              <div key={link.id} className={s.acoesLinha} style={{ alignItems: 'center' }}>
                                <span className={s.codigo}>/r/{link.codigo}</span>
                                <Status valor={link.ativo ? 'ATIVO' : 'PAUSADO'} />
                                <FormAcao acao={acaoStatusLink} compacto rotulo={`${link.ativo ? 'Pausar' : 'Ativar'} /r/${link.codigo}`}>
                                  <input type="hidden" name="id" value={link.id} />
                                  <input type="hidden" name="ativo" value={String(!link.ativo)} />
                                  <button className={s.botaoSecundario}>{link.ativo ? 'Pausar' : 'Ativar'}</button>
                                </FormAcao>
                                <FormAcao acao={acaoDefinirSaidaDoApito} compacto rotulo={`Saída do apito: /r/${link.codigo}`}>
                                  <input type="hidden" name="linkId" value={link.id} />
                                  <button className={s.botaoSecundario} disabled={link.saidaDoApito}>
                                    {link.saidaDoApito ? 'Saída do apito atual' : 'Usar como saída do apito'}
                                  </button>
                                </FormAcao>
                              </div>
                            ))}
                          </div>
                        </td>
                        <td>
                          <FormAcao acao={acaoStatusParceiro} compacto rotulo={`Status de ${parceiro.nomePublico}`}>
                            <input type="hidden" name="id" value={parceiro.id} />
                            <input type="hidden" name="status" value={parceiro.status === 'ATIVO' ? 'SUSPENSO' : 'ATIVO'} />
                            {parceiro.status === 'ATIVO' ? (
                              <button className={s.botaoPerigo}>Suspender</button>
                            ) : (
                              <button className={s.botaoSecundario}>Ativar</button>
                            )}
                          </FormAcao>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Painel>

        <Painel id="resultados" titulo="Importar relatório" apoio="CSV com valores em centavos e datas ISO UTC. Prévia e confirmação são passos separados.">
          <FormAcao acao={acaoImportar} rotulo="Importar relatório">
            <Campo rotulo="Oferta">
              <select name="ofertaId" required>
                <Opcoes itens={painel.ofertas} rotulo={(o) => o.nome} />
              </select>
            </Campo>
            <Campo rotulo="Arquivo CSV" dica="Até 1 MB.">
              <input name="arquivo" type="file" accept=".csv,text/csv" required />
            </Campo>
            <div>
              <button className={s.botao} disabled={!painel.ofertas.length}>
                Validar prévia
              </button>
            </div>
          </FormAcao>

          <details className={s.detalhes}>
            <summary>IDs recentes para conciliação manual ({painel.atribuicoes.length})</summary>
            {painel.atribuicoes.length === 0 ? (
              <Vazio>Nenhuma atribuição no período.</Vazio>
            ) : (
              <ul className={s.lista}>
                {painel.atribuicoes.map((atribuicao) => {
                  const link = painel.links.find((item) => item.id === atribuicao.linkOrigemId)
                  const parceiro = painel.parceiros.find((item) => item.id === atribuicao.parceiroId)
                  return (
                    <li key={atribuicao.id}>
                      <span className={s.pilha}>
                        <span className={s.celulaPrincipal}>{parceiro?.nomePublico ?? 'Parceiro removido'}</span>
                        <span className={s.codigo}>{atribuicao.id}</span>
                        <span className={s.fraco}>
                          Link de origem: {link ? `/r/${link.codigo}` : 'indisponível'} · expira em{' '}
                          {dataCurta(atribuicao.expiraEm)}
                        </span>
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </details>

          {painel.lotes.length > 0 && (
            <ul className={s.lista}>
              {painel.lotes.map((lote) => (
                <li key={lote.id}>
                  <span className={s.pilha}>
                    <span className={s.celulaPrincipal}>{lote.arquivoNome}</span>
                    <span className={s.fraco}>
                      {lote.estado} · {dataCurta(lote.criadoEm)} · {lote.resumoPrevia.validas} válidas ·{' '}
                      {lote.resumoPrevia.pendentes} pendentes · {lote.resumoPrevia.duplicadas} duplicadas
                    </span>
                    {lote.resumoPrevia.erros.map((erro: string) => (
                      <span key={erro} className={s.erro}>
                        {erro}
                      </span>
                    ))}
                    {(lote.resumoPrevia.totaisPorMoeda ?? []).map((total: TotalDoLote) => (
                      <span key={total.moeda} className={s.fraco}>
                        {total.moeda}: base {dinheiro(total.baseCentavos, total.moeda)} · componentes{' '}
                        {dinheiro(total.componentesCentavos, total.moeda)} · diferença{' '}
                        {dinheiro(total.diferencaCentavos, total.moeda)}
                      </span>
                    ))}
                    {painel.itens
                      .filter((item) => item.loteId === lote.id)
                      .map((item) => (
                        <span key={item.id} className={s.fraco}>
                          {item.idExterno} · {item.estado}
                          {item.motivoPendencia ? ` · ${item.motivoPendencia}` : ''}
                        </span>
                      ))}
                  </span>
                  {lote.estado === 'PREVIA' &&
                  lote.resumoPrevia.erros.length === 0 &&
                  lote.resumoPrevia.pendentes === 0 &&
                  lote.resumoPrevia.validas > 0 ? (
                    <FormAcao acao={acaoConfirmarImportacao} compacto rotulo={`Confirmar ${lote.arquivoNome}`}>
                      <input type="hidden" name="loteId" value={lote.id} />
                      <button className={s.botaoSecundario}>Confirmar</button>
                    </FormAcao>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Painel>

        <Painel titulo="Recebimentos" apoio="Controle interno; não inicia transferência.">
          <FormAcao acao={acaoRecebimento} rotulo="Registrar recebimento">
            <Campo rotulo="Casa">
              <select name="casaId" required>
                <Opcoes itens={painel.casas} rotulo={(c) => c.nome} />
              </select>
            </Campo>
            <div className={s.linhaCampos}>
              <Campo rotulo="Moeda">
                <input name="moeda" defaultValue="BRL" required />
              </Campo>
              <Campo rotulo="Valor em centavos">
                <input name="valorCentavos" type="number" min="1" required />
              </Campo>
            </div>
            <Campo rotulo="Referência externa">
              <input name="referenciaExterna" required />
            </Campo>
            <div>
              <button className={s.botao} disabled={!painel.casas.length}>
                Registrar recebimento
              </button>
            </div>
          </FormAcao>
        </Painel>

        <Painel id="financeiro" titulo="Liberar comissão" apoio="A liberação depende de decisão manual e usa o saldo líquido dos ajustes.">
          <FormAcao acao={acaoLiberar} rotulo="Liberar comissão">
            <Campo rotulo="Comissão">
              <select name="comissaoId" required>
                {painel.comissoes
                  .filter((c) => c.estado === 'CONFIRMADA' && !c.ajusteDeId)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {dinheiro(c.parcelaParceiroCentavos, c.moeda)} · {String(c.id).slice(0, 8)}
                    </option>
                  ))}
              </select>
            </Campo>
            <Campo rotulo="Valor em centavos">
              <input name="valorCentavos" type="number" min="1" required />
            </Campo>
            <Campo rotulo="Motivo">
              <input name="motivo" required />
            </Campo>
            <div>
              <button className={s.botao} disabled={!painel.comissoes.length}>
                Liberar
              </button>
            </div>
          </FormAcao>
          <FormAcao acao={acaoAjustarComissao} className={`${s.formulario} ${s.cartaoForm}`} rotulo="Ajuste posterior">
            <h3 className={s.subtitulo}>Ajuste posterior</h3>
            <Campo rotulo="Comissão original">
              <select name="comissaoOriginalId" required>
                {painel.comissoes
                  .filter((c) => !c.ajusteDeId)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {String(c.id).slice(0, 8)} · {dinheiro(c.baseNipCentavos, c.moeda)}
                    </option>
                  ))}
              </select>
            </Campo>
            <Campo rotulo="Diferença da base em centavos" dica="Negativo para estorno; nunca zero.">
              <input name="baseNipCentavos" type="number" required />
            </Campo>
            <Campo rotulo="Motivo">
              <input name="motivo" required />
            </Campo>
            <div>
              <button className={s.botao} disabled={!painel.comissoes.length}>
                Registrar ajuste
              </button>
            </div>
          </FormAcao>
        </Painel>

        <Painel id="repasses" titulo="Registrar repasse" apoio="Pagamento já realizado fora da plataforma.">
          <FormAcao acao={acaoRepasse} rotulo="Registrar repasse">
            <Campo rotulo="Parceiro">
              <select name="parceiroId" required>
                <Opcoes itens={painel.parceiros} rotulo={(p) => p.nomePublico} />
              </select>
            </Campo>
            <Campo rotulo="Liberação">
              <select name="liberacaoId" required>
                {liberacoesAbertas.map((l) => (
                  <option key={l.id} value={l.id}>
                    {String(l.id).slice(0, 8)} · {l.valorCentavos} centavos
                  </option>
                ))}
              </select>
            </Campo>
            <div className={s.linhaCampos}>
              <Campo rotulo="Moeda">
                <input name="moeda" defaultValue="BRL" required />
              </Campo>
              <Campo rotulo="Valor em centavos">
                <input name="valorCentavos" type="number" min="1" required />
              </Campo>
            </div>
            <Campo rotulo="Referência externa">
              <input name="referenciaExterna" required />
            </Campo>
            <Campo rotulo="Chave privada do comprovante (opcional)">
              <input name="comprovanteChave" />
            </Campo>
            <div>
              <button className={s.botao} disabled={liberacoesAbertas.length === 0}>
                Registrar pagamento
              </button>
            </div>
          </FormAcao>
          {liberacoesAbertas.length === 0 && <Aviso>Nenhuma liberação aberta: libere uma comissão antes do repasse.</Aviso>}
        </Painel>

        <Painel
          id="trilha"
          largo
          titulo="Trilha de saídas"
          apoio={
            <>
              Saídas para casas parceiras e o que o usuário declarou ter apostado depois. Declaração do usuário,
              não confirmação da casa: não gera comissão. &quot;Não&quot; também cobre a saída que não tem como
              casar — visitante sem conta, ou apito de Fire Live, que não tem linha.
            </>
          }
        >
          {painel.trilha.length === 0 ? (
            <Vazio>Nenhuma saída no período.</Vazio>
          ) : (
            <div className={s.rolagem}>
              <table className={s.tabela}>
                <thead>
                  <tr>
                    <th scope="col">Quando</th>
                    <th scope="col">Parceiro · campanha</th>
                    <th scope="col">Casa</th>
                    <th scope="col">Apito de origem</th>
                    <th scope="col">Declarou ter apostado</th>
                  </tr>
                </thead>
                <tbody>
                  {painel.trilha.map((saida) => (
                    <tr key={saida.id}>
                      <td className="num">{dataHoraCurta(saida.ocorridoEm)}</td>
                      <td>
                        {saida.parceiro} · {saida.campanha}
                      </td>
                      <td>{saida.casa}</td>
                      <td>
                        {saida.origem
                          ? `${saida.origem.nome} · ${saida.origem.atributo}${saida.origem.linha === null ? '' : ` ${saida.origem.linha}`}`
                          : '—'}
                      </td>
                      <td>{saida.registrou ? 'Sim' : 'Não'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Painel>
      </div>
    </div>
  )
}
