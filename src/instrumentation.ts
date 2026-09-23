import type { Instrumentation } from 'next'

/**
 * Todo erro de requisição sai numa linha JSON procurável nos logs da Vercel
 * (W2-5). Não grava no banco: um erro de banco não pode gerar outro.
 */
export const onRequestError: Instrumentation.onRequestError = async (erro, requisicao, contexto) => {
  const e = erro instanceof Error ? erro : new Error(String(erro))
  console.error(
    JSON.stringify({
      evento: 'erro_de_requisicao',
      rota: contexto.routePath,
      tipo: contexto.routeType,
      metodo: requisicao.method,
      caminho: requisicao.path.split('?')[0],
      mensagem: e.message.slice(0, 500),
      digest: (e as Error & { digest?: string }).digest ?? null,
    }),
  )
}
