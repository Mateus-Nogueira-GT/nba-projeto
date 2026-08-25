import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const derivar = promisify(scrypt) as (
  senha: string,
  sal: Buffer,
  tamanho: number,
  opcoes: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>

/**
 * scrypt do próprio Node — forte, sem dependência nativa para compilar.
 *
 * N=16384 é o custo recomendado para uso interativo. Aumentar N encarece o
 * ataque por força bruta na mesma proporção em que encarece o login legítimo,
 * então o parâmetro fica registrado NO HASH: dá para elevar o custo depois
 * sem invalidar as senhas já gravadas.
 */
const PARAMETROS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }
const TAMANHO_HASH = 64
const TAMANHO_SAL = 16

export async function gerarHash(senha: string): Promise<string> {
  const sal = randomBytes(TAMANHO_SAL)
  const derivado = await derivar(senha.normalize('NFKC'), sal, TAMANHO_HASH, PARAMETROS)

  const { N, r, p } = PARAMETROS
  return ['scrypt', N, r, p, sal.toString('base64'), derivado.toString('base64')].join('$')
}

export async function conferirSenha(senha: string, hashGravado: string): Promise<boolean> {
  const partes = hashGravado.split('$')
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false

  const [, n, r, p, salBase64, hashBase64] = partes
  const sal = Buffer.from(salBase64!, 'base64')
  const esperado = Buffer.from(hashBase64!, 'base64')

  const derivado = await derivar(senha.normalize('NFKC'), sal, esperado.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: PARAMETROS.maxmem,
  })

  // Comparação em tempo constante: comparar com === vaza informação por tempo.
  return derivado.length === esperado.length && timingSafeEqual(derivado, esperado)
}
