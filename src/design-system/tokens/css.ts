import type { Nivel, NivelApito } from '../../modules/motor/tipos'
import { componente } from './componente'
import { semantico } from './semantico'

/**
 * Mapas de domínio -> token semântico.
 *
 * O componente NUNCA faz `if (nivel === 'MVP') cor = ouro`. Ele consulta estes
 * mapas, que só conhecem tokens. É o que mantém o hex confinado ao primitivo.
 */
export const NIVEL_JOGADOR: Record<Nivel, { cor: string; rotulo: string }> = {
  MVP: { cor: semantico.nivelMvp, rotulo: 'MVP' },
  ALL_STAR: { cor: semantico.nivelAllStar, rotulo: 'All Star' },
  SUPORTE: { cor: semantico.nivelSuporte, rotulo: 'Suporte' },
  RANDOLA: { cor: semantico.nivelRandola, rotulo: 'Randola' },
}

export const APITO: Record<NivelApito, { cor: string; rotulo: string }> = {
  1: { cor: semantico.apitoNivel1, rotulo: 'Nível 1' },
  2: { cor: semantico.apitoNivel2, rotulo: 'Nível 2' },
  3: { cor: semantico.apitoNivel3, rotulo: 'Nível 3' },
}

export const TURBO = { cor: semantico.apitoTurbo, rotulo: 'Turbo' }
export const MODO_FIRE = { cor: semantico.apitoModoFire, rotulo: 'Modo Fire' }

function kebab(nome: string): string {
  return nome.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

/**
 * Gera as variáveis CSS a partir dos tokens.
 *
 * Fonte única: o TypeScript. O .css é derivado, e um teste compara o arquivo
 * em disco com esta função — se alguém editar o CSS à mão, o teste quebra.
 */
export function gerarCss(): string {
  const linhas = [
    '/* GERADO por scripts/gerar-tokens-css.mts a partir de src/design-system/tokens/.',
    '   Não editar à mão: `npm run tokens` regenera e o teste compara. */',
    '',
    ':root {',
    '  /* semântico */',
    ...Object.entries(semantico).map(([k, v]) => `  --${kebab(k)}: ${v};`),
    '',
    '  /* componente */',
    ...Object.entries(componente).map(([k, v]) => `  --${kebab(k)}: ${v};`),
    '}',
    '',
  ]

  return linhas.join('\n')
}
