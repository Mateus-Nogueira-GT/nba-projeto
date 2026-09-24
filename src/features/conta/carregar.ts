import { cache } from 'react'
import { desc, eq, inArray, sql } from 'drizzle-orm'
import { getDb } from '@/modules/dominio/db/cliente'
import { assinaturas, times, usuarios } from '@/modules/dominio/db/schema'
import { identidadesDeApresentacao } from '@/modules/dominio/identidade-apresentacao'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import { dispositivosDoUsuario } from '@/modules/plataforma/admin/usuarios'
import { exigirNivel } from '@/modules/plataforma/assinatura/guarda'
import { estadoExperienciaDoUsuario } from '@/modules/plataforma/experiencia/servico'
import { identidadeDoTime } from '@/ui/times'

export type AssinaturaDaConta = { plano: string | null; status: string; proximaCobranca: Date | null; mercadopagoId: string | null }

export type IdentidadeDoUsuario = { nome: string | null; email: string; fotoUrl: string | null }

/**
 * O nome e o avatar escolhidos em /conta — a linha do usuário no banco. Fica
 * aqui, e não dentro de `carregarConta`, porque a barra do topo precisa dela
 * em TODA tela logada — e chamar a tela de conta inteira para desenhar um
 * avatar seria pagar quatro consultas por uma. Uma consulta por chave
 * primária, só com as duas colunas; sem a linha, cai no e-mail da sessão.
 *
 * `cache()` memoriza por REQUISIÇÃO, como `sessaoAtual` e `avaliarAcesso`: a
 * casca pergunta em toda tela logada, e `/conta` pergunta de novo na mesma
 * renderização — sem o memo eram duas idas a `usuarios` por navegação à
 * conta. Entre requisições não guarda nada: o nome trocado em /conta aparece
 * na tela seguinte.
 */
export const identidadeDoUsuario = cache(async function identidadeDoUsuario(
  usuarioId: string,
  email: string,
): Promise<IdentidadeDoUsuario> {
  const [linha] = await getDb()
    .select({ nome: usuarios.nome, fotoUrl: usuarios.fotoUrl })
    .from(usuarios)
    .where(eq(usuarios.id, usuarioId))
    .limit(1)
  return { nome: linha?.nome ?? null, email, fotoUrl: linha?.fotoUrl ?? null }
})

/** Tudo o que a tela de Conta mostra — mesmas leituras do front anterior. */
export async function carregarConta() {
  const { sessao, acesso } = await exigirNivel('GRATIS', '/conta')
  const { fuso } = (await rulesetAtivo()).rodada
  const db = getDb()
  const [dispositivos, experiencia, linhas] = await Promise.all([
    dispositivosDoUsuario(db, sessao.usuarioId),
    estadoExperienciaDoUsuario(db, sessao.usuarioId),
    db
      .select()
      .from(assinaturas)
      .where(eq(assinaturas.usuarioId, sessao.usuarioId))
      // O contrato do acesso VIGENTE, não o escrito por último: depois de um
      // upgrade, a última escrita é a do contrato que morreu. Não cancelado
      // primeiro; entre iguais, o mais recente.
      .orderBy(sql`${assinaturas.canceladaEm} is null desc`, desc(assinaturas.atualizadoEm))
      .limit(1) as PromiseLike<AssinaturaDaConta[]>,
  ])
  const usuario = await identidadeDoUsuario(sessao.usuarioId, sessao.email)

  const idsJogadores = [...new Set([...experiencia.jogadoresAcompanhados, ...experiencia.jogadoresSilenciados])]
  const [identidades, timesSeguidos] = await Promise.all([
    identidadesDeApresentacao(db, idsJogadores),
    experiencia.timesAcompanhados.length === 0
      ? Promise.resolve([] as { id: string; nome: string; sigla: string }[])
      : (db
          .select({ id: times.id, nome: times.nome, sigla: times.sigla })
          .from(times)
          .where(inArray(times.id, experiencia.timesAcompanhados)) as PromiseLike<{ id: string; nome: string; sigla: string }[]>),
  ])
  const assinatura = linhas[0] ?? null
  const podeCancelar = Boolean(
    assinatura?.mercadopagoId && !['CANCELADA', 'CANCELED', 'CANCELLED'].includes(assinatura.status),
  )
  return {
    sessao,
    acesso,
    fuso,
    usuario,
    dispositivos,
    experiencia,
    assinatura,
    podeCancelar,
    jogadores: idsJogadores.map((id) => ({ id, nome: identidades.get(id)?.nome ?? 'Jogador' })),
    times: timesSeguidos.map((t) => ({ id: t.id, nome: identidadeDoTime(t.sigla).nome })),
  }
}
