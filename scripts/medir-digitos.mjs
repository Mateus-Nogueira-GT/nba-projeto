// Mede, no Chrome headless, a largura dos dígitos duplos de uma família do
// Google Fonts. Existe por causa de UMA decisão da Identidade 05: a Bebas Neue
// só pode vestir número que muda ao vivo (placar, badge de status, "FALTA n")
// se os dígitos tiverem largura fixa — senão o número pula a cada refresh de
// 30 s, e é isso, não animação, que faz o ao vivo parecer instável.
//
// Uso: node scripts/medir-digitos.mjs "Bebas Neue"
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const familia = process.argv[2] ?? 'Bebas Neue'
const chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const dir = mkdtempSync(join(tmpdir(), 'digitos-'))
const html = join(dir, 'medir.html')

writeFileSync(
  html,
  `<!doctype html><html><head>
<link href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(familia)}&display=block" rel="stylesheet">
</head><body><script>
(async () => {
  await document.fonts.load('34px "${familia}"');
  const c = document.createElement('canvas').getContext('2d');
  c.font = '34px "${familia}"';
  const largos = ['00','11','22','33','44','55','66','77','88','99'].map(d => c.measureText(d).width);
  const carregou = document.fonts.check('34px "${familia}"');
  document.title = JSON.stringify({ carregou, min: Math.min(...largos), max: Math.max(...largos) });
})();
</script></body></html>`,
)

const saida = spawnSync(
  chrome,
  ['--headless=new', '--disable-gpu', '--virtual-time-budget=8000', '--dump-dom', `file://${html}`],
  { encoding: 'utf8' },
)
const titulo = saida.stdout.match(/<title>(.*?)<\/title>/)?.[1]
if (!titulo) throw new Error('O Chrome não devolveu a medição.')
const { carregou, min, max } = JSON.parse(titulo.replace(/&quot;/g, '"'))
if (!carregou) throw new Error(`A fonte "${familia}" não carregou (sem rede?).`)
const tabular = max - min < 0.5
console.log(
  `${familia}: dígitos duplos entre ${min.toFixed(2)} e ${max.toFixed(2)} px → ${tabular ? 'TABULAR' : 'PROPORCIONAL'}`,
)
