import { desc, eq } from 'drizzle-orm'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { MolduraConta } from '@/components/conta/MolduraConta'
import { semantico } from '@/design-system/tokens/semantico'
import { getDb } from '@/modules/dominio/db/cliente'
import { assinaturas } from '@/modules/dominio/db/schema'
import { dispositivosDoUsuario } from '@/modules/plataforma/admin/usuarios'
import { avaliarAcesso } from '@/modules/plataforma/assinatura/direito'
import { sessaoAtual } from '@/modules/plataforma/auth/cookies'
import { preferenciasPushDoUsuario } from '@/modules/plataforma/push/inscricoes'
import { sair } from '../entrar/acoes'
import { cancelarAssinatura } from './acoes'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Minha conta · IA da NBA' }

function data(valor: Date | null): string {
  return valor ? valor.toLocaleDateString('pt-BR') : '—'
}

export default async function PaginaConta({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sessao = await sessaoAtual()
  if (!sessao) redirect('/entrar?destino=/conta')
  const db = getDb()
  const [acesso, dispositivos, preferencias, linhas, parametros] = await Promise.all([
    avaliarAcesso(db, sessao.usuarioId),
    dispositivosDoUsuario(db, sessao.usuarioId),
    preferenciasPushDoUsuario(db, sessao.usuarioId),
    db
      .select()
      .from(assinaturas)
      .where(eq(assinaturas.usuarioId, sessao.usuarioId))
      .orderBy(desc(assinaturas.atualizadoEm))
      .limit(1),
    searchParams,
  ])
  const assinatura = linhas[0] ?? null
  const estadoCancelamento = Array.isArray(parametros.cancelamento)
    ? parametros.cancelamento[0]
    : parametros.cancelamento
  const podeCancelar = Boolean(
    assinatura?.mercadopagoId && !['CANCELADA', 'CANCELED', 'CANCELLED'].includes(assinatura.status),
  )

  return (
    <MolduraConta titulo="Minha conta" descricao={sessao.email}>
      <div style={{ display: 'grid', gap: 24 }}>
        {estadoCancelamento && (
          <p
            role="status"
            style={{
              margin: 0,
              color:
                estadoCancelamento === 'confirmado'
                  ? semantico.apitoNivel3
                  : semantico.alerta,
            }}
          >
            {estadoCancelamento === 'confirmado'
              ? 'Cancelamento confirmado. Seu período já pago permanece válido até o vencimento.'
              : estadoCancelamento === 'reauth'
                ? 'Entre novamente para confirmar esta operação sensível.'
                : estadoCancelamento === 'limite'
                  ? 'Muitas tentativas. Aguarde antes de repetir.'
                  : 'Não foi possível confirmar o cancelamento no Mercado Pago.'}
          </p>
        )}

        <section>
          <h2 style={{ margin: '0 0 10px', fontSize: 17 }}>Assinatura e acesso</h2>
          <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <dt>Plano</dt>
            <dd style={{ margin: 0 }}>{assinatura?.plano ?? 'Sem plano'}</dd>
            <dt>Contrato</dt>
            <dd style={{ margin: 0 }}>{assinatura?.status ?? 'Não contratado'}</dd>
            <dt>Acesso</dt>
            <dd style={{ margin: 0 }}>{acesso.permitido ? 'Ativo' : 'Inativo'}</dd>
            <dt>Válido até</dt>
            <dd style={{ margin: 0 }}>{acesso.permitido ? data(acesso.validoAte) : '—'}</dd>
            <dt>Próxima cobrança</dt>
            <dd style={{ margin: 0 }}>{data(assinatura?.proximaCobranca ?? null)}</dd>
          </dl>
          {!acesso.permitido && (
            <p style={{ marginBottom: 0 }}>
              <Link href="/assinar">Contratar acesso</Link>
            </p>
          )}
        </section>

        <section>
          <h2 style={{ margin: '0 0 10px', fontSize: 17 }}>Dispositivos</h2>
          {dispositivos.map((dispositivo) => (
            <p key={dispositivo.id} style={{ margin: '5px 0', fontSize: 13 }}>
              {dispositivo.tipo} · último uso {dispositivo.ultimoUso.toLocaleString('pt-BR')}
              {dispositivo.temSessaoAtiva ? ' · ativo' : ''}
            </p>
          ))}
          {dispositivos.length === 0 && <p style={{ margin: 0 }}>Nenhum dispositivo.</p>}
        </section>

        <section>
          <h2 style={{ margin: '0 0 10px', fontSize: 17 }}>Notificações</h2>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7 }}>
            Lista Secreta: {preferencias.LISTA_SECRETA ? 'ativada' : 'desativada'} · Fire Live:{' '}
            {preferencias.FIRE_LIVE_APITO ? 'ativado' : 'desativado'} · Green:{' '}
            {preferencias.GREEN ? 'ativado' : 'desativado'}
          </p>
        </section>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {podeCancelar && (
            <form action={cancelarAssinatura}>
              <button type="submit">Cancelar assinatura</button>
            </form>
          )}
          <form action={sair}>
            <button type="submit">Sair</button>
          </form>
        </div>
      </div>
    </MolduraConta>
  )
}
