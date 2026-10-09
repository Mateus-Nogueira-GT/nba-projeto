import { isIP } from 'node:net'
import { headers } from 'next/headers'

const DESTINO_SEGURO = '/'
// `/abrir` é a porta da frente: ela decide entre Ao Vivo e Lista. Sem ela aqui,
// o destino padrão do login cairia silenciosamente em `/` e a abertura nunca
// aconteceria.
// `/admin` é o índice do painel (destino do login administrativo desde a
// integração do front v2); `/admin/usuarios` fica porque links antigos ainda
// apontam para ele.
const DESTINOS_POS_LOGIN = new Set(['/', '/abrir', '/assinar', '/conta', '/admin', '/admin/usuarios'])
// A área de afiliados e o convite de parceiro (auditoria de 26/09): sem eles
// aqui, quem entrava ou criava conta a partir do convite caía em `/` e perdia
// o convite. O caminho do convite é casado por FORMA, não por prefixo: o
// token é exatamente o que `criarConvite` gera — 32 bytes em base64url, 43
// caracteres de [A-Za-z0-9_-] —, então `..`, `/`, `?` e `#` nunca cabem nele.
//
// As telas para onde o portão (`exigirNivel`) manda quem não está logado
// (pente fino de 09/10, achado 6): sem elas aqui, o login e o aceite da
// metodologia reduziam `?destino=/fire-live` a `/abrir`, e o link que o
// próprio produto gera ficava inerte. Também por FORMA: cada segmento é
// [A-Za-z0-9_-], não vazio, e a data dos resultados é AAAA-MM-DD — `..`, `?`,
// `#`, `//`, `\` e controle nunca cabem. A query dos filtros de resultados
// fica de fora de propósito: volta a data, sem os filtros.
const SEGMENTO = '[A-Za-z0-9_-]{1,100}'
const DESTINOS_POS_LOGIN_POR_FORMA = [
  /^\/afiliados$/,
  /^\/afiliados\/convite\/[A-Za-z0-9_-]{43}$/,
  /^\/fire-live$/,
  /^\/gestao$/,
  new RegExp(`^/estatisticas(/${SEGMENTO}){0,4}$`),
  /^\/resultados\/\d{4}-\d{2}-\d{2}$/,
  new RegExp(`^/apito/${SEGMENTO}$`),
]

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
  if (DESTINOS_POS_LOGIN.has(valor)) return valor
  return DESTINOS_POS_LOGIN_POR_FORMA.some((forma) => forma.test(valor)) ? valor : DESTINO_SEGURO
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
