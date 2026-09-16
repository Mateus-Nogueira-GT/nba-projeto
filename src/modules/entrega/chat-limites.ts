import type { NivelPago } from '../plataforma/assinatura/nivel-do-plano'

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
 *
 * A cota diária NÃO tem padrão (spec §14, decisão 7): grátis não tem
 * assistente, e MVP/All Star têm cotas DISTINTAS que só o parceiro define.
 * `configuracaoChat` devolve `cotaDiariaPorNivel: null` — e `habilitado:
 * false` junto — enquanto qualquer uma das duas variáveis não estiver
 * definida. Chutar um número aqui gastaria dinheiro do parceiro por conta
 * própria; degradar para desligado é o que a regra 3 do CLAUDE.md pede.
 */

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

function cotaLida(bruta: string | undefined): number | null {
  const n = Number(bruta)
  // Só inteiro positivo vale. Zero trancaria todo mundo fora; NaN liberaria
  // geral — os dois acidentes acontecem por env mal digitado, e aqui viram
  // "chat desligado" em vez de um número inventado.
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null
}

export function configuracaoChat(ambiente: NodeJS.ProcessEnv = process.env): {
  habilitado: boolean
  cotaDiariaPorNivel: Record<NivelPago, number> | null
} {
  const mvp = cotaLida(ambiente.CHAT_COTA_DIARIA_MVP)
  const allStar = cotaLida(ambiente.CHAT_COTA_DIARIA_ALL_STAR)
  const cotaDiariaPorNivel = mvp !== null && allStar !== null ? { MVP: mvp, ALL_STAR: allStar } : null
  return {
    // Só a string exata liga — e só com as DUAS cotas definidas. Cota que
    // falta é decisão comercial que ainda não chegou (spec §14): degradar
    // para "desligado" é melhor que quebrar o boot e melhor que chutar.
    habilitado: ambiente.CHAT_HABILITADO === 'true' && cotaDiariaPorNivel !== null,
    cotaDiariaPorNivel,
  }
}
