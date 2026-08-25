import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import sharp from 'sharp'

import { primitivo } from '../src/design-system/tokens/primitivo'

const pasta = resolve(process.cwd(), 'public/icons')

function marcaSvg(tamanho: number, escala: number, raioCanto = 0.22): string {
  const centro = tamanho / 2
  const raio = (tamanho * escala) / 2
  const x = centro - raio
  const diametro = raio * 2
  const traco = Math.max(8, tamanho * 0.035)

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${tamanho}" height="${tamanho}" viewBox="0 0 ${tamanho} ${tamanho}">
  <rect width="${tamanho}" height="${tamanho}" rx="${tamanho * raioCanto}" fill="${primitivo.tinta900}"/>
  <circle cx="${centro}" cy="${centro}" r="${raio * 1.08}" fill="none" stroke="${primitivo.azul400}" stroke-width="${traco}" opacity=".9"/>
  <circle cx="${centro}" cy="${centro}" r="${raio}" fill="${primitivo.ambar400}"/>
  <path d="M ${centro} ${x} V ${x + diametro} M ${x} ${centro} H ${x + diametro}" fill="none" stroke="${primitivo.tinta900}" stroke-width="${traco}" stroke-linecap="round"/>
  <path d="M ${x + raio * 0.18} ${x + raio * 0.32} C ${x + raio * 0.72} ${x + raio * 0.72}, ${x + raio * 0.72} ${x + raio * 1.28}, ${x + raio * 0.18} ${x + raio * 1.68}" fill="none" stroke="${primitivo.tinta900}" stroke-width="${traco}" stroke-linecap="round"/>
  <path d="M ${x + raio * 1.82} ${x + raio * 0.32} C ${x + raio * 1.28} ${x + raio * 0.72}, ${x + raio * 1.28} ${x + raio * 1.28}, ${x + raio * 1.82} ${x + raio * 1.68}" fill="none" stroke="${primitivo.tinta900}" stroke-width="${traco}" stroke-linecap="round"/>
</svg>`
}

function badgeSvg(tamanho: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${tamanho}" height="${tamanho}" viewBox="0 0 ${tamanho} ${tamanho}">
  <circle cx="${tamanho / 2}" cy="${tamanho / 2}" r="${tamanho * 0.36}" fill="${primitivo.branco}"/>
  <path d="M ${tamanho * 0.5} ${tamanho * 0.14} V ${tamanho * 0.86} M ${tamanho * 0.14} ${tamanho * 0.5} H ${tamanho * 0.86}" fill="none" stroke="${primitivo.tinta900}" stroke-width="${tamanho * 0.08}" stroke-linecap="round"/>
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
