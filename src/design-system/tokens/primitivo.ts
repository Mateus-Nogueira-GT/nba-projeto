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

  // Cromáticos — nível do apito, definidos pelo CJ.
  // Identidade 06: os três subiram de saturação e de contraste. O azul do turbo
  // não: ele é o azul do Manual da Marca, e o parceiro não o citou.
  ambar400: '#FFDD00',
  laranja400: '#FFA31F',
  verde400: '#2BE884',
  azul400: '#4DA3FF',

  // Metálicos — nível do jogador.
  // Identidade 06: o metálico saiu do tracinho de 56×3 px e passou a vestir a
  // MOLDURA inteira do card, então precisa de cor viva, não de discrição. A
  // PRATA é a única que DESCE de contraste (8,99 → 7,09), de propósito: é o que
  // abre distância do branco puro que o Randola passou a usar. E `grafite` saiu
  // com ele.
  ouro: '#F2AE1C',
  prata: '#A9B6C9',
  bronze: '#F08040',

  // Véus da MOLDURA — o decimal de cada metálico a 12%, para o fundo do
  // cabeçalho e do rodapé do card. O do Randola é o branco, porque o Randola
  // é branco.
  ouroVeu12: 'rgba(242,174,28,.12)',
  prataVeu12: 'rgba(169,182,201,.12)',
  bronzeVeu12: 'rgba(240,128,64,.12)',
  brancoVeu12: 'rgba(255,255,255,.12)',

  // Barrinhas de histórico: par PRÓPRIO — o verde categórico do apito nível 3
  // (#2BE884) não pode dizer também "bateu a linha" no mesmo card. Eles ficaram
  // perto de matiz na identidade 06; separam-se por FORMA, que é o que o card
  // usa: pílula cheia com número dentro × anel e aba vazados.
  verdeBarrinha: '#2FBF71',
  // #E05555 do mockup reprovou em AA com o valor branco dentro (3.75) —
  // escurecido até passar (4.93) sem perder o tom.
  vermelhoBarrinha: '#CC3B3B',
  // Véu translúcido do brilho do turbo — decimal do azul400 acima.
  azulVeuTurbo: 'rgba(77,163,255,.18)',

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

  // -- Identidade 04 · acabamento -------------------------------------------
  // O divisor (tinta500) a meia força: a linha ENTRE registros de uma tabela
  // densa. A régua cheia por linha vira grade; a meia força separa sem pesar.
  tinta500Veu50: 'rgba(42,56,82,.5)',
  // Tinta do verde do nível 3 (verde400) para o FUNDO da aba de atributo ativa
  // no rodapé do card: a borda é o verde cheio, o fundo é ele a 12%.
  verdeVeu12: 'rgba(43,232,132,.12)',
  // Os pares do verdeVeu12 nos outros níveis do apito: a aba de atributo ativa
  // veste a cor do NÍVEL DO APITO daquele card, nunca um verde fixo — verde é
  // N3, e um verde num card N1 seria um quarto canal mentindo.
  ambarVeu12: 'rgba(255,221,0,.12)',
  laranjaVeu12: 'rgba(255,163,31,.12)',
  azulVeu12: 'rgba(77,163,255,.12)',
  // Par do azul do turbo (azul400) para brilho e fundo — nunca no lugar do
  // categórico.
  azul300: '#8CC4FF',
  azul500: '#2A7FD9',
  // Durações: estado muda em ≤ 200 ms; só a ENTRADA de card novo ganha 400 ms.
  // Nada pulsa continuamente.
  duracao200: '200ms',
  duracao400: '400ms',

  // -- Identidade 05 · Manual da Marca (v1.0, 16/09/2026) ---------------------
  // As cinco cores da marca e as quatro superfícies, literais do PDF (p.2 e
  // p.5). O laranja de interface saiu daqui: o manual o proíbe em negrito. O
  // `laranja400` acima FICA — ele é o 🟠 do nível 2 do apito, vocabulário
  // homologado do CJ, e sinal não é decoração.
  azulNip: '#0057B8',
  // Hover do botão primário: o azul com 12% de branco. É o mais claro que ainda
  // deixa o texto branco em cima passar em AA (5,34).
  azulNipHover: '#1F6BC1',
  vermelhoNip: '#C8102E',
  // A tinta CLARA do vermelho, para TEXTO e ponto: o cheio, como texto sobre o
  // cartão, dá 2,90 e reprova. O cheio veste selo; o claro vira letra.
  vermelhoNipClaro: '#FF5C70',
  navy: '#001D3D',
  cinzaNip: '#A6ABB4',
  fundoNip: '#071426',
  cartaoNip: '#101C30',
  campoNip: '#18243A',
  // A divisória do manual é #2A3852 — exatamente a tinta500 que já existia.
  fundoTelaFimNip: '#0B1830',
  // Os dois universos, RE-DERIVADOS do manual em vez de inventados: o frio é
  // cartão e campo com 10% de azul; o quente, cartão com 12% e campo com 15% de
  // vermelho — que dá quase o roxo da identidade 03, agora com origem.
  cartaoFrio: '#0E223E',
  campoFrio: '#162947',
  cartaoQuente: '#221B30',
  campoQuente: '#2C1A30',
  bordaQuenteNip: '#3D334E',
  // Véus: os decimais das cores da marca.
  azulNipVeu7: 'rgba(0,87,184,.07)',
  azulNipVeu8: 'rgba(0,87,184,.08)',
  vermelhoNipVeu8: 'rgba(200,16,46,.08)',
  vermelhoNipVeu22: 'rgba(200,16,46,.22)',
  vermelhoClaroVeu14: 'rgba(255,92,112,.14)',
  vermelhoClaroVeu45: 'rgba(255,92,112,.45)',
  // Texto em opacidades: a MESMA tinta clara (agora o branco do manual) em três
  // intensidades além da cheia. É assim que se separa número de rótulo sem
  // borda nem segunda cor — densidade por peso e opacidade, não por cromo.
  brancoVeu70: 'rgba(255,255,255,.7)',
  brancoVeu55: 'rgba(255,255,255,.55)',
  // O véu do paywall: o fundo do manual em duas opacidades, para o degradê que
  // cobre a silhueta borrada.
  fundoNipVeu20: 'rgba(7,20,38,.2)',
  fundoNipVeu70: 'rgba(7,20,38,.7)',
  // Pontos de quebra da moldura. Media query não lê variável CSS, então o
  // número vive aqui e o CSS da Moldura o repete — um teste compara os dois.
  pontoDeQuebraTopo: 1024,
  pontoDeQuebraLateral: 1280,

  // Fontes — a família vem por variável CSS publicada no layout (next/font).
  // O manual fixa as duas: Bebas Neue em título curto, chamada e número de
  // impacto (NUNCA em formulário); Montserrat na interface, campo, botão,
  // explicação e dado.
  fonteBebas: "var(--fonte-bebas), 'Arial Narrow', sans-serif",
  fonteMontserrat: 'var(--fonte-montserrat), system-ui, sans-serif',
} as const

export type Primitivo = typeof primitivo
