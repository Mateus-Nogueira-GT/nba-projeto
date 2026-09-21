import { isIP } from 'node:net'
import { headers } from 'next/headers'

const DESTINO_SEGURO = '/'
// `/abrir` é a porta da frente: ela decide entre Ao Vivo e Lista. Sem ela aqui,
// o destino padrão do login cairia silenciosamente em `/` e a abertura nunca
// aconteceria.
const DESTINOS_POS_LOGIN = new Set(['/', '/abrir', '/assinar', '/conta', '/admin/usuarios'])

type Cabecalhos = Pick<Headers, 'get'>

/**
 * Aceita apenas destinos que o produto oferece depois do login.
 *
 * A allowlist evita que uma Server Action invocada diretamente transforme o
 * redirect em open redirect, mesmo com URL absoluta, `//host` ou caracteres
 * de controle.
 */
export function destinoInternoSeguro(valor: string): string {
  const temCaractereInvalido = [...valor].some((caractere) => {
    const codigo = caractere.charCodeAt(0)
    return codigo <= 31 || codigo === 127 || caractere === '\\'
  })
  if (temCaractereInvalido) return DESTINO_SEGURO
  return DESTINOS_POS_LOGIN.has(valor) ? valor : DESTINO_SEGURO
}

/**
 * Extrai o IP somente quando a requisição atravessou a infraestrutura Vercel.
 * A Vercel sobrescreve estes cabeçalhos na borda; fora dela, qualquer cliente
 * conseguiria forjá-los e por isso o resultado é `null`.
 */
export function ipConfiavelDosCabecalhos(
  cabecalhos: Cabecalhos,
  ambiente: { vercel: boolean },
): string | null {
  if (!ambiente.vercel) return null

  const bruto = cabecalhos.get('x-vercel-forwarded-for') ?? cabecalhos.get('x-forwarded-for') ?? ''
  const candidato = bruto.split(',')[0]?.trim() ?? ''
  return isIP(candidato) > 0 ? candidato : null
}

/** IP da invocação atual do App Router, nunca lido do formulário. */
export async function ipDaRequisicao(): Promise<string | null> {
  return ipConfiavelDosCabecalhos(await headers(), { vercel: process.env.VERCEL === '1' })
}
