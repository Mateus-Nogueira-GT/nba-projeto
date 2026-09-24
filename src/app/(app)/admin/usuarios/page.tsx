import { cookies } from 'next/headers'
import { getDb } from '@/modules/dominio/db/cliente'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import { dispositivosDoUsuario, listarUsuarios } from '@/modules/plataforma/admin/usuarios'
import { avisoDaTemporada, precosDosPlanos } from '@/modules/plataforma/assinatura/precos'
import { MENSAGEM_REGRA_SENHA } from '@/modules/plataforma/auth/senha'
import { Segmentado } from '@/ui/controles'
import { contar } from '@/ui/formato'
import { IconeBusca } from '@/ui/icones'
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
import { BancoNaoConfigurado, dataHoraAdmin, diaAdmin, negarSeNaoForAdmin } from '@/features/admin/guarda'
import {
  acaoAdicionar,
  acaoBloquear,
  acaoDesbloquear,
  acaoEmitirRedefinicao,
  acaoExcluir,
} from '@/features/admin/usuarios/acoes'
import { NOME_COOKIE_LINK_REDEFINICAO } from '@/features/admin/usuarios/link-redefinicao'
import s from '@/features/admin/Admin.module.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Usuários · Painel' }

type FiltroStatus = 'ATIVO' | 'BLOQUEADO' | ''

const normalizar = (t: string) =>
  t
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

export default async function PaginaUsuarios({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const negado = await negarSeNaoForAdmin()
  if (negado) return negado
  if (!process.env.DATABASE_URL) return <BancoNaoConfigurado titulo="Usuários" />

  const p = await searchParams
  const texto = (v: string | string[] | undefined) => ((Array.isArray(v) ? v[0] : v) ?? '').trim()
  const busca = texto(p.busca)
  const statusBruto = texto(p.status)
  const status: FiltroStatus = statusBruto === 'ATIVO' || statusBruto === 'BLOQUEADO' ? statusBruto : ''

  // O link só existe aqui: a ação o entrega por um cookie httpOnly de 2 minutos
  // (nunca pela querystring, que vaza em log e Referer).
  const linkRedefinicao = (await cookies()).get(NOME_COOKIE_LINK_REDEFINICAO)?.value

  // "Ninguém vai lembrar de mudar em junho." Então o painel lembra. A leitura
  // não pode derrubar a tela se o env estiver incompleto.
  let avisoTemporada: string | null = null
  try {
    const { fuso } = (await rulesetAtivo()).rodada
    avisoTemporada = avisoDaTemporada(precosDosPlanos(fuso)?.fimDaTemporada ?? null, new Date())
  } catch {
    avisoTemporada = null
  }

  const db = getDb()
  const todas = await listarUsuarios(db, { busca: busca || undefined, status: status || undefined })
  // O filtro também é aplicado aqui: a fachada atual ignora `busca` e `status`
  // (lê um campo `termo`), e a tela não pode mostrar o que o admin excluiu.
  // Com o back real filtrando, esta passada não muda nada.
  const termo = normalizar(busca)
  const linhas = todas.filter(
    (u) =>
      (!status || u.status === status) &&
      (!termo || normalizar(`${u.email} ${u.nome ?? ''}`).includes(termo)),
  )

  const dispositivosPorUsuario = new Map(
    await Promise.all(linhas.map(async (u) => [u.id, await dispositivosDoUsuario(db, u.id)] as const)),
  )

  const ativos = todas.filter((u) => u.status === 'ATIVO').length
  const bloqueados = todas.filter((u) => u.status === 'BLOQUEADO').length
  const assinantes = todas.filter((u) => u.direitoAtivo).length

  const hrefStatus = (st: FiltroStatus) => {
    const q = new URLSearchParams()
    if (busca) q.set('busca', busca)
    if (st) q.set('status', st)
    const qs = q.toString()
    return qs ? `/admin/usuarios?${qs}` : '/admin/usuarios'
  }

  return (
    <div className={s.tela}>
      <CabecalhoAdmin
        area="usuarios"
        titulo="Usuários"
        apoio="Contas, assinatura, aparelhos e acesso. Bloquear encerra o acesso; o link de redefinição é entregue só a você."
      />

      {avisoTemporada && <Aviso tom="atencao">{avisoTemporada}</Aviso>}
      {linkRedefinicao && (
        <Aviso>
          Link de redefinição (válido por 1 hora, uso único): <code>{linkRedefinicao}</code>
        </Aviso>
      )}

      <GradeDeMetricas rotulo="Resumo das contas">
        <Metrica rotulo="Contas" valor={todas.length} />
        <Metrica rotulo="Ativas" valor={ativos} />
        <Metrica rotulo="Bloqueadas" valor={bloqueados} />
        <Metrica rotulo="Com direito ativo" valor={assinantes} destaque />
      </GradeDeMetricas>

      <Painel
        titulo="Contas"
        apoio={contar(linhas.length, 'conta')}
        largo
        acao={
          <Segmentado
            rotulo="Status"
            compacto
            opcoes={[
              { valor: 'todos', rotulo: 'Todas', href: hrefStatus(''), ativo: status === '' },
              { valor: 'ativos', rotulo: 'Ativas', href: hrefStatus('ATIVO'), ativo: status === 'ATIVO' },
              { valor: 'bloq', rotulo: 'Bloqueadas', href: hrefStatus('BLOQUEADO'), ativo: status === 'BLOQUEADO' },
            ]}
          />
        }
      >
        <form method="get" className={s.linhaCampos} role="search">
          {status && <input type="hidden" name="status" value={status} />}
          <Campo rotulo="Buscar por e-mail ou nome">
            <input name="busca" type="search" defaultValue={busca} placeholder="ex.: maria@…" />
          </Campo>
          <button type="submit" className={s.botao}>
            <IconeBusca tamanho={18} /> Buscar
          </button>
        </form>

        {linhas.length === 0 ? (
          <Vazio>Nenhuma conta com esse filtro.</Vazio>
        ) : (
          <div className={s.rolagem}>
            <table className={s.tabela}>
              <thead>
                <tr>
                  <th scope="col">Conta</th>
                  <th scope="col">Status</th>
                  <th scope="col">Assinatura</th>
                  <th scope="col">Aparelhos</th>
                  <th scope="col">Último acesso</th>
                  <th scope="col">Ações</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <span className={s.pilha}>
                        <span className={s.celulaPrincipal}>
                          {u.email}
                          {u.papel === 'ADMIN' && <span className={s.papel}>ADMIN</span>}
                        </span>
                        {u.nome && <span className={s.fraco}>{u.nome}</span>}
                      </span>
                    </td>
                    <td>
                      <Status valor={u.status} />
                    </td>
                    <td>
                      <span className={s.pilha}>
                        <span>{u.assinaturaStatus ?? '—'}</span>
                        <span className={s.fraco}>direito: {u.direitoAtivo ? 'ativo' : 'inativo'}</span>
                        {u.proximaCobranca && (
                          <span className={s.fraco}>próxima: {diaAdmin(u.proximaCobranca)}</span>
                        )}
                      </span>
                    </td>
                    <td>
                      <span className={s.pilha}>
                        <span className="num">{u.dispositivosAtivos}/2 ativos</span>
                        {(dispositivosPorUsuario.get(u.id) ?? []).map((d) => (
                          <span key={d.id} className={s.fraco}>
                            {d.tipo === 'MOBILE' ? 'Celular' : 'Computador'} · {d.ipUltimo ?? 'sem IP'}
                            {d.temSessaoAtiva ? ' · sessão aberta' : ''}
                          </span>
                        ))}
                      </span>
                    </td>
                    <td className="num">{u.ultimoAcesso ? dataHoraAdmin(u.ultimoAcesso) : 'nunca'}</td>
                    <td>
                      <div className={s.acoesLinha}>
                        {u.status === 'ATIVO' ? (
                          <FormAcao acao={acaoBloquear} compacto rotulo={`Bloquear ${u.email}`}>
                            <input type="hidden" name="id" value={u.id} />
                            <button type="submit" className={s.botaoSecundario}>
                              Bloquear
                            </button>
                          </FormAcao>
                        ) : (
                          <FormAcao acao={acaoDesbloquear} compacto rotulo={`Desbloquear ${u.email}`}>
                            <input type="hidden" name="id" value={u.id} />
                            <button type="submit" className={s.botaoSecundario}>
                              Desbloquear
                            </button>
                          </FormAcao>
                        )}
                        <FormAcao acao={acaoEmitirRedefinicao} compacto rotulo={`Link de redefinição de ${u.email}`}>
                          <input type="hidden" name="usuarioId" value={u.id} />
                          <button type="submit" className={s.botaoSecundario}>
                            Link de redefinição
                          </button>
                        </FormAcao>
                        {/* Excluir é irreversível: pede um segundo clique, sem diálogo do navegador. */}
                        <details className={s.confirmar}>
                          <summary className={s.botaoPerigo}>Excluir</summary>
                          <div className={s.confirmarCaixa}>
                            <span>Excluir {u.email}? Não dá para desfazer.</span>
                            <FormAcao acao={acaoExcluir} compacto rotulo={`Confirmar exclusão de ${u.email}`}>
                              <input type="hidden" name="id" value={u.id} />
                              <button type="submit" className={s.botaoPerigo}>
                                Sim, excluir
                              </button>
                            </FormAcao>
                          </div>
                        </details>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Painel>

      <Painel titulo="Adicionar manualmente" apoio="A conta nasce ativa, sem assinatura." largo>
        <FormAcao acao={acaoAdicionar} rotulo="Adicionar conta">
          <div className={s.linhaCampos}>
            <Campo rotulo="E-mail">
              <input name="email" type="email" required autoComplete="off" />
            </Campo>
            <Campo rotulo="Nome (opcional)">
              <input name="nome" autoComplete="off" />
            </Campo>
            <Campo rotulo="Senha" dica={MENSAGEM_REGRA_SENHA}>
              <input name="senha" type="password" minLength={10} required autoComplete="new-password" />
            </Campo>
          </div>
          <div>
            <button type="submit" className={s.botao}>
              Adicionar conta
            </button>
          </div>
        </FormAcao>
      </Painel>
    </div>
  )
}
