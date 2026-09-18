import { intervaloDoDia } from '../../dominio/rodada'
import type { Sku } from './sku'
import { SKUS } from './sku'

/**
 * OS PREÇOS — decisão comercial, nunca código (decisão 13 da spec).
 *
 * Mudar preço aqui é mudar env. Um número monetário escrito num componente é
 * defeito: no dia da promoção alguém teria que abrir um `.tsx` e fazer
 * deploy.
 *
 * O fuso entra por ARGUMENTO, e não é detalhe de estilo: `TEMPORADA_FIM` é um
 * DIA ("último dia inclusive"), e um dia só vira instante dentro de um fuso.
 * Quem sabe o fuso é o ruleset, que vive em `entrega/` — camada que
 * `plataforma/` não importa. Então quem lê o ruleset (as rotas e as páginas)
 * passa o fuso para cá.
 */
export type PrecoDoSku = {
  centavos: number
  /** O preço "de", só exibição. Nulo quando não há promoção a mostrar. */
  deCentavos: number | null
}

export type PrecosDosPlanos = {
  porSku: Record<Sku, PrecoDoSku>
  /**
   * O INSTANTE em que a temporada vendida acaba: a meia-noite SEGUINTE ao dia
   * de `TEMPORADA_FIM`, no fuso da rodada. `TEMPORADA_FIM=2027-06-30` quer
   * dizer "o dia 30 inteiro está incluído", e um direito que terminasse
   * 00:00 do dia 30 tiraria o último dia de quem pagou por ele.
   */
  fimDaTemporada: Date
}

const ENV_DO_SKU: Record<Sku, { valor: string; de?: string }> = {
  MVP_MENSAL: { valor: 'PLANO_MVP_MENSAL_CENTAVOS', de: 'PLANO_MVP_MENSAL_DE_CENTAVOS' },
  MVP_TEMPORADA: { valor: 'PLANO_MVP_TEMPORADA_CENTAVOS' },
  ALL_STAR_MENSAL: {
    valor: 'PLANO_ALL_STAR_MENSAL_CENTAVOS',
    de: 'PLANO_ALL_STAR_MENSAL_DE_CENTAVOS',
  },
  ALL_STAR_TEMPORADA: { valor: 'PLANO_ALL_STAR_TEMPORADA_CENTAVOS' },
}

const MINIMO_CENTAVOS = 100
const MAXIMO_CENTAVOS = 10_000_000

/**
 * Só inteiro dentro da faixa. A faixa é a mesma que `configuracaoProdutoPago`
 * já usava: abaixo de R$ 1,00 e acima de R$ 100.000,00 é dedo no teclado, não
 * decisão comercial. `Number('59,90')` e `Number('')` não são inteiros
 * seguros e caem aqui junto.
 */
function centavosLidos(bruto: string | undefined): number | null {
  const numero = Number((bruto ?? '').trim())
  if (!Number.isSafeInteger(numero)) return null
  return numero >= MINIMO_CENTAVOS && numero <= MAXIMO_CENTAVOS ? numero : null
}

function diaLido(bruto: string | undefined, fuso: string): Date | null {
  const dia = (bruto ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return null
  const comoUtc = new Date(`${dia}T00:00:00.000Z`)
  // `2027-02-31` casa com a regex e é um dia que não existe. O parser ISO do
  // JS não devolve Invalid Date para essa forma — ele rola em silêncio para o
  // próximo dia válido (aqui, 3 de março). Comparar de volta com o texto
  // original é o que pega o rolamento; sem isso a temporada acabaria num dia
  // que ninguém escolheu.
  if (comoUtc.toISOString().slice(0, 10) !== dia) return null
  return intervaloDoDia(dia, fuso).fim
}

export function precosDosPlanos(
  fuso: string,
  ambiente: Readonly<Record<string, string | undefined>> = process.env,
): PrecosDosPlanos | null {
  const faltantes: string[] = []
  const porSku = {} as Record<Sku, PrecoDoSku>

  for (const sku of SKUS) {
    const nomes = ENV_DO_SKU[sku]
    const centavos = centavosLidos(ambiente[nomes.valor])
    if (centavos === null) {
      faltantes.push(nomes.valor)
      continue
    }
    const de = nomes.de ? centavosLidos(ambiente[nomes.de]) : null
    // "De R$ 50,00 por R$ 60,00" é o contrário de uma promoção: o "de" só
    // aparece quando é MAIOR que o preço cobrado.
    porSku[sku] = { centavos, deCentavos: de !== null && de > centavos ? de : null }
  }

  const fimDaTemporada = diaLido(ambiente.TEMPORADA_FIM, fuso)
  if (!fimDaTemporada) faltantes.push('TEMPORADA_FIM')

  if (faltantes.length > 0) {
    // Com o checkout LIGADO, faltar preço é quebrar a venda em silêncio: a
    // tela mostraria plano sem valor, ou pior, cobraria o que não foi
    // decidido. Falha alta. Com o checkout desligado (preview, teste,
    // produção de hoje), não há venda para quebrar — devolver null deixa a
    // página de comparação funcionar sem os preços.
    if (ambiente.MERCADOPAGO_CHECKOUT_ENABLED === 'true') {
      throw new Error(`checkout habilitado com preços incompletos: ${faltantes.join(', ')}`)
    }
    return null
  }

  // `fimDaTemporada` só chega aqui não-nulo: se `diaLido` tivesse devolvido
  // null, o `if (!fimDaTemporada)` acima já teria empurrado 'TEMPORADA_FIM'
  // para `faltantes` e o bloco anterior já teria retornado. O `!` só declara
  // pro TypeScript o que o controle de fluxo já garante — mesmo motivo do
  // `as Record<Sku, PrecoDoSku>` de `porSku` acima.
  return { porSku, fimDaTemporada: fimDaTemporada! }
}

const TRINTA_DIAS_MS = 30 * 86_400_000

/**
 * O AVISO DE `TEMPORADA_FIM` (spec §14).
 *
 * "Ninguém vai lembrar de mudar em junho" — então o painel lembra. Puro, e
 * `agora` entra por argumento: um texto que dependesse do relógio interno não
 * teria como ser testado nas três fases.
 */
export function avisoDaTemporada(fimDaTemporada: Date | null, agora: Date): string | null {
  if (!fimDaTemporada) return null
  const restanteMs = fimDaTemporada.getTime() - agora.getTime()
  if (restanteMs > TRINTA_DIAS_MS) return null
  if (restanteMs <= 0) {
    return 'A temporada vendida terminou: o pacote de temporada não está mais sendo oferecido no seletor de planos. Atualize TEMPORADA_FIM para vender a próxima.'
  }
  const dias = Math.ceil(restanteMs / 86_400_000)
  return `A temporada vendida termina em ${dias} ${dias === 1 ? 'dia' : 'dias'}. Depois disso o seletor deixa de oferecer o pacote de temporada — atualize TEMPORADA_FIM antes.`
}
