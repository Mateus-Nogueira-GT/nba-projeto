/**
 * O QUE IMPEDE A LLM DE MENTIR NA TELA.
 *
 * Função PURA, sem I/O — é o portão entre "a LLM respondeu" e "o assinante
 * leu". Três recusas, todas por motivo de produto:
 *
 *  1. "probabilidade" — o percentual do produto é NOTA DE CONFIANÇA. A palavra
 *     na tela contradiz /como-funciona e a regra do design system.
 *  2. número que não está nos fatos — o pior defeito possível deste produto é
 *     a IA inventar "média de 31,4" e alguém apostar em cima disso.
 *  3. tamanho — card tem largura; texto que estoura vira layout quebrado.
 *
 * Reprovar NUNCA é erro: o card sai sem narrativa e a contagem sobe.
 */

export type ResultadoValidacao =
  | { ok: true; texto: string }
  | {
      ok: false
      motivo:
        | 'probabilidade'
        | 'numero-inventado'
        | 'muito-longo'
        | 'vazio'
        /**
         * Citou quem a metodologia NÃO apitou sem dizer que está fora da
         * lista (ADR-0012). Motivo PRÓPRIO e não 'numero-inventado': quando
         * alguém for olhar `llm_chamadas` para entender por que as respostas
         * sumiram, "o ranking passou por apito" e "o modelo inventou um
         * número" são investigações diferentes.
         */
        | 'sem-marca-fora-da-lista'
    }

/**
 * As raízes que reprovam o texto. Andam de mãos dadas com
 * `PALAVRAS_PROIBIDAS` em `regras-do-texto.ts` — o teste de deriva confere que
 * toda palavra dita ao modelo é de fato reprovada aqui.
 *
 *   probabilidad|prov[áa]ve  probabilidade(s), provável, prováveis
 *   chance                   chance(s) — a taxa de acerto é passado observado,
 *                            não previsão (ADR-0012)
 *   vai bater                a promessa de resultado, na forma que o modelo
 *                            mais escreve
 */
const PROIBIDAS = /probabilidad|prov[áa]ve|chance|vai bater/i

/**
 * Números "livres" no texto: cercados por não-dígito, com decimal opcional em
 * vírgula ou ponto. `1º` não casa (o `º` cola no dígito e a âncora exige
 * fronteira), e é isso que evita reprovar ordinais.
 *
 * Lookahead `(?!\d|[.,]\d|[º°ª])`: exclui dígito nu, vírgula/ponto seguido de
 * dígito (corte de decimal) e marcadores de ordinal. Ponto final de frase é
 * permitido, então número no fim "Media de 25.7." é detectado.
 */
const NUMERO_NO_TEXTO = /(?<![\d.,º°ªa-zA-Z])(\d+(?:[.,]\d+)?)(?!\d|[.,]\d|[º°ª])/g

/** "25,7" e "25.7" são o mesmo número — o texto é pt-BR, os fatos são float. */
function comoNumero(bruto: string): number {
  return Number(bruto.replace(',', '.'))
}

/**
 * Os números "livres" de um texto, na mesma leitura que a validação usa.
 *
 * Exportada porque quem MONTA os fatos precisa derivar daí a lista de números
 * permitidos: se a extração aqui e a de lá fossem duas, elas divergiriam — e a
 * divergência apareceria como resposta certa recusada, não como erro de teste.
 * Mesma lição de `regras-do-texto.ts`.
 */
export function numerosDoTexto(texto: string): number[] {
  return [...texto.matchAll(NUMERO_NO_TEXTO)].map((achado) => comoNumero(achado[1]!))
}

export function validarTexto(
  texto: string,
  fatos: { numeros: number[]; limiteCaracteres: number },
): ResultadoValidacao {
  const aparado = texto.trim()
  if (aparado.length === 0) return { ok: false, motivo: 'vazio' }
  if (aparado.length > fatos.limiteCaracteres) return { ok: false, motivo: 'muito-longo' }
  if (PROIBIDAS.test(aparado)) return { ok: false, motivo: 'probabilidade' }

  // Comparação com tolerância: o texto pode arredondar 25.70 para 25,7.
  const permitidos = fatos.numeros
  for (const valor of numerosDoTexto(aparado)) {
    const conhecido = permitidos.some((n) => Math.abs(n - valor) < 0.05)
    if (!conhecido) return { ok: false, motivo: 'numero-inventado' }
  }

  return { ok: true, texto: aparado }
}
