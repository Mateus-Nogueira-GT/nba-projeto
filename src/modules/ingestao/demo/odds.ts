import { inArray } from 'drizzle-orm'

import { casas, oddsAgregada, oddsSnapshot } from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'
import { lerFeed } from '../../entrega/lista-secreta'
import { faixaEstatica } from '../../motor/atributos'
import { agregar } from '../../motor/odds/agregar'
import type { Ruleset } from '../../motor/ruleset/schema'

/**
 * CASAS DE APOSTA DA DEMONSTRAÇÃO — nomes fictícios de propósito.
 *
 * Usar "Bet365" ou "Betano" numa tela de apresentação insinua um contrato que
 * não existe (G4 continua aberto). Nomes neutros deixam claro que a integração
 * é a arquitetura, não o parceiro.
 */
export const CASAS_DEMO = ['Casa Alfa', 'Casa Beta', 'Casa Gama'] as const

/**
 * Escreve cotações e deixa a agregação REAL do motor produzir a faixa.
 *
 * O documento do CJ é explícito: a plataforma não tem acesso à odd exata da
 * casa do usuário e trabalha com uma aproximação. Por isso as três casas
 * discordam entre si dentro da faixa de referência do ruleset — é a discordância
 * que dá sentido à mediana, e é a mediana que a tela mostra.
 */
export async function semearOdds(
  db: Db,
  ruleset: Ruleset,
  dataReferencia: string,
  agora: Date,
): Promise<number> {
  const feed = await lerFeed(db, dataReferencia)
  if (feed === null) return 0

  for (const nome of CASAS_DEMO) {
    await db
      .insert(casas)
      .values({ nome, tipoApi: 'demo', ativa: true })
      .onConflictDoNothing({ target: casas.nome })
  }
  const idPorCasa = new Map((await db.select().from(casas)).map((c) => [c.nome, c.id] as const))

  // `odds_snapshot` é série temporal e não tem UNIQUE — reexecutar o seed
  // empilharia cotação em cima de cotação. Limpar o dia antes de escrever é o
  // que mantém a promessa de idempotência do seed.
  const idsDeHoje = [...new Set(feed.conteudo.itens.map((i) => i.jogoId))]
  if (idsDeHoje.length > 0) {
    await db.delete(oddsSnapshot).where(inArray(oddsSnapshot.jogoId, idsDeHoje))
  }

  let linhas = 0
  for (const item of feed.conteudo.itens) {
    if (item.linha === null) continue

    const referencia = faixaEstatica(item.nivelJogador, item.atributo, item.linha, ruleset)
    if (referencia === undefined) continue

    // Espalha as casas DENTRO da faixa de referência, em passos iguais. Sem
    // sorteio: reexecutar o seed precisa dar a mesma odd.
    const [min, max] = referencia
    const passo = (max - min) / (CASAS_DEMO.length + 1)
    const cotacoes = CASAS_DEMO.map((casa, k) => ({
      casa,
      oddOver: Math.round((min + passo * (k + 1)) * 100) / 100,
    }))

    for (const c of cotacoes) {
      const casaId = idPorCasa.get(c.casa)
      if (!casaId) continue
      await db.insert(oddsSnapshot).values({
        casaId,
        jogoId: item.jogoId,
        jogadorId: item.jogadorId,
        atributo: item.atributo,
        linha: item.linha.toFixed(1),
        oddOver: c.oddOver.toFixed(3),
        oddUnder: null,
        capturadoEm: agora,
      })
    }

    const faixa = agregar(cotacoes, item.nivelJogador, item.atributo, item.linha, ruleset)
    if (faixa === null) continue

    await db
      .insert(oddsAgregada)
      .values({
        jogoId: item.jogoId,
        jogadorId: item.jogadorId,
        atributo: item.atributo,
        linha: item.linha.toFixed(1),
        oddMin: faixa.min.toFixed(3),
        oddMax: faixa.max.toFixed(3),
        oddMediana: faixa.mediana.toFixed(3),
        // Na demo a média acompanha a mediana — o suficiente para o rodapé
        // ODD MÉDIA do card existir na apresentação.
        oddMedia: faixa.mediana.toFixed(3),
        qtdCasas: faixa.qtdCasas,
        origem: faixa.origem,
        calculadoEm: agora,
      })
      .onConflictDoUpdate({
        target: [oddsAgregada.jogoId, oddsAgregada.jogadorId, oddsAgregada.atributo, oddsAgregada.linha],
        set: {
          oddMin: faixa.min.toFixed(3),
          oddMax: faixa.max.toFixed(3),
          oddMediana: faixa.mediana.toFixed(3),
          qtdCasas: faixa.qtdCasas,
          origem: faixa.origem,
          calculadoEm: agora,
        },
      })
    linhas += 1
  }

  return linhas
}
