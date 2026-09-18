import { and, desc, eq, getTableName, gt, ilike, isNull, or, sql } from 'drizzle-orm'

import {
  assinaturas,
  direitosAcesso,
  dispositivos,
  eventosConta,
  sessoes,
  usuarios,
} from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import { gerarHash, MENSAGEM_REGRA_SENHA, senhaSchema } from '../auth/senha'
import { encerrarTodasAsSessoesNaTransacao } from '../auth/sessao'

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
  direitoAtivo: boolean
  dispositivosAtivos: number
}

/**
 * O `id` DO USUÁRIO DE FORA, qualificado à mão — e não `${usuarios.id}`.
 *
 * Dentro de um `sql` usado como CAMPO do select, o drizzle renderiza uma
 * coluna SEM o prefixo da tabela: `${usuarios.id}` vira `"id"`. Numa
 * subconsulta correlacionada isso é silenciosamente fatal — o Postgres
 * resolve `"id"` no escopo MAIS INTERNO, então `where a.usuario_id = "id"`
 * compara a assinatura com ela mesma e nunca casa. Não dá erro: devolve nulo.
 *
 * Num `where` de topo o drizzle qualifica sozinho, e era por isso que o
 * defeito passava despercebido: o filtro `situacaoAssinatura` funcionava
 * enquanto as colunas ao lado dele mentiam. Agora os dois usam esta mesma
 * referência — um jeito só de apontar para o usuário de fora.
 *
 * Tabela e coluna vêm do schema, não de string literal, para um rename ser
 * acompanhado em vez de quebrar em silêncio outra vez.
 */
const ID_DO_USUARIO = sql`${sql.identifier(getTableName(usuarios))}.${sql.identifier(usuarios.id.name)}`

export async function listarUsuarios(
  db: Db,
  filtro: FiltroUsuarios = {},
  agora = new Date(),
): Promise<LinhaAdmin[]> {
  const condicoes = []

  if (filtro.busca && filtro.busca.trim() !== '') {
    const alvo = `%${filtro.busca.trim()}%`
    condicoes.push(or(ilike(usuarios.email, alvo), ilike(usuarios.nome, alvo)))
  }
  if (filtro.status) condicoes.push(eq(usuarios.status, filtro.status))
  if (filtro.situacaoAssinatura) {
    condicoes.push(
      sql`exists (
        select 1 from ${assinaturas} a
        where a.usuario_id = ${ID_DO_USUARIO} and a.status = ${filtro.situacaoAssinatura}
      )`,
    )
  }

  const linhas = await db
    .select({
      id: usuarios.id,
      email: usuarios.email,
      nome: usuarios.nome,
      status: usuarios.status,
      papel: usuarios.papel,
      criadoEm: usuarios.criadoEm,
      ultimoAcesso: usuarios.ultimoAcesso,
      // MESMA ORDEM DA TELA DA CONTA, pelo mesmo motivo: depois de um upgrade
      // a última escrita é a do contrato que MORREU (o webhook grava os dois
      // no mesmo instante e a varredura de cancelamento volta a tocar só o
      // antigo). Por `atualizado_em desc` sozinho, o painel diria ao suporte
      // que o assinante está cancelado no plano velho. Não cancelado primeiro;
      // entre iguais, o mais recente.
      assinaturaStatus: sql<string | null>`(
        select a.status from ${assinaturas} a
        where a.usuario_id = ${ID_DO_USUARIO}
        order by (a.cancelada_em is null) desc, a.atualizado_em desc limit 1
      )`,
      assinaturaPlano: sql<string | null>`(
        select a.plano from ${assinaturas} a
        where a.usuario_id = ${ID_DO_USUARIO}
        order by (a.cancelada_em is null) desc, a.atualizado_em desc limit 1
      )`,
      // `.mapWith` não é enfeite: um campo `sql` cru NÃO passa pelo decodificador
      // do drizzle, e o timestamp volta como STRING do driver. O tipo dizia
      // `Date` e a tela chama `diaCompleto(...)`, que faz `.toLocaleDateString()`
      // — com a correlação consertada e sem esta linha, o painel deixaria de
      // mentir e passaria a QUEBRAR para todo assinante com cobrança marcada.
      // Reusar o decodificador da própria coluna mantém tipo e valor de acordo.
      proximaCobranca: sql<Date | null>`(
        select a.proxima_cobranca from ${assinaturas} a
        where a.usuario_id = ${ID_DO_USUARIO}
        order by (a.cancelada_em is null) desc, a.atualizado_em desc limit 1
      )`.mapWith(assinaturas.proximaCobranca),
      direitoAtivo: sql<boolean>`exists (
        select 1 from ${direitosAcesso} d
        where d.usuario_id = ${ID_DO_USUARIO}
          and d.produto = 'NBA_PRO'
          and d.revogado_em is null
          and d.inicio <= ${agora}
          and (d.fim is null or d.fim > ${agora})
      )`,
      dispositivosAtivos: sql<number>`(
        SELECT count(DISTINCT ${sessoes.dispositivoId})::int
        FROM ${sessoes}
        WHERE ${sessoes.usuarioId} = ${ID_DO_USUARIO}
          AND ${sessoes.encerradaEm} IS NULL
          AND ${sessoes.expiraEm} > ${agora}
      )`,
    })
    .from(usuarios)
    .where(condicoes.length > 0 ? and(...condicoes) : undefined)
    .orderBy(desc(usuarios.criadoEm))

  return linhas
}

/**
 * Adição manual pelo painel — o caminho de exceção quando o pagamento falha.
 *
 * Valida com `senhaSchema` porque a política de senha "é uma só, para o
 * cadastro e para a troca no perfil" (comentário de `auth/senha.ts`) — antes
 * desta validação, essa frase não era verdade: o painel deixava passar
 * qualquer senha de 8+ caracteres (`admin/usuarios/acoes.ts`), mais fraca do
 * que o cadastro normal exige. Validar AQUI, e não só no chamador, fecha a
 * porta para qualquer chamador futuro — `scripts/criar-conta-teste.ts` já
 * valida antes de chamar, então não muda nada para ele.
 */
export async function adicionarUsuario(
  db: Db,
  dados: { email: string; senha: string; nome?: string; papel?: 'USUARIO' | 'ADMIN' },
): Promise<{ id: string }> {
  if (!senhaSchema.safeParse(dados.senha).success) throw new Error(MENSAGEM_REGRA_SENHA)
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
  await db.transaction(async (tx) => {
    await tx.update(usuarios).set({ status: 'BLOQUEADO' }).where(eq(usuarios.id, usuarioId))
    await encerrarTodasAsSessoesNaTransacao(
      tx,
      usuarioId,
      `bloqueado pelo painel: ${motivo}`,
      agora,
    )
    await tx.insert(eventosConta).values({
      usuarioId,
      tipo: 'BLOQUEIO',
      detalhe: motivo,
      ocorridoEm: agora,
    })
  })
}

export async function desbloquearUsuario(db: Db, usuarioId: string, agora: Date): Promise<void> {
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
  agora = new Date(),
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
      and(
        eq(sessoes.dispositivoId, dispositivos.id),
        isNull(sessoes.encerradaEm),
        gt(sessoes.expiraEm, agora),
      ),
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
