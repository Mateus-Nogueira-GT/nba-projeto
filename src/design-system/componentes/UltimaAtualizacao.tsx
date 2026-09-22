import { semantico } from '../tokens/semantico'

export type UltimaAtualizacaoProps = {
  em: Date
  /** O que foi medido: "classificação", "box score", "ao vivo". */
  fonte: string
  /** Referência para calcular "há quanto tempo". Injetada, nunca `Date.now()`. */
  agora: Date
  /**
   * Fuso de exibição. Obrigatório de propósito: sem ele o componente usa o do
   * SERVIDOR, que na Vercel é UTC — e o rodapé de toda a aba de estatísticas
   * mostrava três horas a mais para o assinante brasileiro.
   */
  fuso: string
  /**
   * Temporada que a tela está mostrando — quando ela NÃO é a do calendário.
   *
   * Entre o lançamento e a primeira bola da temporada nova a consulta mostra a
   * anterior (`temporadaExibida`). Sem dizê-lo, o assinante lê média de
   * 2025-26 achando que é de hoje.
   */
  temporada?: string
}

/**
 * Uma marca em `em: new Date(0)` significa "não há dado para datar".
 * Exibir 01/01/1970 seria pior do que dizer que não há dado.
 */
function semDado(em: Date): boolean {
  return em.getTime() === 0
}

function formatar(em: Date, fuso: string): string {
  return em.toLocaleString('pt-BR', { timeZone: fuso, dateStyle: 'short', timeStyle: 'short' })
}

/**
 * Distância em linguagem corrente.
 *
 * O horário absoluto sozinho não responde à pergunta que o usuário faz — ele
 * teria que consultar o relógio e subtrair. "há 3 min" responde direto; o
 * absoluto fica ao lado para quem quiser conferir.
 */
function decorrido(em: Date, agora: Date): string {
  const segundos = Math.max(0, Math.round((agora.getTime() - em.getTime()) / 1000))
  if (segundos < 60) return 'agora mesmo'

  const minutos = Math.round(segundos / 60)
  if (minutos < 60) return `há ${minutos} min`

  const horas = Math.round(minutos / 60)
  if (horas < 24) return `há ${horas} h`

  const dias = Math.round(horas / 24)
  return `há ${dias} d`
}

/**
 * ÚLTIMA ATUALIZAÇÃO — obrigatória em toda tela da aba de estatísticas.
 *
 * Existe como componente único, e não como um `<footer>` copiado em cada
 * página, porque o requisito é "sem exceção" (docs/00-visao.md). Um trecho
 * repetido em cinco arquivos vira quatro trechos e um esquecimento; uma peça
 * só é testável de uma vez.
 *
 * `agora` entra por parâmetro para que o componente seja determinístico —
 * chamar o relógio aqui dentro tornaria o teste dependente do segundo em que
 * roda.
 */
export function UltimaAtualizacao({ em, fonte, agora, fuso, temporada }: UltimaAtualizacaoProps) {
  const vazio = semDado(em)

  return (
    <footer
      data-testid="ultima-atualizacao"
      style={{
        marginTop: 24,
        paddingTop: 12,
        borderTop: `1px solid ${semantico.divisor}`,
        fontSize: 12,
        color: semantico.textoSecundario,
        display: 'flex',
        gap: 6,
        flexWrap: 'wrap',
      }}
    >
      <span>Última atualização:</span>
      {vazio ? (
        <strong>sem dado para exibir</strong>
      ) : (
        <>
          <strong>{decorrido(em, agora)}</strong>
          <span aria-hidden>·</span>
          {/* O absoluto acompanha o relativo: um serve para decidir, o outro
              para conferir. */}
          <time dateTime={em.toISOString()}>{formatar(em, fuso)}</time>
          <span aria-hidden>·</span>
          <span>{fonte}</span>
        </>
      )}
      {temporada !== undefined && (
        <>
          <span aria-hidden>·</span>
          <span data-testid="temporada-exibida">temporada {temporada}</span>
        </>
      )}
    </footer>
  )
}
