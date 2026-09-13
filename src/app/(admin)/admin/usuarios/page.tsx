import { cookies } from 'next/headers'
import { getDb } from '@/modules/dominio/db/cliente'
import { exigirAdmin } from '@/modules/plataforma/auth/cookies'
import { dispositivosDoUsuario, listarUsuarios } from '@/modules/plataforma/admin/usuarios'
import {
  acaoAdicionar,
  acaoBloquear,
  acaoDesbloquear,
  acaoEmitirRedefinicao,
  acaoExcluir,
} from './acoes'
import { NOME_COOKIE_LINK_REDEFINICAO } from './link-redefinicao'
import { dataHora, diaCompleto } from '@/components/formato'

// O painel admin é operado do Brasil e não passa pelo ruleset — o fuso aqui é
// só apresentação, não decide a que rodada nada pertence.
const FUSO_ADMIN = 'America/Sao_Paulo'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Usuários · Painel' }

const celula = { padding: '8px 10px', borderTop: '1px solid #ddd', fontSize: 13 } as const

export default async function PaginaUsuarios({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  if (!process.env.DATABASE_URL) {
    return <main style={{ padding: 24, fontFamily: 'system-ui' }}>Banco não configurado.</main>
  }

  if (!(await exigirAdmin())) {
    return (
      <main style={{ padding: 24, fontFamily: 'system-ui' }}>
        <h1>Acesso restrito</h1>
        <p>
          Este painel exige conta de administrador. <a href="/admin/entrar">Entrar</a>
        </p>
      </main>
    )
  }

  const p = await searchParams
  const texto = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''
  const busca = texto(p.busca)
  const status = texto(p.status) as 'ATIVO' | 'BLOQUEADO' | ''

  // O link só existe aqui: `acaoEmitirRedefinicao` o entrega por um cookie
  // httpOnly de 2 minutos (nunca pela querystring, que vaza em log/Referer),
  // e esta é a única tela que o lê.
  const linkRedefinicao = (await cookies()).get(NOME_COOKIE_LINK_REDEFINICAO)?.value

  const db = getDb()
  const linhas = await listarUsuarios(db, {
    busca: busca || undefined,
    status: status || undefined,
  })

  const dispositivosPorUsuario = new Map(
    await Promise.all(
      linhas.map(async (u) => [u.id, await dispositivosDoUsuario(db, u.id)] as const),
    ),
  )

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 1100, lineHeight: 1.5 }}>
      <h1 style={{ marginBottom: 4 }}>Usuários</h1>
      {linkRedefinicao && (
        <p role="status" style={{ fontSize: 13, padding: 8, background: '#fffbcc' }}>
          Link de redefinição (válido por 1 hora, uso único): <code>{linkRedefinicao}</code>
        </p>
      )}
      <p style={{ fontSize: 13, opacity: 0.7 }}>{linhas.length} conta(s)</p>

      <form method="get" style={{ display: 'flex', gap: 8, margin: '16px 0' }}>
        <input name="busca" defaultValue={busca} placeholder="e-mail ou nome" style={{ padding: 6 }} />
        <select name="status" defaultValue={status} style={{ padding: 6 }}>
          <option value="">Todos</option>
          <option value="ATIVO">Ativos</option>
          <option value="BLOQUEADO">Bloqueados</option>
        </select>
        <button type="submit">Filtrar</button>
      </form>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left', fontSize: 12, opacity: 0.6 }}>
            <th style={celula}>E-mail</th>
            <th style={celula}>Status</th>
            <th style={celula}>Assinatura</th>
            <th style={celula}>Dispositivos</th>
            <th style={celula}>Último acesso</th>
            <th style={celula}>Ações</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((u) => (
            <tr key={u.id}>
              <td style={celula}>
                {u.email}
                {u.papel === 'ADMIN' && <strong style={{ marginLeft: 6, fontSize: 11 }}>ADMIN</strong>}
                {u.nome && <div style={{ opacity: 0.6, fontSize: 12 }}>{u.nome}</div>}
              </td>
              <td style={celula}>{u.status}</td>
              <td style={celula}>
                {u.assinaturaStatus ?? '—'}
                <div style={{ opacity: 0.6, fontSize: 12 }}>
                  direito: {u.direitoAtivo ? 'ativo' : 'inativo'}
                </div>
                {u.proximaCobranca && (
                  <div style={{ opacity: 0.6, fontSize: 12 }}>
                    próxima: {diaCompleto(u.proximaCobranca, FUSO_ADMIN)}
                  </div>
                )}
              </td>
              <td style={celula}>
                {u.dispositivosAtivos}/2 ativo(s)
                {(dispositivosPorUsuario.get(u.id) ?? []).map((d) => (
                  <div key={d.id} style={{ opacity: 0.6, fontSize: 11 }}>
                    {d.tipo} · {d.ipUltimo ?? 'sem IP'} {d.temSessaoAtiva ? '· sessão aberta' : ''}
                  </div>
                ))}
              </td>
              <td style={celula}>
                {u.ultimoAcesso ? dataHora(u.ultimoAcesso, FUSO_ADMIN) : 'nunca'}
              </td>
              <td style={celula}>
                <div style={{ display: 'flex', gap: 6 }}>
                  {u.status === 'ATIVO' ? (
                    <form action={acaoBloquear}>
                      <input type="hidden" name="id" value={u.id} />
                      <button type="submit">Bloquear</button>
                    </form>
                  ) : (
                    <form action={acaoDesbloquear}>
                      <input type="hidden" name="id" value={u.id} />
                      <button type="submit">Desbloquear</button>
                    </form>
                  )}
                  <form action={acaoEmitirRedefinicao}>
                    <input type="hidden" name="usuarioId" value={u.id} />
                    <button type="submit">Emitir link de redefinição</button>
                  </form>
                  <form action={acaoExcluir}>
                    <input type="hidden" name="id" value={u.id} />
                    <button type="submit">Excluir</button>
                  </form>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <section style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: 16 }}>Adicionar manualmente</h2>
        <form action={acaoAdicionar} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input name="email" type="email" placeholder="e-mail" required style={{ padding: 6 }} />
          <input name="nome" placeholder="nome" style={{ padding: 6 }} />
          <input
            name="senha"
            type="password"
            placeholder="senha (mín. 8)"
            minLength={8}
            required
            style={{ padding: 6 }}
          />
          <button type="submit">Adicionar</button>
        </form>
      </section>
    </main>
  )
}
