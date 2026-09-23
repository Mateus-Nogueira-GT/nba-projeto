import { and, desc, gte, inArray } from 'drizzle-orm'

import { logFalhas } from '@/modules/dominio/db/schema'
import type { Db } from '@/modules/dominio/db/tipos'

import type { NotificadorOperacional } from './notificador'

/**
 * Falhas que ninguém via: push que venceu antes de chegar (W2-2) e
 * pagamento aprovado que não liberou acesso (P3 — D6: sem regra nova, só o
 * alerta). Quem detecta grava em `log_falhas`; a saúde (cron de 5 min)
 * soma a janela e avisa uma vez por origem, sem realerta por 30 min.
 * Janelas operacionais, não regra de estratégia: ficam aqui.
 */
export type OrigemOperacional = 'push-expirado' | 'pagamento-aprovado-sem-direito'
const ORIGENS: OrigemOperacional[] = ['push-expirado', 'pagamento-aprovado-sem-direito']
const ORIGEM_DO_ALERTA = 'alerta-operacional'
const JANELA_MS = 10 * 60_000
const REALERTA_MS = 30 * 60_000

const TITULOS: Record<OrigemOperacional, string> = {
  'push-expirado': 'Push vencendo antes de chegar',
  'pagamento-aprovado-sem-direito': 'Pagamento aprovado sem acesso liberado (P3)',
}

export async function registrarFalhaOperacional(
  db: Db,
  origem: OrigemOperacional,
  contexto: Record<string, unknown>,
  agora: Date,
): Promise<void> {
  await db.insert(logFalhas).values({
    origem,
    severidade: 'ERRO',
    mensagem: TITULOS[origem],
    contextoJson: contexto,
    ocorridoEm: agora,
  })
}

/**
 * Ponte para a rota de entrega de push (fix round 1): a rota roda dentro do
 * `handleCallback` da fila. Se o INSERT em `log_falhas` falhar (timeout do
 * banco, p.ex.) DEPOIS que `enviarLotePush` já entregou, deixar a exceção
 * escapar faria a mensagem não confirmar, a fila reentregar o mesmo
 * messageId, e `enviarLotePush` reenviar o lote inteiro — push duplicado
 * pra quem já recebeu (regra 5 do CLAUDE.md, e contradiz o comentário da
 * própria rota: "confirmada — sem reenviar a quem já recebeu"). Um erro ao
 * REGISTRAR o alerta não pode gerar um segundo incidente pior que o
 * primeiro: loga e segue.
 */
export async function registrarExpiradosSemFalhar(
  db: Db,
  contagens: { expirados?: number },
  canal: string | null,
  agora: Date,
  extra: Record<string, unknown> = {},
): Promise<void> {
  if (!contagens.expirados) return
  try {
    await registrarFalhaOperacional(
      db,
      'push-expirado',
      { quantidade: contagens.expirados, canal, ...extra },
      agora,
    )
  } catch (erro) {
    console.error(
      JSON.stringify({
        evento: 'falha_operacional_nao_registrada',
        origem: 'push-expirado',
        erro: String(erro),
      }),
    )
  }
}

/**
 * O evento que venceu ANTES de virar lote (W2-2/W2-5): se `push-eventos`
 * atrasar, `expandirEventoPush` devolve `expirado` e nenhum assinante recebe
 * — e antes ninguém era avisado, só saía um log. Conta como UMA falha, com
 * `nivel: 'evento'` para distinguir do vencimento por lote. Mesma garantia da
 * função acima: nunca lança, a expansão confirma de qualquer jeito.
 */
export async function registrarEventoExpiradoSemFalhar(
  db: Db,
  resultado: { expirado: boolean },
  canal: string | null,
  agora: Date,
): Promise<void> {
  if (!resultado.expirado) return
  await registrarExpiradosSemFalhar(db, { expirados: 1 }, canal, agora, { nivel: 'evento' })
}

export async function avaliarFalhasOperacionais(
  db: Db,
  agora: Date,
  notificador: NotificadorOperacional,
): Promise<{ origem: OrigemOperacional; quantidade: number }[]> {
  const desde = new Date(agora.getTime() - Math.max(JANELA_MS, REALERTA_MS))
  const linhas = await db
    .select({
      origem: logFalhas.origem,
      contextoJson: logFalhas.contextoJson,
      ocorridoEm: logFalhas.ocorridoEm,
    })
    .from(logFalhas)
    .where(
      and(
        inArray(logFalhas.origem, [...ORIGENS, ORIGEM_DO_ALERTA]),
        gte(logFalhas.ocorridoEm, desde),
      ),
    )
    .orderBy(desc(logFalhas.ocorridoEm))

  const alertadas = new Set(
    linhas
      .filter(
        (l) =>
          l.origem === ORIGEM_DO_ALERTA && l.ocorridoEm.getTime() > agora.getTime() - REALERTA_MS,
      )
      .map((l) => (l.contextoJson as { origem?: string } | null)?.origem),
  )

  const emitidos: { origem: OrigemOperacional; quantidade: number }[] = []
  for (const origem of ORIGENS) {
    if (alertadas.has(origem)) continue
    const recentes = linhas.filter(
      (l) => l.origem === origem && l.ocorridoEm.getTime() > agora.getTime() - JANELA_MS,
    )
    if (recentes.length === 0) continue
    const quantidade = recentes.reduce(
      (soma, l) => soma + ((l.contextoJson as { quantidade?: number } | null)?.quantidade ?? 1),
      0,
    )
    await db.insert(logFalhas).values({
      origem: ORIGEM_DO_ALERTA,
      severidade: 'ERRO',
      mensagem: TITULOS[origem],
      contextoJson: { origem, quantidade },
      ocorridoEm: agora,
    })
    await notificador.enviar({
      severidade: 'ALTA',
      titulo: TITULOS[origem],
      corpo: `${quantidade} ocorrência(s) nos últimos 10 min. Detalhes em log_falhas (origem ${origem}).`,
    })
    emitidos.push({ origem, quantidade })
  }
  return emitidos
}
