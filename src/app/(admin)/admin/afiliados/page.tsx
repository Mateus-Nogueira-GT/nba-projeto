import { Fragment } from 'react'
import estilos from '@/components/afiliados/PainelComercial.module.css'
import Link from 'next/link'
import { ShellComercial } from '@/components/afiliados/ShellComercial'
import { dataCurta, dinheiro } from '@/components/afiliados/formato'
import { getDb } from '@/modules/dominio/db/cliente'
import { exigirAdmin } from '@/modules/plataforma/auth/cookies'
import { painelAdministrativo } from '@/modules/plataforma/afiliados/servico'
import { filtroDePeriodo } from '@/modules/plataforma/afiliados/periodo'
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
} from './acoes'
import { FormularioConvite } from './FormularioConvite'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Afiliados · Administração' }

export default async function PaginaAdminAfiliados({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sessao = await exigirAdmin()
  if (!sessao)
    return (
      <main className={estilos.vazio}>
        Acesso administrativo exigido. <a href="/admin/entrar">Entrar</a>
      </main>
    )
  if (!process.env.DATABASE_URL)
    return <main className={estilos.vazio}>Banco não configurado.</main>
  const parametros = await searchParams
  const valor = (chave: string) => {
    const bruto = parametros[chave]
    return Array.isArray(bruto) ? bruto[0] : bruto
  }
  const inicio = valor('inicio')
  const fim = valor('fim')
  const painel = await painelAdministrativo(getDb(), filtroDePeriodo(inicio, fim))
  const principal = painel.totaisPorMoeda[0] ?? {
    moeda: 'BRL',
    receitaNipCentavos: 0,
    parcelaParceirosCentavos: 0,
  }
  const financeiro = (campo: 'receitaNipCentavos' | 'parcelaParceirosCentavos') =>
    painel.totaisPorMoeda.length > 1
      ? `${painel.totaisPorMoeda.length} moedas`
      : dinheiro(principal[campo], principal.moeda)

  return (
    <ShellComercial area="admin" nome={sessao.email}>
      <header className={estilos.topo}>
        <div>
          <h1>Afiliados</h1>
          <p>Controle de campanhas, conciliação, recebimentos e repasses externos.</p>
        </div>
        <span className={estilos.selo}>Operação manual e auditável</span>
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
          <Link className={estilos.botaoSecundario} href="/admin/afiliados">
            Limpar
          </Link>
        ) : null}
      </form>

      <div className={estilos.gradeMetricas} aria-label="Indicadores administrativos">
        <article className={estilos.metrica}>
          <small>Cliques observados</small>
          <strong>{painel.totais.cliquesObservados}</strong>
        </article>
        <article className={estilos.metrica}>
          <small>Saídas para casas</small>
          <strong>{painel.totais.saidasParaCasa}</strong>
        </article>
        <article className={estilos.metrica}>
          <small>Receita NIP</small>
          <strong>{financeiro('receitaNipCentavos')}</strong>
        </article>
        <article className={`${estilos.metrica} ${estilos.destaque}`}>
          <small>Parcela dos parceiros</small>
          <strong>{financeiro('parcelaParceirosCentavos')}</strong>
        </article>
      </div>

      <div className={estilos.grade}>
        <section className={`${estilos.painel} ${estilos.largo}`} id="operacao">
          <h2>Configuração da operação</h2>
          <p>Comece por casa e parceiro; depois cadastre oferta, acordo e campanha.</p>
          <div className={estilos.formularios}>
            <form action={acaoCriarCasa} className={estilos.formulario}>
              <h3>Nova casa</h3>
              <label>
                Nome
                <input name="nome" required minLength={2} />
              </label>
              <button className={estilos.botao}>Cadastrar casa</button>
            </form>
            <form action={acaoCriarParceiro} className={estilos.formulario}>
              <h3>Novo parceiro</h3>
              <label>
                Nome público
                <input name="nomePublico" required />
              </label>
              <label>
                Código
                <input name="codigo" required pattern="[a-z0-9][a-z0-9-]{2,63}" />
              </label>
              <button className={estilos.botao}>Cadastrar parceiro</button>
            </form>
            <FormularioConvite />
            <form action={acaoCriarOferta} className={estilos.formulario}>
              <h3>Nova oferta</h3>
              <label>
                Casa
                <select name="casaId" required>
                  {painel.casas.map((casa) => (
                    <option key={casa.id} value={casa.id}>
                      {casa.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Nome
                <input name="nome" required />
              </label>
              <label>
                Modalidade
                <select name="modalidade">
                  <option>CPA</option>
                  <option>REVSHARE</option>
                  <option>HIBRIDO</option>
                </select>
              </label>
              <label>
                Moeda
                <input name="moeda" defaultValue="BRL" maxLength={3} required />
              </label>
              <label>
                URL HTTPS
                <input name="urlDestino" type="url" required />
              </label>
              <label>
                Host exato
                <input name="hostDestino" placeholder="ofertas.exemplo.com" required />
              </label>
              <input type="hidden" name="status" value="RASCUNHO" />
              <button className={estilos.botao} disabled={painel.casas.length === 0}>
                Criar rascunho
              </button>
            </form>
            <form action={acaoCriarAcordo} className={estilos.formulario}>
              <h3>Novo acordo</h3>
              <label>
                Parceiro
                <select name="parceiroId" required>
                  {painel.parceiros.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nomePublico}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Oferta
                <select name="ofertaId" required>
                  {painel.ofertas.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Percentual do parceiro
                <input name="percentual" type="number" min="0" max="100" step="0.01" required />
              </label>
              <label>
                Moeda do acordo
                <input name="moeda" defaultValue="BRL" maxLength={3} required />
              </label>
              <button
                className={estilos.botao}
                disabled={!painel.parceiros.length || !painel.ofertas.length}
              >
                Salvar acordo
              </button>
            </form>
            <form action={acaoCriarCampanha} className={estilos.formulario}>
              <h3>Nova campanha e link</h3>
              <label>
                Parceiro
                <select name="parceiroId" required>
                  {painel.parceiros.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nomePublico}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Oferta
                <select name="ofertaId" required>
                  {painel.ofertas.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Nome
                <input name="nome" required />
              </label>
              <label>
                Canal
                <input name="canal" placeholder="social, whatsapp…" required />
              </label>
              <label>
                Código do link
                <input name="codigo" required />
              </label>
              <label>
                Destino
                <select name="tipoDestino">
                  <option value="NIP">Página NIP</option>
                  <option value="CASA">Direto à casa</option>
                </select>
              </label>
              <button
                className={estilos.botao}
                disabled={!painel.parceiros.length || !painel.ofertas.length}
              >
                Gerar link
              </button>
            </form>
          </div>
        </section>

        <section className={`${estilos.painel} ${estilos.largo}`}>
          <h2>Casas e ofertas</h2>
          <p>Ative somente destinos e condições já homologados.</p>
          <table className={estilos.tabela}>
            <thead>
              <tr>
                <th>Oferta</th>
                <th>Casa</th>
                <th>Modalidade</th>
                <th>Moeda</th>
                <th>Acordos</th>
                <th>Status</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              {painel.ofertas.map((oferta) => (
                <tr key={oferta.id}>
                  <td>{oferta.nome}</td>
                  <td>{painel.casas.find((casa) => casa.id === oferta.casaId)?.nome ?? '—'}</td>
                  <td>{oferta.modalidade}</td>
                  <td>{oferta.moeda}</td>
                  <td>
                    {painel.acordos
                      .filter((acordo) => acordo.ofertaId === oferta.id)
                      .map((acordo) => (
                        <small key={acordo.id} className={estilos.codigo}>
                          {acordo.id} · {acordo.moeda} · {acordo.percentualPontosBase / 100}%
                        </small>
                      ))}
                  </td>
                  <td>{oferta.status}</td>
                  <td>
                    {oferta.status === 'ATIVA' ? (
                      <form action={acaoStatusOferta}>
                        <input type="hidden" name="id" value={oferta.id} />
                        <input type="hidden" name="status" value="PAUSADA" />
                        <button className={estilos.botaoSecundario}>Pausar</button>
                      </form>
                    ) : (
                      <form action={acaoStatusOferta} className={estilos.formularioCompacto}>
                        <input type="hidden" name="id" value={oferta.id} />
                        <input type="hidden" name="status" value="ATIVA" />
                        <label>
                          Registro da homologação
                          <input
                            name="motivoHomologacao"
                            minLength={10}
                            maxLength={500}
                            placeholder="URL, contrato e teste conferidos em…"
                            required
                          />
                        </label>
                        <label>
                          <input type="checkbox" name="homologado" value="sim" required />
                          Confirmo URL, contrato e teste de destino
                        </label>
                        <button className={estilos.botaoSecundario}>Ativar</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {painel.ofertas.length === 0 ? (
            <div className={estilos.vazio}>Nenhuma oferta cadastrada.</div>
          ) : null}
        </section>

        <section className={`${estilos.painel} ${estilos.largo}`} id="links">
          <h2>Parceiros e links</h2>
          <p>Pausas entram em vigor no próximo acesso ao link.</p>
          <p>
            A saída do apito (detalhe do jogador) é sempre UM link, escolhido aqui — nunca o
            primeiro ativo.
          </p>
          <form action={acaoDefinirSaidaDoApito}>
            <button className={estilos.botaoSecundario}>Nenhuma saída</button>
          </form>
          <table className={estilos.tabela}>
            <thead>
              <tr>
                <th>Parceiro</th>
                <th>Status</th>
                <th>Links</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              {painel.parceiros.map((parceiro) => {
                const campanhas = painel.campanhas.filter(
                  (campanha) => campanha.parceiroId === parceiro.id,
                )
                const links = painel.links.filter((link) =>
                  campanhas.some((campanha) => campanha.id === link.campanhaId),
                )
                return (
                  <tr key={parceiro.id}>
                    <td>
                      <strong>{parceiro.nomePublico}</strong>
                      <br />
                      <span className={estilos.codigo}>{parceiro.codigo}</span>
                    </td>
                    <td>{parceiro.status}</td>
                    <td>
                      {links.map((link) => (
                        <Fragment key={link.id}>
                          <form action={acaoStatusLink}>
                            <input type="hidden" name="id" value={link.id} />
                            <input type="hidden" name="ativo" value={String(!link.ativo)} />
                            <button className={estilos.botaoSecundario}>
                              /r/{link.codigo} · {link.ativo ? 'pausar' : 'ativar'}
                            </button>
                          </form>
                          <form action={acaoDefinirSaidaDoApito}>
                            <input type="hidden" name="linkId" value={link.id} />
                            <button className={estilos.botaoSecundario} disabled={link.saidaDoApito}>
                              {link.saidaDoApito
                                ? 'Saída do apito atual'
                                : 'Usar como saída do apito'}
                            </button>
                          </form>
                        </Fragment>
                      ))}
                    </td>
                    <td>
                      <form action={acaoStatusParceiro}>
                        <input type="hidden" name="id" value={parceiro.id} />
                        <input
                          type="hidden"
                          name="status"
                          value={parceiro.status === 'ATIVO' ? 'SUSPENSO' : 'ATIVO'}
                        />
                        <button className={estilos.botaoSecundario}>
                          {parceiro.status === 'ATIVO' ? 'Suspender' : 'Ativar'}
                        </button>
                      </form>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {painel.parceiros.length === 0 ? (
            <div className={estilos.vazio}>Nenhum parceiro cadastrado.</div>
          ) : null}
        </section>

        <section className={estilos.painel} id="resultados">
          <h2>Importar relatório</h2>
          <p>CSV com valores em centavos e datas ISO UTC.</p>
          <form action={acaoImportar} className={estilos.formulario}>
            <label>
              Oferta
              <select name="ofertaId" required>
                {painel.ofertas.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nome}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Arquivo CSV
              <input name="arquivo" type="file" accept=".csv,text/csv" required />
            </label>
            <button className={estilos.botao} disabled={!painel.ofertas.length}>
              Validar prévia
            </button>
          </form>
          <details>
            <summary>IDs recentes para conciliação manual</summary>
            <ul className={estilos.lista}>
              {painel.atribuicoes.map((atribuicao) => {
                const link = painel.links.find((item) => item.id === atribuicao.linkOrigemId)
                const parceiro = painel.parceiros.find((item) => item.id === atribuicao.parceiroId)
                return (
                  <li key={atribuicao.id} className={estilos.linha}>
                    <div>
                      <strong>{parceiro?.nomePublico ?? 'Parceiro removido'}</strong>
                      <small className={estilos.codigo}>{atribuicao.id}</small>
                      <small>
                        Link de origem: {link ? `/r/${link.codigo}` : 'indisponível'} · expira em{' '}
                        {dataCurta(atribuicao.expiraEm)}
                      </small>
                    </div>
                  </li>
                )
              })}
            </ul>
          </details>
          <ul className={estilos.lista}>
            {painel.lotes.map((lote) => (
              <li key={lote.id} className={estilos.linha}>
                <div>
                  <strong>{lote.arquivoNome}</strong>
                  <small>
                    {lote.estado} · {dataCurta(lote.criadoEm)} · {lote.resumoPrevia.validas} válidas
                    · {lote.resumoPrevia.pendentes} pendentes · {lote.resumoPrevia.duplicadas}{' '}
                    duplicadas
                  </small>
                  {lote.resumoPrevia.erros.map((erro) => (
                    <small key={erro} className={estilos.alertaInline}>
                      {erro}
                    </small>
                  ))}
                  {(lote.resumoPrevia.totaisPorMoeda ?? []).map((total) => (
                    <small key={total.moeda}>
                      {total.moeda}: base {dinheiro(total.baseCentavos, total.moeda)} · componentes{' '}
                      {dinheiro(total.componentesCentavos, total.moeda)} · diferença{' '}
                      {dinheiro(total.diferencaCentavos, total.moeda)}
                    </small>
                  ))}
                  {painel.itens
                    .filter((item) => item.loteId === lote.id)
                    .map((item) => (
                      <small key={item.id}>
                        {item.idExterno} · {item.estado}
                        {item.motivoPendencia ? ` · ${item.motivoPendencia}` : ''}
                      </small>
                    ))}
                </div>
                {lote.estado === 'PREVIA' &&
                lote.resumoPrevia.erros.length === 0 &&
                lote.resumoPrevia.pendentes === 0 &&
                lote.resumoPrevia.validas > 0 ? (
                  <form action={acaoConfirmarImportacao}>
                    <input type="hidden" name="loteId" value={lote.id} />
                    <button className={estilos.botaoSecundario}>Confirmar</button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        </section>

        <section className={estilos.painel}>
          <h2>Recebimentos</h2>
          <p>Controle interno; não inicia transferência.</p>
          <form action={acaoRecebimento} className={estilos.formulario}>
            <label>
              Casa
              <select name="casaId" required>
                {painel.casas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Moeda
              <input name="moeda" defaultValue="BRL" required />
            </label>
            <label>
              Valor em centavos
              <input name="valorCentavos" type="number" min="1" required />
            </label>
            <label>
              Referência externa
              <input name="referenciaExterna" required />
            </label>
            <button className={estilos.botao} disabled={!painel.casas.length}>
              Registrar recebimento
            </button>
          </form>
        </section>

        <section className={estilos.painel}>
          <h2>Liberar comissão</h2>
          <p>A liberação depende de decisão manual e usa o saldo líquido dos ajustes.</p>
          <form action={acaoLiberar} className={estilos.formulario}>
            <label>
              Comissão
              <select name="comissaoId" required>
                {painel.comissoes
                  .filter((c) => c.estado === 'CONFIRMADA' && !c.ajusteDeId)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {dinheiro(c.parcelaParceiroCentavos, c.moeda)} · {c.id.slice(0, 8)}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Valor em centavos
              <input name="valorCentavos" type="number" min="1" required />
            </label>
            <label>
              Motivo
              <input name="motivo" required />
            </label>
            <button className={estilos.botao} disabled={!painel.comissoes.length}>
              Liberar
            </button>
          </form>
          <form action={acaoAjustarComissao} className={estilos.formulario}>
            <h3>Ajuste posterior</h3>
            <label>
              Comissão original
              <select name="comissaoOriginalId" required>
                {painel.comissoes
                  .filter((comissao) => !comissao.ajusteDeId)
                  .map((comissao) => (
                    <option key={comissao.id} value={comissao.id}>
                      {comissao.id.slice(0, 8)} ·{' '}
                      {dinheiro(comissao.baseNipCentavos, comissao.moeda)}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Diferença da base em centavos
              <input name="baseNipCentavos" type="number" required />
            </label>
            <label>
              Motivo
              <input name="motivo" required />
            </label>
            <button className={estilos.botao} disabled={!painel.comissoes.length}>
              Registrar ajuste
            </button>
          </form>
        </section>

        <section className={estilos.painel} id="repasses">
          <h2>Registrar repasse</h2>
          <p>Pagamento já realizado fora da plataforma.</p>
          <form action={acaoRepasse} className={estilos.formulario}>
            <label>
              Parceiro
              <select name="parceiroId" required>
                {painel.parceiros.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nomePublico}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Liberação
              <select name="liberacaoId" required>
                {painel.liberacoes
                  .filter((l) => l.estado === 'ABERTA')
                  .map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.id.slice(0, 8)} · {l.valorCentavos} centavos
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Moeda
              <input name="moeda" defaultValue="BRL" required />
            </label>
            <label>
              Valor em centavos
              <input name="valorCentavos" type="number" min="1" required />
            </label>
            <label>
              Referência externa
              <input name="referenciaExterna" required />
            </label>
            <label>
              Chave privada do comprovante (opcional)
              <input name="comprovanteChave" />
            </label>
            <button
              className={estilos.botao}
              disabled={!painel.liberacoes.some((l) => l.estado === 'ABERTA')}
            >
              Registrar pagamento
            </button>
          </form>
        </section>
      </div>
    </ShellComercial>
  )
}
