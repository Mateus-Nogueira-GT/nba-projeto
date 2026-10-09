import { sql } from 'drizzle-orm'

import type { Db } from '../../dominio/db/tipos'
import { motivoParaNaoSemear } from './autossemeadura'

type MotivoDeRecusa = NonNullable<Awaited<ReturnType<typeof motivoParaNaoSemear>>>

export type DecisaoScriptDaDemo = { pode: true } | { pode: false; motivo: MotivoDeRecusa }

/**
 * A GUARDA DOS SCRIPTS MANUAIS DA DEMO (pente fino de 09/10, achado 5).
 *
 * O cron já não semeava por cima de dado real; os scripts sim — e é à mão,
 * com `.env.local` apontando para PRODUÇÃO, que o acidente acontece. Os três
 * (`demo:seed`, `demo:temporada`, `demo:limpar`) passam pela mesma
 * `motivoParaNaoSemear` do cron, inclusive a recusa por
 * `NBA_INGESTAO_HABILITADA=true`: é assim que produção está, e semear ficção
 * ali é o pior acidente possível.
 *
 * `--apagar-dado-real` é a ÚNICA saída, e só do `limpar`: apagar o banco
 * inteiro de propósito é uma decisão que alguém pode tomar; semear ficção
 * por cima de dado real não é. A flag vale para os dois motivos — com a
 * ingestão ligada o dado real está lá do mesmo jeito, e quem a digitou já
 * leu a contagem do que vai sumir.
 */
export async function podeRodarScriptDaDemo(
  db: Db,
  env: Record<string, string | undefined>,
  opcoes: { script: 'seed' | 'temporada' | 'limpar'; apagarDadoReal?: boolean },
): Promise<DecisaoScriptDaDemo> {
  const motivo = await motivoParaNaoSemear(db, env)
  if (motivo === null) return { pode: true }
  if (opcoes.script === 'limpar' && opcoes.apagarDadoReal === true) return { pode: true }
  return { pode: false, motivo }
}

/** A mesma linha que o cron `/api/cron/demo` loga quando recusa. */
export function linhaDeRecusa(motivo: MotivoDeRecusa): string {
  return JSON.stringify({ evento: 'demo_recusada', motivo })
}

/**
 * O que o `demo:limpar` levaria, contado ANTES de apagar.
 *
 * Não é a lista inteira de `limparDemo` — são as tabelas que o operador
 * reconhece e que dizem se aquilo é a demo ou a temporada real. Só lê.
 */
const TABELAS_CONTADAS = [
  'times',
  'jogadores',
  'jogos',
  'estatisticas_jogo',
  'medias_jogador',
  'niveis_versao',
  'apitos',
  'apitos_retroativos',
  'entradas_realizadas',
  'checkpoints_ingestao',
] as const

export async function contarDadoParaLimpar(
  db: Db,
): Promise<Record<(typeof TABELAS_CONTADAS)[number], number>> {
  const contagens = {} as Record<(typeof TABELAS_CONTADAS)[number], number>
  for (const tabela of TABELAS_CONTADAS) {
    const resultado = await db.execute(
      sql`select count(*)::int as n from ${sql.identifier(tabela)}`,
    )
    const linhas = Array.isArray(resultado)
      ? (resultado as Array<{ n: number }>)
      : ((resultado as { rows?: Array<{ n: number }> }).rows ?? [])
    contagens[tabela] = Number(linhas[0]?.n ?? 0)
  }
  return contagens
}
