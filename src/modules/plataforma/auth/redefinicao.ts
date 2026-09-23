import { createHash, randomBytes } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'

import type { Db } from '../../dominio/db/tipos'
import { redefinicoesSenha, usuarios } from '../../dominio/db/schema'
import { gerarHash, senhaSchema } from './senha'
import { encerrarTodasAsSessoesNaTransacao } from './sessao'

/**
 * REDEFINIÇÃO DE SENHA — sem provedor de e-mail, quem entrega o link hoje é
 * o admin (painel `/admin/usuarios`); quando houver provedor, ele entrega o
 * MESMO link e nada aqui muda. Validade de uma hora e uso único são as duas
 * regras que o cliente definiu — nenhuma outra política (expirar tokens
 * anteriores, limitar emissões) foi pedida, então nenhuma foi inventada.
 */
export const VALIDADE_DA_REDEFINICAO_MS = 60 * 60_000

const hashDe = (token: string) => createHash('sha256').update(token).digest('hex')

export async function emitirRedefinicao(
  db: Db,
  e: { usuarioId: string; criadaPorId: string | null; agora: Date },
): Promise<{ token: string; expiraEm: Date }> {
  // O token em claro só existe aqui, no valor de retorno — o banco grava só
  // o hash (mesmo desenho de `sessoes.tokenHash`, auth/sessao.ts).
  const token = randomBytes(32).toString('base64url')
  const expiraEm = new Date(e.agora.getTime() + VALIDADE_DA_REDEFINICAO_MS)
  await db.insert(redefinicoesSenha).values({
    usuarioId: e.usuarioId,
    tokenHash: hashDe(token),
    expiraEm,
    criadaPorId: e.criadaPorId,
    criadaEm: e.agora,
  })
  return { token, expiraEm }
}

export type ResultadoRedefinicao =
  | { ok: true }
  | { ok: false; motivo: 'token' | 'expirada' | 'usada' | 'senha' }

export async function concluirRedefinicao(
  db: Db,
  e: { token: string; novaSenha: string; agora: Date },
): Promise<ResultadoRedefinicao> {
  // Confere a senha antes de tocar o banco: um token válido não deveria ser
  // queimado por uma tentativa que a política de senha já ia recusar. Mesmo
  // schema do cadastro e da troca no perfil (auth/senha.ts) — a política de
  // senha é uma só no projeto.
  if (!senhaSchema.safeParse(e.novaSenha).success) return { ok: false, motivo: 'senha' }

  const [r] = await db
    .select()
    .from(redefinicoesSenha)
    .where(eq(redefinicoesSenha.tokenHash, hashDe(e.token)))
    .limit(1)
  if (!r) return { ok: false, motivo: 'token' }
  if (r.expiraEm.getTime() < e.agora.getTime()) return { ok: false, motivo: 'expirada' }

  // scrypt FORA da transação: dentro, segurava conexão e lock durante a CPU
  // do hash (auditoria 23/09).
  const senhaHash = await gerarHash(e.novaSenha)
  return db.transaction(async (tx): Promise<ResultadoRedefinicao> => {
    // A queima do token É a trava de concorrência, não uma gravação a mais.
    // O SELECT acima é leitura otimista, fora da transação — dois `POST`s
    // com o MESMO token passam os dois por ele. Sem uma escrita condicional
    // aqui dentro, os dois entrariam na transação, o Postgres serializaria
    // no lock da linha (não recusaria o segundo), e os dois veriam
    // `{ ok: true }` com a senha final sendo a do último a gravar — o
    // oposto de "uso único". Com `usada_em IS NULL` na cláusula, o primeiro
    // a chegar grava e ganha a linha; o segundo, sob READ COMMITTED,
    // reavalia o WHERE contra a versão já commitada (usada_em preenchido) e
    // não casa nenhuma linha — 0 retornos, sem tocar senha nem sessão.
    const [queimado] = await tx
      .update(redefinicoesSenha)
      .set({ usadaEm: e.agora })
      .where(and(eq(redefinicoesSenha.id, r.id), isNull(redefinicoesSenha.usadaEm)))
      .returning({ id: redefinicoesSenha.id })
    if (!queimado) return { ok: false, motivo: 'usada' }

    await tx
      .update(usuarios)
      .set({ senhaHash })
      .where(eq(usuarios.id, r.usuarioId))
    // Senha nova, sessões antigas fora — pelo caminho que já corta o push
    // por dispositivo (o mesmo usado ao bloquear pelo painel, admin/usuarios.ts)
    // e já grava o evento SESSAO_ENCERRADA sozinho — duplicar o insert aqui
    // criaria duas linhas de trilha para o mesmo encerramento. Um `UPDATE`
    // cru em `sessoes` encerraria a navegação mas deixaria as inscrições de
    // push vivas, e o aparelho de quem não é mais dono da conta continuaria
    // recebendo apito.
    await encerrarTodasAsSessoesNaTransacao(tx, r.usuarioId, 'redefinição de senha', e.agora)

    return { ok: true }
  })
}
