import { semantico as s } from './semantico'

/**
 * CAMADA 3 · COMPONENTE — aplicação específica.
 *
 * Só referencia SEMÂNTICO. Nunca primitivo.
 */
export const componente = {
  cardFundo: s.superficie,
  cardTexto: s.textoPrimario,
  cardTextoApoio: s.textoSecundario,
  cardDivisor: s.divisor,
  cardBordaLargura: '2px',

  anelTexto: s.textoSobreCor,
  anelDiametro: '56px',
  anelEspessura: '4px',

  marcadorOpdFundo: s.superficieElevada,
  marcadorOpdTexto: s.textoSecundario,

  oddTexto: s.textoSecundario,

  pilulaBordaLargura: '1.5px',
  avatarAnelEspessura: '2px',
  faixaNivelAltura: '3px',

  // Fundo dos botões de CTA em destaque (VER ESTATÍSTICAS, Entrar, Criar
  // conta, Continuar no Mercado Pago) — mesmo degradê nas quatro telas,
  // montado aqui a partir de dois semânticos em vez de repetido por tela.
  ctaFundo: `linear-gradient(90deg, ${s.acento}, ${s.acentoClaro})`,

  // -- Identidade 03 · broadcast -------------------------------------------
  // Fim do fundo chapado: a tela inteira respira num gradiente sutil.
  fundoTela: `linear-gradient(175deg, ${s.fundo} 60%, ${s.fundoTelaFim})`,
  // Temperatura por contexto — a regra central da identidade. Pré-live é
  // FRIO (análise); o Fire Live esquenta (urgência). Cada tela declara um
  // dos dois; o teste transversal garante que nenhuma tela pré-live usa o
  // universo quente.
  contextoFrio: {
    cardGradiente: `linear-gradient(135deg, ${s.superficieFria1}, ${s.superficieFria2} 55%)`,
    faixaFundo: s.veuFrio,
    borda: s.divisor,
  },
  contextoQuente: {
    cardGradiente: `linear-gradient(135deg, ${s.superficieQuente1}, ${s.superficieQuente2} 55%)`,
    faixaFundo: s.veuQuente,
    borda: s.bordaQuente,
    destaque: s.acento,
    brilho: `0 0 24px ${s.veuFire}`,
  },
  // Três brilhos, três donos (nunca se confundem):
  //   confiança grau 5 → pílula/% (já existente no CardEntrada)
  //   turbo            → card do turbo
  //   modo fire        → card quente do Fire Live (contextoQuente.brilho)
  turboBrilho: `0 0 22px ${s.veuTurbo}`,
  // Borda lateral esquerda do card, na cor do grau de confiança.
  cardBordaLateral: '3px',
  cardRaio: '14px',
  // Barra rumo ao alvo (Fire Live)
  barraAlvoFundo: s.superficieQuente1,
  barraAlvoPreenchido: `linear-gradient(90deg, ${s.acento}, ${s.acentoClaro})`,

  // Nota da partida — as 5 faixas como {fundo, texto}, na ordem da maior
  // nota para a menor. NotaPartida.tsx é dono do `minimo` de cada faixa (não
  // é cor, é regra de apresentação da UI, fica no componente de React).
  notaFaixaExcepcional: { fundo: s.notaExcepcionalFundo, texto: s.notaExcepcionalTexto },
  notaFaixaOtima: { fundo: s.notaOtimaFundo, texto: s.notaOtimaTexto },
  notaFaixaBoa: { fundo: s.notaBoaFundo, texto: s.notaBoaTexto },
  notaFaixaMediana: { fundo: s.notaMedianaFundo, texto: s.notaMedianaTexto },
  notaFaixaFraca: { fundo: s.notaFracaFundo, texto: s.notaFracaTexto },

  // -- Identidade 04 · varredura e análise ---------------------------------
  // Selo de contexto no canto do cabeçalho — PRÉ-LIVE laranja, ■ AO VIVO
  // vermelho. Pendência anotada desde a 03; aqui vira token para os dois
  // universos vestirem o mesmo componente.
  seloContexto: {
    preLive: { fundo: s.acento, texto: s.textoSobreCor },
    aoVivo: { fundo: s.vivoSelo, texto: s.textoSobreCor },
  },
  // Cabeçalho de jogo — a ÚNICA fronteira de seção da Lista e do Fire Live.
  // Veste o gradiente do universo da tela; o de dentro é sigla forte, nada de
  // escudo.
  cabecalhoJogo: {
    fundoFrio: `linear-gradient(135deg, ${s.superficieFria1}, ${s.superficieFria2} 55%)`,
    fundoQuente: `linear-gradient(135deg, ${s.superficieQuente1}, ${s.superficieQuente2} 55%)`,
    bordaFria: s.divisor,
    bordaQuente: s.bordaQuente,
  },
  // Badge de status do ciclo do card (PRÉ · 1º Q · FIM 1º Q · FT · —). A
  // largura é FIXA para o card não pular a cada refresh de 30 s — e é isso, não
  // uma animação, que faz o ao vivo parecer estável.
  statusCiclo: {
    largura: '52px',
    fundoAoVivo: s.aoVivoTinta,
    bordaAoVivo: s.aoVivoBorda,
    textoAoVivo: s.aoVivoSolido,
    fundoNeutro: s.superficieElevada,
    bordaNeutra: s.divisor,
    textoNeutro: s.texto55,
  },
  // Abas de atributo no rodapé do card — um jogador com dois ou três
  // atributos vira UM card, e as abas trocam o mercado sem repetir o card.
  abaAtributo: {
    /**
     * A aba ATIVA veste a cor do nível do apito DAQUELE card. O artboard a
     * desenha verde porque o card desenhado é N3; fixar o verde faria um card
     * N1 exibir o sinal de N3 no rodapé — um quarto canal de cor dizendo o que
     * o anel já diz, e dizendo errado.
     */
    ativaPorNivel: {
      1: { borda: s.apitoNivel1, fundo: s.apitoNivel1Tinta },
      2: { borda: s.apitoNivel2, fundo: s.apitoNivel2Tinta },
      3: { borda: s.apitoNivel3, fundo: s.apitoNivel3Tinta },
    },
    ativaTurbo: { borda: s.apitoTurbo, fundo: s.apitoTurboTinta },
    /**
     * Par NEUTRO, para o seletor que não pertence a um apito — o de atributo
     * na tela do time, por exemplo. Sem nível para vestir, ele usa o laranja de
     * UI dos outros seletores de tela, e não empresta a cor de um nível que
     * não existe ali.
     */
    ativaNeutra: { borda: s.acento, fundo: s.acentoVeu },
    textoAtiva: s.texto100,
    bordaInativa: s.divisor,
    textoInativa: s.textoSecundario,
    raio: '6px',
  },
  // Veredito do card CONFERIDO: "fez N" na cor das barrinhas — bateu, falhou —
  // e o neutro do DNP em texto40. Quem não jogou não ganha ✓ nem ✗.
  conferido: {
    bateu: s.barrinhaBateu,
    // Texto sobre fundo escuro exige o vermelho claro; barrinhaFalhou é FUNDO.
    falhou: s.alerta,
    neutro: s.texto40,
  },
} as const

export type Componente = typeof componente
