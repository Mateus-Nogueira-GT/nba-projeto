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

  // Identidade 03 · broadcast — superfícies e estados novos
  marinho650: '#16213A',
  marinho750: '#111A2E',
  marinho850: '#101A2E',
  roxo700: '#241A2E',
  roxo800: '#161226',
  roxoBorda: '#3A2A52',
  vermelhoVivo: '#E03E3E',
  // Barrinhas de histórico: par PRÓPRIO — o verde categórico do apito nível 3
  // (#3DD37E) não pode dizer também "bateu a linha" no mesmo card.
  verdeBarrinha: '#2FBF71',
  // #E05555 do mockup reprovou em AA com o valor branco dentro (3.75) —
  // escurecido até passar (4.93) sem perder o tom.
  vermelhoBarrinha: '#CC3B3B',
  // Véus translúcidos (faixas de rodapé e brilhos) — decimais dos hex acima.
  turquesaVeu: 'rgba(92,224,206,.07)',
  laranjaVeu: 'rgba(255,122,26,.08)',
  azulVeuTurbo: 'rgba(77,163,255,.18)',
  laranjaVeuFire: 'rgba(255,122,26,.22)',

  // Fundos alternativos do monograma do Avatar (sem foto) — variação
  // determinística por sigla de time, puramente decorativa, sem significado
  // de estratégia.
  avatarFundo2: '#243147',
  avatarFundo3: '#1E2A3E',
  avatarFundo4: '#2C2438',
  avatarFundo5: '#1F3038',
  avatarFundo6: '#332A22',

  // Rampa de confiança — UM matiz, intensidade crescente. Identidade 02.
  turquesa700: '#2FA093',
  turquesa600: '#3AB5A6',
  turquesa500: '#47CBBA',
  turquesa400: '#5CE0CE',
  turquesa300: '#79F2E1',
  // Acento de INTERFACE (chips, aba ativa, CTA). Não é canal de estratégia —
  // papel diferente do laranja400 do apito nível 2.
  laranjaAcento: '#FF7A1A',
  // Ponta clara do degradê dos botões de CTA (VER ESTATÍSTICAS, Entrar,
  // Criar conta, Continuar no Mercado Pago) — laranjaAcento é o início.
  laranjaAcentoClaro: '#FFB25E',
  tinta950: '#05080F',

  // Nota da partida — 5 faixas de desempenho (Game Score normalizado, 3-10).
  // Paleta PRÓPRIA e deliberadamente distinta do grau de confiança do apito
  // (ver o comentário em componentes/NotaPartida.tsx) — mas o hex mora AQUI
  // como todo o resto, nunca solto no componente (achado da revisão: uma
  // isenção por nome de arquivo no teste "hex direto" não pega um hex NOVO e
  // não relacionado que alguém cole no mesmo arquivo amanhã).
  notaFundoExcepcional: '#1F6F4A',
  notaFundoOtima: '#2E7D62',
  notaFundoBoa: '#3D5A80',
  notaFundoMediana: '#4A4E69',
  notaFundoFraca: '#5C3A3A',
  // Texto claro de cada faixa. Excepcional e ótima são as duas faixas verdes
  // e compartilham o mesmo texto — mesmo padrão de reúso de
  // `apitoNivel2`/`apitoModoFire` em semantico.ts.
  notaTextoVerde: '#EAFBF2',
  notaTextoAzul: '#E8EFF7',
  notaTextoRoxo: '#E9E9F0',
  notaTextoVermelho: '#F7E9E9',

  // Fontes — a família vem por variável CSS publicada no layout (next/font).
  fonteAnton: "var(--fonte-anton), 'Arial Narrow', sans-serif",
  fonteBarlow: "var(--fonte-barlow), system-ui, sans-serif",
  fonteBarlowCondensed: "var(--fonte-barlow-condensed), 'Arial Narrow', sans-serif",
} as const

export type Primitivo = typeof primitivo
