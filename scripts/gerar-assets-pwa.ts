import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import sharp from 'sharp'

import { primitivo } from '../src/design-system/tokens/primitivo'

const pasta = resolve(process.cwd(), 'public/icons')

function marcaSvg(tamanho: number, escala: number, raioCanto = 0.22): string {
  const centro = tamanho / 2
  const raio = (tamanho * escala) / 2
  const fonte = Math.round(raio * 0.9)

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${tamanho}" height="${tamanho}" viewBox="0 0 ${tamanho} ${tamanho}">
  <rect width="${tamanho}" height="${tamanho}" rx="${tamanho * raioCanto}" fill="${primitivo.tinta900}"/>
  <circle cx="${centro + raio * 0.9}" cy="${centro - raio * 0.7}" r="${Math.max(5, tamanho * 0.03)}" fill="${primitivo.ambar400}"/>
  <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" fill="white" font-family="Arial, Helvetica, sans-serif" font-size="${fonte}" font-weight="800" letter-spacing="${Math.max(2, tamanho * 0.015)}">NIP</text>
</svg>`
}

function badgeSvg(tamanho: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${tamanho}" height="${tamanho}" viewBox="0 0 ${tamanho} ${tamanho}">
  <circle cx="${tamanho / 2}" cy="${tamanho / 2}" r="${tamanho * 0.36}" fill="${primitivo.branco}"/>
  <text x="50%" y="53%" text-anchor="middle" dominant-baseline="middle" fill="${primitivo.tinta900}" font-family="Arial, Helvetica, sans-serif" font-size="${tamanho * 0.32}" font-weight="800">N</text>
</svg>`
}

async function png(nome: string, tamanho: number, svg: string): Promise<void> {
  await sharp(Buffer.from(svg)).png().resize(tamanho, tamanho).toFile(resolve(pasta, nome))
}

await mkdir(pasta, { recursive: true })

const fonte = marcaSvg(512, 0.62)
const fonteMaskable = marcaSvg(512, 0.5, 0)
await writeFile(resolve(pasta, 'app-icon.svg'), fonte, 'utf8')
await writeFile(resolve(pasta, 'app-maskable.svg'), fonteMaskable, 'utf8')

await Promise.all([
  png('app-192.png', 192, marcaSvg(192, 0.62)),
  png('app-512.png', 512, fonte),
  png('app-maskable-512.png', 512, fonteMaskable),
  png('apple-touch-icon.png', 180, marcaSvg(180, 0.58, 0)),
  png('notification.png', 192, marcaSvg(192, 0.58)),
  png('badge.png', 96, badgeSvg(96)),
])
