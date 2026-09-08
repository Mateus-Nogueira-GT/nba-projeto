export function validarDestinoComercial(valor: string, hostsPermitidos: readonly string[]): string {
  let url: URL
  try {
    url = new URL(valor)
  } catch {
    throw new Error('Destino comercial inválido')
  }

  const hosts = new Set(hostsPermitidos.map((host) => host.trim().toLowerCase()))
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    !hosts.has(url.hostname.toLowerCase())
  ) {
    throw new Error('Destino comercial inválido')
  }

  return url.toString()
}

export function acrescentarParametrosComerciais(
  destino: string,
  parametros: Readonly<Record<string, string>>,
): string {
  const url = new URL(destino)
  for (const [chave, valor] of Object.entries(parametros)) {
    if (chave && valor && !url.searchParams.has(chave)) url.searchParams.set(chave, valor)
  }
  return url.toString()
}
