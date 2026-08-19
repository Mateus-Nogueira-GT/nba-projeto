import { createHash, randomBytes } from 'node:crypto'
import { and, asc, eq, gte, isNull } from 'drizzle-orm'

import { dispositivos, eventosConta, sessoes, usuarios } from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import { conferirSenha } from './senha'
import { excedeuTentativas, registrarTentativa, type PoliticaRateLimit } from './rate-limit'

/** Limite contratado: 2 dispositivos ativos por conta (proposta, p.8). */
export const MAX_DISPOSITIVOS = 2

/** Janela para considerar dois acessos "simultâneos". */
export const JANELA_USO_SIMULTANEO_MS = 5 * 60_000

export type DadosAcesso = {
  fingerprint: string
  tipo: 'MOBILE' | 'DESKTOP'
  userAgent: string | null
  ip: string | null
}

export type ResultadoLogin =
  | { ok: false; motivo: 'credenciais' | 'bloqueado' | 'excesso-de-tentativas' }
  | { ok: true; token: string; sessaoId: string; dispositivoId: string; encerrouSessoes: number }

function hashDoToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

async function registrar(
  db: Db,
  usuarioId: string | null,
  tipo: 'LOGIN' | 'LOGIN_FALHOU' | 'SESSAO_ENCERRADA' | 'USO_SIMULTANEO' | 'BLOQUEIO' | 'DESBLOQUEIO',
  detalhe: string,
  ip: string | null,
  agora: Date,
  contexto?: unknown,
): Promise<void> {
  await db.insert(eventosConta).values({
    usuarioId,
    tipo,
    detalhe,
    ip,
    contexto: contexto ?? null,
    ocorridoEm: agora,
  })
}

// ---------------------------------------------------------------------------

export async function autenticar(
  db: Db,
  credenciais: { email: string; senha: string },
  acesso: DadosAcesso,
  agora: Date,
  opcoes: { duracaoMs: number; politica?: PoliticaRateLimit } = { duracaoMs: 30 * 24 * 3600_000 },
): Promise<ResultadoLogin> {
  const email = credenciais.email.trim().toLowerCase()

  if (await excedeuTentativas(db, email, agora, opcoes.politica)) {
    await registrar(db, null, 'LOGIN_FALHOU', 'excesso de tentativas', acesso.ip, agora)
    return { ok: false, motivo: 'excesso-de-tentativas' }
  }

  const [usuario] = await db.select().from(usuarios).where(eq(usuarios.email, email)).limit(1)

  // Confere a senha mesmo sem usuário, contra um hash descartável, para que o
  // tempo de resposta não revele quais e-mails existem na base.
  const hashParaConferir = usuario?.senhaHash ?? 'scrypt$16384$8$1$AAAA$AAAA'
  const senhaConfere = await conferirSenha(credenciais.senha, hashParaConferir)

  if (!usuario || !senhaConfere) {
    await registrarTentativa(db, { identificador: email, ip: acesso.ip, sucesso: false, agora })
    await registrar(db, usuario?.id ?? null, 'LOGIN_FALHOU', 'credenciais inválidas', acesso.ip, agora)
    return { ok: false, motivo: 'credenciais' }
  }

  if (usuario.status === 'BLOQUEADO') {
    await registrarTentativa(db, { identificador: email, ip: acesso.ip, sucesso: false, agora })
    return { ok: false, motivo: 'bloqueado' }
  }

  await registrarTentativa(db, { identificador: email, ip: acesso.ip, sucesso: true, agora })

  // 1 · Dispositivo (upsert por fingerprint).
  const [dispositivo] = await db
    .insert(dispositivos)
    .values({
      usuarioId: usuario.id,
      fingerprint: acesso.fingerprint,
      tipo: acesso.tipo,
      userAgent: acesso.userAgent,
      ipUltimo: acesso.ip,
      ativoDesde: agora,
      ultimoUso: agora,
    })
    .onConflictDoUpdate({
      target: [dispositivos.usuarioId, dispositivos.fingerprint],
      set: { ultimoUso: agora, ipUltimo: acesso.ip, userAgent: acesso.userAgent },
    })
    .returning()

  // 2 · Sessão nova.
  const token = randomBytes(32).toString('base64url')
  const [sessao] = await db
    .insert(sessoes)
    .values({
      usuarioId: usuario.id,
      dispositivoId: dispositivo!.id,
      tokenHash: hashDoToken(token),
      criadaEm: agora,
      ip: acesso.ip,
      expiraEm: new Date(agora.getTime() + opcoes.duracaoMs),
    })
    .returning()

  // 3 · Regra dos 2 dispositivos.
  const encerrouSessoes = await aplicarLimiteDeDispositivos(db, usuario.id, sessao!.id, agora)

  await db.update(usuarios).set({ ultimoAcesso: agora }).where(eq(usuarios.id, usuario.id))
  await registrar(db, usuario.id, 'LOGIN', `dispositivo ${acesso.fingerprint}`, acesso.ip, agora)
  await detectarUsoSimultaneo(db, usuario.id, agora)

  return {
    ok: true,
    token,
    sessaoId: sessao!.id,
    dispositivoId: dispositivo!.id,
    encerrouSessoes,
  }
}

/**
 * Mantém no máximo 2 dispositivos com sessão ativa.
 *
 * Ao entrar no 3º, a sessão MAIS ANTIGA é encerrada — e o motivo fica gravado,
 * para que o usuário legítimo entenda por que caiu e o admin consiga auditar.
 */
export async function aplicarLimiteDeDispositivos(
  db: Db,
  usuarioId: string,
  sessaoRecemCriadaId: string,
  agora: Date,
): Promise<number> {
  const ativas = await db
    .select()
    .from(sessoes)
    .where(and(eq(sessoes.usuarioId, usuarioId), isNull(sessoes.encerradaEm), gte(sessoes.expiraEm, agora)))
    .orderBy(asc(sessoes.criadaEm))

  const dispositivosAtivos = [...new Set(ativas.map((s) => s.dispositivoId))]
  if (dispositivosAtivos.length <= MAX_DISPOSITIVOS) return 0

  const excedentes = dispositivosAtivos.length - MAX_DISPOSITIVOS
  // `ativas` está em ordem de criação: os primeiros são os mais antigos.
  const paraEncerrar = ativas
    .filter((s) => s.id !== sessaoRecemCriadaId)
    .slice(0, excedentes)

  for (const s of paraEncerrar) {
    await db
      .update(sessoes)
      .set({
        encerradaEm: agora,
        motivoEncerramento: `limite de ${MAX_DISPOSITIVOS} dispositivos: sessão mais antiga encerrada`,
      })
      .where(eq(sessoes.id, s.id))

    await registrar(
      db,
      usuarioId,
      'SESSAO_ENCERRADA',
      `limite de ${MAX_DISPOSITIVOS} dispositivos`,
      s.ip,
      agora,
      { sessaoId: s.id, dispositivoId: s.dispositivoId },
    )
  }

  return paraEncerrar.length
}

/**
 * Uso simultâneo em locais diferentes.
 *
 * Dois dispositivos ativos são permitidos por contrato; o que interessa ao
 * admin é o padrão de conta compartilhada — dois acessos na mesma janela
 * vindos de IPs distintos.
 */
export async function detectarUsoSimultaneo(
  db: Db,
  usuarioId: string,
  agora: Date,
  janelaMs = JANELA_USO_SIMULTANEO_MS,
): Promise<boolean> {
  const desde = new Date(agora.getTime() - janelaMs)

  const recentes = await db
    .select()
    .from(dispositivos)
    .where(and(eq(dispositivos.usuarioId, usuarioId), gte(dispositivos.ultimoUso, desde)))

  const ips = new Set(recentes.map((d) => d.ipUltimo).filter((ip): ip is string => ip !== null))
  if (recentes.length < 2 || ips.size < 2) return false

  await registrar(
    db,
    usuarioId,
    'USO_SIMULTANEO',
    `${recentes.length} dispositivos em ${ips.size} IPs distintos`,
    null,
    agora,
    { ips: [...ips] },
  )
  return true
}

// ---------------------------------------------------------------------------

export type Sessao = {
  usuarioId: string
  email: string
  papel: 'USUARIO' | 'ADMIN'
  sessaoId: string
  dispositivoId: string | null
}

export type ResultadoValidacao =
  | { ok: true; sessao: Sessao }
  | { ok: false; motivo: 'inexistente' | 'expirada' | 'encerrada' | 'bloqueado' }

/**
 * Valida a sessão a cada requisição.
 *
 * O status do usuário é lido AQUI, não só no login: é isso que faz o bloqueio
 * pelo painel valer na requisição seguinte, sem esperar o token expirar.
 */
export async function validarSessao(
  db: Db,
  token: string,
  agora: Date,
  acesso?: { ip: string | null },
): Promise<ResultadoValidacao> {
  const [linha] = await db
    .select({ sessao: sessoes, usuario: usuarios })
    .from(sessoes)
    .innerJoin(usuarios, eq(sessoes.usuarioId, usuarios.id))
    .where(eq(sessoes.tokenHash, hashDoToken(token)))
    .limit(1)

  if (!linha) return { ok: false, motivo: 'inexistente' }
  if (linha.sessao.encerradaEm !== null) return { ok: false, motivo: 'encerrada' }
  if (linha.sessao.expiraEm.getTime() <= agora.getTime()) return { ok: false, motivo: 'expirada' }
  if (linha.usuario.status === 'BLOQUEADO') return { ok: false, motivo: 'bloqueado' }

  if (linha.sessao.dispositivoId) {
    await db
      .update(dispositivos)
      .set({ ultimoUso: agora, ...(acesso?.ip ? { ipUltimo: acesso.ip } : {}) })
      .where(eq(dispositivos.id, linha.sessao.dispositivoId))
  }

  return {
    ok: true,
    sessao: {
      usuarioId: linha.usuario.id,
      email: linha.usuario.email,
      papel: linha.usuario.papel,
      sessaoId: linha.sessao.id,
      dispositivoId: linha.sessao.dispositivoId,
    },
  }
}

export async function encerrarSessao(
  db: Db,
  sessaoId: string,
  motivo: string,
  agora: Date,
): Promise<void> {
  await db
    .update(sessoes)
    .set({ encerradaEm: agora, motivoEncerramento: motivo })
    .where(eq(sessoes.id, sessaoId))
}

/** Encerra todas as sessões do usuário — usado ao bloquear pelo painel. */
export async function encerrarTodasAsSessoes(
  db: Db,
  usuarioId: string,
  motivo: string,
  agora: Date,
): Promise<void> {
  await db
    .update(sessoes)
    .set({ encerradaEm: agora, motivoEncerramento: motivo })
    .where(and(eq(sessoes.usuarioId, usuarioId), isNull(sessoes.encerradaEm)))
}
