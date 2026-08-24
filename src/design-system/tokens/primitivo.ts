/**
 * CAMADA 1 · PRIMITIVO — paleta crua, sem significado.
 *
 * É o ÚNICO arquivo do projeto onde hex pode existir. Trocar a marca inteira
 * deve ser um diff aqui e em mais lugar nenhum.
 *
 * NENHUM componente importa deste arquivo. A regra é verificável:
 * `npm run boundaries` e o teste em __tests__/tokens.test.ts.
 */

export const primitivo = {
  // Neutros — base do tema escuro
  tinta900: '#080D16',
  tinta800: '#0B1220',
  tinta700: '#131C2E',
  tinta600: '#1B2740',
  tinta500: '#2A3852',
  tinta400: '#5A6982',
  tinta300: '#8D9AB0',
  tinta200: '#B9C4D6',
  tinta100: '#E4EAF3',
  tinta50: '#F5F8FC',
  branco: '#FFFFFF',

  // Cromáticos — nível do apito, definidos pelo CJ
  ambar400: '#FFC93D',
  laranja400: '#FF9838',
  verde400: '#3DD37E',
  azul400: '#4DA3FF',

  // Metálicos — nível do jogador
  ouro: '#E0B24A',
  prata: '#C3CCDA',
  bronze: '#C8823C',
  grafite: '#7C8AA3',

  // Apoio
  vermelho400: '#FF6B6B',

  // Rampa de confiança — UM matiz, intensidade crescente. Identidade 02.
  turquesa700: '#2FA093',
  turquesa600: '#3AB5A6',
  turquesa500: '#47CBBA',
  turquesa400: '#5CE0CE',
  turquesa300: '#79F2E1',
  // Acento de INTERFACE (chips, aba ativa, CTA). Não é canal de estratégia —
  // papel diferente do laranja400 do apito nível 2.
  laranjaAcento: '#FF7A1A',
  tinta950: '#05080F',
  // Fontes — a família vem por variável CSS publicada no layout (next/font).
  fonteAnton: "var(--fonte-anton), 'Arial Narrow', sans-serif",
  fonteBarlow: "var(--fonte-barlow), system-ui, sans-serif",
  fonteBarlowCondensed: "var(--fonte-barlow-condensed), 'Arial Narrow', sans-serif",
} as const

export type Primitivo = typeof primitivo
