import { and, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm'

import {
  assinaturas,
  dispositivos,
  eventosConta,
  sessoes,
  usuarios,
} from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import { gerarHash } from '../auth/senha'
import { encerrarTodasAsSessoes } from '../auth/sessao'

export type FiltroUsuarios = {
  busca?: string
  status?: 'ATIVO' | 'BLOQUEADO'
  situacaoAssinatura?: string
}

export type LinhaAdmin = {
  id: string
  email: string
  nome: string | null
  status: 'ATIVO' | 'BLOQUEADO'
  papel: 'USUARIO' | 'ADMIN'
  criadoEm: Date
  ultimoAcesso: Date | null
  assinaturaStatus: string | null
  assinaturaPlano: string | null
  proximaCobranca: Date | null
  dispositivosAtivos: number
}

export async function listarUsuarios(db: Db, filtro: FiltroUsuarios = {}): Promise<LinhaAdmin[]> {
  const condicoes = []

  if (filtro.busca && filtro.busca.trim() !== '') {
    const alvo = `%${filtro.busca.trim()}%`
    condicoes.push(or(ilike(usuarios.email, alvo), ilike(usuarios.nome, alvo)))
  }
  if (filtro.status) condicoes.push(eq(usuarios.status, filtro.status))
  if (filtro.situacaoAssinatura) condicoes.push(eq(assinaturas.status, filtro.situacaoAssinatura))

  const linhas = await db
    .select({
      id: usuarios.id,
      email: usuarios.email,
      nome: usuarios.nome,
      status: usuarios.status,
      papel: usuarios.papel,
      criadoEm: usuarios.criadoEm,
      ultimoAcesso: usuarios.ultimoAcesso,
      assinaturaStatus: assinaturas.status,
      assinaturaPlano: assinaturas.plano,
      proximaCobranca: assinaturas.proximaCobranca,
      dispositivosAtivos: sql<number>`(
        SELECT count(DISTINCT ${sessoes.dispositivoId})::int
        FROM ${sessoes}
        WHERE ${sessoes.usuarioId} = ${usuarios.id} AND ${sessoes.encerradaEm} IS NULL
      )`,
    })
    .from(usuarios)
    .leftJoin(assinaturas, eq(assinaturas.usuarioId, usuarios.id))
    .where(condicoes.length > 0 ? and(...condicoes) : undefined)
    .orderBy(desc(usuarios.criadoEm))

  return linhas
}

/** Adição manual pelo painel — o caminho de exceção quando o pagamento falha. */
export async function adicionarUsuario(
  db: Db,
  dados: { email: string; senha: string; nome?: string; papel?: 'USUARIO' | 'ADMIN' },
): Promise<{ id: string }> {
  const [criado] = await db
    .insert(usuarios)
    .values({
      email: dados.email.trim().toLowerCase(),
      senhaHash: await gerarHash(dados.senha),
      nome: dados.nome ?? null,
      papel: dados.papel ?? 'USUARIO',
    })
    .returning({ id: usuarios.id })

  return criado!
}

/**
 * Bloqueia o acesso.
 *
 * Encerra as sessões abertas na mesma operação: sem isso, o bloqueio só
 * valeria quando o token expirasse, e o usuário seguiria usando o produto por
 * mais 30 dias.
 */
export async function bloquearUsuario(
  db: Db,
  usuarioId: string,
  motivo: string,
  agora: Date,
): Promise<void> {
  await db.update(usuarios).set({ status: 'BLOQUEADO' }).where(eq(usuarios.id, usuarioId))
  await encerrarTodasAsSessoes(db, usuarioId, `bloqueado pelo painel: ${motivo}`, agora)
  await db.insert(eventosConta).values({
    usuarioId,
    tipo: 'BLOQUEIO',
    detalhe: motivo,
    ocorridoEm: agora,
  })
}

export async function desbloquearUsuario(
  db: Db,
  usuarioId: string,
  agora: Date,
): Promise<void> {
  await db.update(usuarios).set({ status: 'ATIVO' }).where(eq(usuarios.id, usuarioId))
  await db.insert(eventosConta).values({
    usuarioId,
    tipo: 'DESBLOQUEIO',
    detalhe: 'liberado pelo painel',
    ocorridoEm: agora,
  })
}

export async function excluirUsuario(db: Db, usuarioId: string): Promise<void> {
  // Cascade cuida de sessões, dispositivos, assinatura e eventos.
  await db.delete(usuarios).where(eq(usuarios.id, usuarioId))
}

export type DispositivoDoUsuario = {
  id: string
  fingerprint: string
  tipo: 'MOBILE' | 'DESKTOP'
  ipUltimo: string | null
  ultimoUso: Date
  temSessaoAtiva: boolean
}

/** O painel mostra os dispositivos de cada usuário (proposta, p.8). */
export async function dispositivosDoUsuario(
  db: Db,
  usuarioId: string,
): Promise<DispositivoDoUsuario[]> {
  const linhas = await db
    .select({
      id: dispositivos.id,
      fingerprint: dispositivos.fingerprint,
      tipo: dispositivos.tipo,
      ipUltimo: dispositivos.ipUltimo,
      ultimoUso: dispositivos.ultimoUso,
      sessaoAberta: sessoes.id,
    })
    .from(dispositivos)
    .leftJoin(
      sessoes,
      and(eq(sessoes.dispositivoId, dispositivos.id), isNull(sessoes.encerradaEm)),
    )
    .where(eq(dispositivos.usuarioId, usuarioId))
    .orderBy(desc(dispositivos.ultimoUso))

  const porId = new Map<string, DispositivoDoUsuario>()
  for (const l of linhas) {
    const atual = porId.get(l.id)
    if (atual) {
      atual.temSessaoAtiva ||= l.sessaoAberta !== null
      continue
    }
    porId.set(l.id, {
      id: l.id,
      fingerprint: l.fingerprint,
      tipo: l.tipo,
      ipUltimo: l.ipUltimo,
      ultimoUso: l.ultimoUso,
      temSessaoAtiva: l.sessaoAberta !== null,
    })
  }

  return [...porId.values()]
}

/** Trilha da conta — inclui os registros de uso simultâneo. */
export async function eventosDoUsuario(db: Db, usuarioId: string, limite = 50) {
  return db
    .select()
    .from(eventosConta)
    .where(eq(eventosConta.usuarioId, usuarioId))
    .orderBy(desc(eventosConta.ocorridoEm))
    .limit(limite)
}
