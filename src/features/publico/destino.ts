import { destinoInternoSeguro } from '@/modules/plataforma/auth/requisicao'

/**
 * Só caminho INTERNO volta. `destinoInternoSeguro` (módulo do back) recusa
 * `//host`, mas aceita `/\host` — e o parser de URL do navegador trata `\`
 * como `/` em http, então `/\evil.com` sai do domínio. Aqui a checagem é
 * feita resolvendo contra uma origem descartável e exigindo que o host
 * continue sendo ela; o resultado ainda passa pelo helper do back, para que a
 * regra dele (a que o servidor real aplicar) também valha.
 */
export function destinoSeguro(bruto: string | null | undefined, padrao = '/'): string {
  if (!bruto) return padrao
  if (bruto.includes('\\')) return padrao
  try {
    const base = 'https://interno.invalid'
    const url = new URL(bruto, base)
    if (url.origin !== base || !bruto.startsWith('/')) return padrao
    return destinoInternoSeguro(`${url.pathname}${url.search}${url.hash}`)
  } catch {
    return padrao
  }
}

/**
 * Caminho interno para um LINK (o "Voltar" de /assinar), sem a allowlist do
 * login. A allowlist existe para o `redirect` de uma Server Action não virar
 * open redirect; um `href` que só pode apontar para dentro do app não precisa
 * dela — e com ela o "Voltar" de quem veio do Ao Vivo ou da Gestão caía
 * sempre em `/`. A defesa é a mesma de `destinoSeguro`: resolver contra uma
 * origem descartável e exigir que o host continue sendo ela (pega `//host`,
 * `/\host`, `https://…`, `javascript:`).
 */
export function caminhoInterno(bruto: string | null | undefined, padrao = '/'): string {
  if (!bruto) return padrao
  // Barra invertida e caractere de controle não têm uso legítimo num caminho
  // do app, e o parser os reescreve ("\" vira "/", TAB/LF somem) — recusar
  // na entrada é mais simples que acompanhar cada reescrita.
  if (/[\\\u0000-\u001f\u007f]/.test(bruto)) return padrao
  try {
    const base = 'https://interno.invalid'
    const url = new URL(bruto, base)
    if (url.origin !== base) return padrao
    const caminho = `${url.pathname}${url.search}${url.hash}`
    // A origem é conferida ANTES da normalização de `.`/`..`: `/.//evil.com`
    // passa nela e vira o pathname `//evil.com` — protocol-relative, fora do
    // app (fix round 1 da T7). Por isso o RESULTADO também é conferido: uma
    // barra só no começo.
    if (!caminho.startsWith('/') || caminho.startsWith('//') || caminho.startsWith('/\\')) return padrao
    return caminho
  } catch {
    return padrao
  }
}

/** O primeiro valor de um parâmetro de busca, ou undefined. */
export function parametro(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor
}
