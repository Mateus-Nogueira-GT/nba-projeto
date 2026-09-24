import { cache } from 'react'
import { and, eq, gt, isNull, lte, or } from 'drizzle-orm'

import { direitosAcesso, usuarios } from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import { PRODUTO_PAGO } from './configuracao'
import type { Modalidade, NivelDoPlano, NivelPago } from './nivel-do-plano'
import { atende } from './nivel-do-plano'

export type AcessoComNivel = {
  nivel: NivelDoPlano
  direitoId: string | null
  validoAte: Date | null
  modalidade: Modalidade | null
  /**
   * Quando a pessoa aceitou a metodologia. NULO = nunca (spec 20/09).
   *
   * Vem JUNTO do acesso, e não de uma consulta própria, pelo motivo do
   * comentário da consulta abaixo: função em iad1 e banco em sa-east-1, cada
   * ida custa ~150 ms (ADR-0008). Uma terceira ida em toda navegação
   * autenticada, para ler uma coluna, é exatamente o que aquela otimização
   * existe para impedir. A coluna já está na linha que o join traz.
   */
  metodologiaAceitaEm: Date | null
}

/**
 * A RESPOSTA DE `avaliarAcesso` — um nível, ou a ausência de nível.
 *
 * `nivel: null` não é "não pode": é "não há a quem atribuir nível" — sem
 * sessão, ou conta bloqueada pelo painel. Quem está logado e não assinou tem
 * nível: GRATIS. A diferença é o que separa a tela de entrar da home do
 * grátis.
 */
export type ResultadoAcesso =
  | AcessoComNivel
  | {
      nivel: null
      motivo: 'sem-sessao' | 'bloqueio-administrativo'
    }

// Congelado porque é UMA instância devolvida a todo chamador: uma tela que
// mutasse o objeto mutaria o de todas as outras requisições do processo.
const GRATIS: AcessoComNivel = Object.freeze({
  nivel: 'GRATIS',
  direitoId: null,
  validoAte: null,
  modalidade: null,
  // Substituído pelo do usuário em `avaliarAcesso`: a constante é compartilhada
  // entre todos, e o aceite é de cada um.
  metodologiaAceitaEm: null,
})

/**
 * `cache()` memoriza por REQUISIÇÃO, como `sessaoAtual`: numa visita a `/` a
 * casca do app, a Lista e o resumo da coluna perguntam o acesso da mesma
 * pessoa — três consultas iguais viravam uma (revisão da Tarefa 3 do front
 * v2, 2k simultâneos no lançamento). A chave são os argumentos PASSADOS: as
 * telas chamam com `(getDb(), usuarioId)` e `getDb()` é um só por processo;
 * quem passa `agora` explícito (checkout) tem chave própria. Fora de uma
 * renderização do React (rotas, ações, testes) não há cache: é chamada direta.
 */
export const avaliarAcesso = cache(async function avaliarAcesso(
  db: Db,
  usuarioId: string | null,
  agora: Date = new Date(),
  produto: string = PRODUTO_PAGO,
): Promise<ResultadoAcesso> {
  if (!usuarioId) return { nivel: null, motivo: 'sem-sessao' }

  // UMA consulta, não duas. Eram dois SELECTs em sequência (o usuário, depois
  // o direito) e toda tela autenticada pagava os dois. Numa cadeia que
  // atravessa continente — função em iad1, banco em sa-east-1 — cada ida e
  // volta custa ~150ms (ADR-0008).
  //
  // O LEFT JOIN preserva a distinção que importa: sem LINHA é usuário
  // inexistente (sem-sessao, leva a /entrar); linha COM direito nulo é
  // usuário sem assinatura — que agora é um nível, GRATIS, e não uma recusa.
  // Sem `.limit(1)`: com dois direitos ativos (o instante do upgrade) vale o
  // MAIOR, e é o código que escolhe, não a ordem física das linhas.
  const linhas = await db
    .select({
      status: usuarios.status,
      metodologiaAceitaEm: usuarios.metodologiaAceitaEm,
      direitoId: direitosAcesso.id,
      fim: direitosAcesso.fim,
      nivelDoPlano: direitosAcesso.nivelDoPlano,
      modalidade: direitosAcesso.modalidade,
    })
    .from(usuarios)
    .leftJoin(
      direitosAcesso,
      and(
        eq(direitosAcesso.usuarioId, usuarios.id),
        eq(direitosAcesso.produto, produto),
        isNull(direitosAcesso.revogadoEm),
        lte(direitosAcesso.inicio, agora),
        or(isNull(direitosAcesso.fim), gt(direitosAcesso.fim, agora)),
      ),
    )
    .where(eq(usuarios.id, usuarioId))

  const primeira = linhas[0]
  if (!primeira) return { nivel: null, motivo: 'sem-sessao' }
  // A ORDEM é regra de negócio (Spec 04, princípio 4): bloqueio administrativo
  // prevalece sobre direito vigente.
  if (primeira.status === 'BLOQUEADO') return { nivel: null, motivo: 'bloqueio-administrativo' }

  let vencedor: AcessoComNivel | null = null
  for (const l of linhas) {
    if (!l.direitoId) continue
    // `as` é a fronteira entre `text` no banco e o tipo do domínio; os checks
    // da migration garantem que só estes valores existem na coluna.
    const candidato: AcessoComNivel = {
      nivel: l.nivelDoPlano as NivelDoPlano,
      direitoId: l.direitoId,
      validoAte: l.fim,
      modalidade: (l.modalidade as Modalidade | null) ?? null,
      metodologiaAceitaEm: l.metodologiaAceitaEm,
    }
    if (
      !vencedor ||
      (atende(candidato.nivel, vencedor.nivel) && candidato.nivel !== vencedor.nivel)
    ) {
      vencedor = candidato
    }
  }
  // O GRATIS é uma constante compartilhada; o aceite é DESTE usuário.
  return vencedor ?? { ...GRATIS, metodologiaAceitaEm: primeira.metodologiaAceitaEm }
})

export async function concederCortesia(
  db: Db,
  entrada: {
    usuarioId: string
    referencia: string
    inicio: Date
    fim: Date | null
    nivelDoPlano: NivelPago
  },
): Promise<string> {
  const [direito] = await db
    .insert(direitosAcesso)
    .values({
      usuarioId: entrada.usuarioId,
      produto: PRODUTO_PAGO,
      origem: 'CORTESIA_ADMIN',
      referenciaOrigem: entrada.referencia,
      inicio: entrada.inicio,
      fim: entrada.fim,
      nivelDoPlano: entrada.nivelDoPlano,
      // Cortesia não tem modalidade: ninguém pagou nada.
      modalidade: null,
      atualizadoEm: entrada.inicio,
    })
    .onConflictDoUpdate({
      target: [direitosAcesso.origem, direitosAcesso.referenciaOrigem, direitosAcesso.produto],
      set: {
        usuarioId: entrada.usuarioId,
        inicio: entrada.inicio,
        fim: entrada.fim,
        nivelDoPlano: entrada.nivelDoPlano,
        revogadoEm: null,
        motivoRevogacao: null,
        atualizadoEm: entrada.inicio,
      },
    })
    .returning({ id: direitosAcesso.id })
  if (!direito) throw new Error('não foi possível conceder cortesia')
  return direito.id
}
