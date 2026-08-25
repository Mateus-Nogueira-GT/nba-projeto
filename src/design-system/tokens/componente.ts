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

  historicoAtivo: s.textoPrimario,
  historicoInativo: s.divisor,

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
} as const

export type Componente = typeof componente
