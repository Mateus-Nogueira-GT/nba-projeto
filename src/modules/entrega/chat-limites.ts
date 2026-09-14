/**
 * OS FREIOS DO CHAT — à parte de `chat.ts`.
 *
 * `chat-contexto.ts` precisa destes valores para escrevê-los nos fatos (o
 * assinante pergunta "quantas perguntas eu tenho por dia?" e o agente só pode
 * responder um número que esteja nos fatos); `chat.ts` precisa deles para
 * aplicar os freios de verdade. Um import cruzado entre os dois fecharia um
 * ciclo, que a regra `sem-dependencia-circular` do `boundaries` reprova — daí
 * os freios morarem num módulo à parte, de onde os dois leem. `chat.ts`
 * reexporta os símbolos públicos para quem já importava deles de lá.
 */

const COTA_PADRAO = 20
export const LIMITE_RESPOSTA = 1200

/**
 * Tamanho máximo da pergunta, em caracteres.
 *
 * É uma pergunta, não uma redação. Sem teto, o texto do assinante ia inteiro
 * para o prompt (tokens de entrada que ELE escolhe) e para uma coluna `text`
 * sem limite — os dois custos crescem com o que o outro lado digitar. Meio
 * milhar de caracteres é largo para qualquer pergunta sobre um card.
 */
export const LIMITE_PERGUNTA = 500

/**
 * Perguntas por minuto, por assinante.
 *
 * A cota diária sozinha não impede queimá-la inteira em cinco segundos, nem
 * um laço de script fazendo vinte chamadas pagas de uma vez. Cinco por minuto
 * é uma pergunta a cada doze segundos — mais rápido do que dá para LER a
 * resposta anterior; acima disso não é assinante, é automação.
 *
 * Medido como a cota: COUNT das mensagens do próprio usuário na janela, sem
 * contador paralelo. `plataforma/auth/rate-limit.ts` NÃO serve aqui — ele é
 * do login, chaveado por identificador e sucesso da tentativa.
 */
export const LIMITE_POR_MINUTO = 5

export function configuracaoChat(ambiente: NodeJS.ProcessEnv = process.env): {
  habilitado: boolean
  cotaDiaria: number
} {
  const bruta = Number(ambiente.CHAT_COTA_DIARIA)
  return {
    // Só a string exata liga: qualquer outro valor mantém desligado.
    habilitado: ambiente.CHAT_HABILITADO === 'true',
    // Valor inválido cai no padrão. Virar 0 trancaria todo mundo fora; virar
    // NaN liberaria geral — os dois acidentes acontecem por env mal digitado.
    cotaDiaria: Number.isFinite(bruta) && bruta > 0 ? Math.floor(bruta) : COTA_PADRAO,
  }
}
