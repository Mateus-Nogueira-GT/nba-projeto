import { writeFileSync } from 'node:fs'
import { gerarCss } from '../src/design-system/tokens/css'

const destino = 'src/design-system/tokens/tokens.css'
writeFileSync(destino, gerarCss())
console.log(`${destino} regenerado`)
