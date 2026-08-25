import { timingSafeEqual } from 'node:crypto'

type OpcoesCron<T> = {
  rota: string
  tarefa: () => Promise<T>
  segredo?: string
  quantidade?: (resultado: T) => number
}

function respostaErro(status: 401 | 503 | 500, erro: string): Response {
  return Response.json(
    { erro },
    {
      status,
      headers: { 'Cache-Control': 'no-store' },
    },
  )
}

function autorizacaoCorreta(recebida: string | null, segredo: string): boolean {
  if (recebida === null) return false

  const esperado = Buffer.from(`Bearer ${segredo}`)
  const atual = Buffer.from(recebida)
  return esperado.length === atual.length && timingSafeEqual(esperado, atual)
}

function erroSanitizado(erro: unknown): string {
  return erro instanceof Error ? erro.name : 'Erro desconhecido'
}

/**
 * Fronteira única de autenticação dos crons.
 *
 * A callback só é avaliada depois da configuração e do bearer passarem. Isso
 * torna verificável o requisito de não tocar banco, ruleset ou workflow quando
 * `CRON_SECRET` está ausente ou a requisição não está autorizada.
 */
export async function executarCronProtegido<T>(
  requisicao: Request,
  opcoes: OpcoesCron<T>,
): Promise<Response> {
  const inicio = Date.now()
  const segredo = opcoes.segredo ?? process.env.CRON_SECRET

  if (!segredo) {
    console.error(
      JSON.stringify({
        evento: 'cron_recusado',
        rota: opcoes.rota,
        status: 503,
        motivo: 'CRON_SECRET_AUSENTE',
        duracaoMs: Date.now() - inicio,
      }),
    )
    return respostaErro(503, 'cron indisponível')
  }

  if (!autorizacaoCorreta(requisicao.headers.get('authorization'), segredo)) {
    console.warn(
      JSON.stringify({
        evento: 'cron_recusado',
        rota: opcoes.rota,
        status: 401,
        motivo: 'BEARER_INVALIDO',
        duracaoMs: Date.now() - inicio,
      }),
    )
    return respostaErro(401, 'não autorizado')
  }

  try {
    const resultado = await opcoes.tarefa()
    console.info(
      JSON.stringify({
        evento: 'cron_concluido',
        rota: opcoes.rota,
        status: 200,
        quantidade: opcoes.quantidade?.(resultado) ?? null,
        duracaoMs: Date.now() - inicio,
      }),
    )
    return Response.json(resultado, { headers: { 'Cache-Control': 'no-store' } })
  } catch (erro) {
    console.error(
      JSON.stringify({
        evento: 'cron_falhou',
        rota: opcoes.rota,
        status: 500,
        erro: erroSanitizado(erro),
        duracaoMs: Date.now() - inicio,
      }),
    )
    return respostaErro(500, 'falha interna do cron')
  }
}
