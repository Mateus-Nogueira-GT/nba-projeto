/**
 * Superfície pública dos tokens.
 *
 * `primitivo` NÃO é reexportado de propósito: componente que precisa de hex
 * está pulando uma camada. Ver docs/04-design-system.md > Camadas de token.
 */
export { semantico, type Semantico } from './semantico'
export { componente, type Componente } from './componente'
export { NIVEL_JOGADOR, APITO, gerarCss } from './css'
export { razaoDeContraste, luminancia, passaAA, melhorTextoSobre, AA, type Rgb } from './contraste'
