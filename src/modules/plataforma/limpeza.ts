import { and, isNotNull, lt, or } from 'drizzle-orm'

import { pushInscricoes, sessoes, tentativasLogin, tentativasOperacaoConta } from '../dominio/db/schema'
import type { Db } from '../dominio/db/tipos'

const DIA = 24 * 3600_000
const RETENCAO_TENTATIVAS_MS = 7 * DIA
const RETENCAO_SESSOES_MS = 30 * DIA
const RETENCAO_INSCRICOES_MS = 30 * DIA

/**
 * Tabelas que só crescem (W2-6). As contagens de limite leem janelas de até
 * 60 min; sessão encerrada e inscrição invalidada só servem para investigar
 * um caso recente. A trilha de auditoria (eventos_conta, auditoria de push)
 * fica — ela é o registro.
 *
 * Retenção é operacional, não regra de negócio do motor — os números vivem
 * aqui como constantes de infraestrutura, não em `config/ruleset.v1.yaml`.
 * A pendência para o parceiro confirmar os prazos está registrada no §8 do
 * plano desta onda.
 */
export async function limparRegistrosVencidos(db: Db, agora: Date) {
  const antes = (ms: number) => new Date(agora.getTime() - ms)
  const tentativasLoginApagadas = await db
    .delete(tentativasLogin)
    .where(lt(tentativasLogin.tentadoEm, antes(RETENCAO_TENTATIVAS_MS)))
    .returning({ id: tentativasLogin.id })
  const tentativasOperacaoApagadas = await db
    .delete(tentativasOperacaoConta)
    .where(lt(tentativasOperacaoConta.tentadoEm, antes(RETENCAO_TENTATIVAS_MS)))
    .returning({ id: tentativasOperacaoConta.id })
  const sessoesApagadas = await db
    .delete(sessoes)
    // Só sessão ENCERRADA (ou expirada) há tempo suficiente sai. Sessão
    // ativa (encerrada_em nulo) com expira_em no futuro nunca cai aqui —
    // nem que tenha sido criada há muito tempo — porque não é "vencida",
    // é uma sessão em uso.
    .where(
      or(
        and(isNotNull(sessoes.encerradaEm), lt(sessoes.encerradaEm, antes(RETENCAO_SESSOES_MS))),
        lt(sessoes.expiraEm, antes(RETENCAO_SESSOES_MS)),
      ),
    )
    .returning({ id: sessoes.id })
  const inscricoesApagadas = await db
    .delete(pushInscricoes)
    .where(and(isNotNull(pushInscricoes.invalidadaEm), lt(pushInscricoes.invalidadaEm, antes(RETENCAO_INSCRICOES_MS))))
    .returning({ id: pushInscricoes.id })
  return {
    sessoes: sessoesApagadas.length,
    tentativasLogin: tentativasLoginApagadas.length,
    tentativasOperacao: tentativasOperacaoApagadas.length,
    inscricoesInvalidadas: inscricoesApagadas.length,
  }
}
