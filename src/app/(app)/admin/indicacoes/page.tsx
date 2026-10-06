import Link from 'next/link'
import { asc, eq } from 'drizzle-orm'
import { getDb } from '@/modules/dominio/db/cliente'
import { parceirosAfiliados } from '@/modules/dominio/db/schema'
import { exigirAdmin } from '@/modules/plataforma/auth/cookies'
import { listarIndicacoes } from '@/modules/plataforma/afiliados/indicacoes'
import { filtroDePeriodo } from '@/modules/plataforma/afiliados/periodo'
import { dataCurta } from '@/features/afiliados/formato'
import { AcessoRestrito, BancoNaoConfigurado } from '@/features/admin/guarda'
import {
  CabecalhoAdmin,
  Campo,
  GradeDeMetricas,
  Metrica,
  Painel,
  Status,
  Vazio,
} from '@/features/admin/componentes'
import s from '@/features/admin/Admin.module.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Indicações · Painel' }

// Rótulos em português — nunca o nome interno do banco na tela (vocabulário
// homologado, contexto comum desta feature).
const NIVEL_DO_PLANO: Record<string, string> = { MVP: 'MVP', ALL_STAR: 'All Star' }
const MODALIDADE: Record<string, string> = { MENSAL: 'Mensal', TEMPORADA: 'Temporada' }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function PaginaAdminIndicacoes({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sessao = await exigirAdmin()
  if (!sessao) return <AcessoRestrito />
  if (!process.env.DATABASE_URL) return <BancoNaoConfigurado titulo="Indicações" />

  const parametros = await searchParams
  const valor = (chave: string) => {
    const bruto = parametros[chave]
    return Array.isArray(bruto) ? bruto[0] : bruto
  }

  // Valores inválidos de URL somem do filtro em silêncio — diferente do
  // formulário de período de /admin/afiliados, esta tela não tem "enviar" com
  // erro para mostrar: um marcador copiado errado não pode quebrar a lista.
  const tipoBruto = valor('tipo')
  const tipoIndicador = tipoBruto === 'parceiro' ? 'PARCEIRO' : tipoBruto === 'usuario' ? 'USUARIO' : undefined
  const parceiroBruto = valor('parceiro')
  const parceiroId = parceiroBruto && UUID.test(parceiroBruto) ? parceiroBruto : undefined
  const de = valor('de')
  const ate = valor('ate')
  let periodo: ReturnType<typeof filtroDePeriodo> = {}
  try {
    periodo = filtroDePeriodo(de, ate)
  } catch {
    periodo = {}
  }

  const db = getDb()
  const [{ totais, linhas }, parceiros] = await Promise.all([
    listarIndicacoes(db, { tipoIndicador, parceiroId, ...periodo }, new Date()),
    // Só PARCEIRO no seletor: os USUARIO são um por conta indicadora e não
    // cabem numa lista — quem quer um específico clica no nome dele numa
    // linha da tabela (link para `?parceiro=<id>`).
    db
      .select({ id: parceirosAfiliados.id, nomePublico: parceirosAfiliados.nomePublico })
      .from(parceirosAfiliados)
      .where(eq(parceirosAfiliados.tipo, 'PARCEIRO'))
      .orderBy(asc(parceirosAfiliados.nomePublico)),
  ])

  const filtroAtivo = Boolean(tipoBruto || parceiroBruto || de || ate)

  return (
    <div className={s.tela}>
      <CabecalhoAdmin
        area="indicacoes"
        titulo="Indicações"
        apoio="Quem indicou cada conta, o cadastro e a assinatura, quando houver — só rastreamento, nenhum valor em dinheiro."
      />

      <form method="get" className={s.filtros} aria-label="Filtros">
        <Campo rotulo="Tipo">
          <select name="tipo" defaultValue={tipoBruto ?? ''}>
            <option value="">Todos</option>
            <option value="parceiro">Parceiro</option>
            <option value="usuario">Usuário</option>
          </select>
        </Campo>
        <Campo rotulo="Parceiro">
          <select name="parceiro" defaultValue={parceiroId ?? ''}>
            <option value="">Todos</option>
            {/* Filtro vindo do link de um indicador USUARIO: ele não está na
                lista, mas precisa continuar selecionado para "Filtrar" não
                derrubá-lo em silêncio. */}
            {parceiroId && !parceiros.some((p) => p.id === parceiroId) ? (
              <option value={parceiroId}>{linhas[0]?.indicador.nome ?? 'Indicador selecionado'}</option>
            ) : null}
            {parceiros.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nomePublico}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="De">
          <input type="date" name="de" defaultValue={de} />
        </Campo>
        <Campo rotulo="Até">
          <input type="date" name="ate" defaultValue={ate} />
        </Campo>
        <button className={s.botao} type="submit">
          Filtrar
        </button>
        {filtroAtivo ? (
          <Link className={s.botaoSecundario} href="/admin/indicacoes">
            Limpar
          </Link>
        ) : null}
      </form>

      <GradeDeMetricas rotulo="Totais de indicação">
        <Metrica rotulo="Cadastros" valor={totais.cadastros} />
        <Metrica rotulo="Assinaturas" valor={totais.assinaturas} destaque />
      </GradeDeMetricas>

      <Painel
        titulo="Indicações"
        apoio="Uma linha por cadastro indicado; a assinatura mostrada é a primeira aprovada por essa indicação."
      >
        {linhas.length === 0 ? (
          <Vazio>Nenhuma indicação no filtro.</Vazio>
        ) : (
          <div className={s.rolagem}>
            <table className={s.tabela}>
              <thead>
                <tr>
                  <th scope="col">Indicador</th>
                  <th scope="col">Link</th>
                  <th scope="col">Indicado</th>
                  <th scope="col">Cadastrado em</th>
                  <th scope="col">Assinatura</th>
                  <th scope="col">Situação</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((linha) => (
                  <tr key={`${linha.indicador.parceiroId}-${linha.indicado.usuarioId}`}>
                    <td>
                      <span className={s.pilha}>
                        {/* O nome filtra a lista por este indicador — é o único
                            jeito de chegar a um indicador USUARIO, que não está
                            no seletor (um por conta: não cabe numa lista). */}
                        <Link
                          className={s.celulaPrincipal}
                          href={`/admin/indicacoes?parceiro=${linha.indicador.parceiroId}`}
                        >
                          {linha.indicador.nome}
                        </Link>
                        <span className={s.fraco}>{linha.indicador.tipo === 'PARCEIRO' ? 'Parceiro' : 'Usuário'}</span>
                      </span>
                    </td>
                    <td>
                      <span className={s.codigo}>/r/{linha.linkCodigo}</span>
                    </td>
                    <td>
                      <span className={s.pilha}>
                        <span className={s.celulaPrincipal}>{linha.indicado.nome ?? '—'}</span>
                        <span className={s.fraco}>{linha.indicado.email}</span>
                      </span>
                    </td>
                    <td className="num">{dataCurta(linha.cadastradoEm)}</td>
                    <td>
                      {linha.assinatura ? (
                        <span className={s.pilha}>
                          <span>{NIVEL_DO_PLANO[linha.assinatura.nivelDoPlano] ?? linha.assinatura.nivelDoPlano}</span>
                          <span className={s.fraco}>
                            {MODALIDADE[linha.assinatura.modalidade] ?? linha.assinatura.modalidade} ·{' '}
                            {dataCurta(linha.assinatura.aprovadoEm)}
                          </span>
                        </span>
                      ) : (
                        <span className={s.fraco}>Não assinou</span>
                      )}
                    </td>
                    <td>
                      <Status valor={linha.situacao} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Painel>
    </div>
  )
}
