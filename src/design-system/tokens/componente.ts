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
} as const

export type Componente = typeof componente
