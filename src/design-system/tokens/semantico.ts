import { primitivo as p } from './primitivo'

/**
 * CAMADA 2 · SEMÂNTICO — intenção. É aqui que o resto do sistema fala.
 *
 * DOIS canais visuais, e só dois (ADR-0005):
 *   borda metálica = nível do JOGADOR
 *   anel colorido  = nível do APITO, com a confiança como número dentro
 *
 * A escala de 5 faixas da proposta não existe mais. Se aparecer uma terceira
 * codificação por cor aqui, algo saiu errado.
 */
export const semantico = {
  // -- Superfícies (tema escuro é a base) --------------------------------
  fundo: p.tinta800,
  superficie: p.tinta700,
  superficieElevada: p.tinta600,
  divisor: p.tinta500,

  // -- Texto -------------------------------------------------------------
  textoPrimario: p.tinta50,
  textoSecundario: p.tinta300,
  textoSobreCor: p.tinta900,

  // -- Canal 1 · nível do JOGADOR (borda metálica) -----------------------
  // "preto" do documento virou GRAFITE: borda preta sobre superfície escura
  // tem contraste ~1.3 e some. Borda invisível não é canal.
  nivelMvp: p.ouro,
  nivelAllStar: p.prata,
  nivelSuporte: p.bronze,
  nivelRandola: p.grafite,

  // -- Canal 2 · nível do APITO (anel) -----------------------------------
  apitoNivel1: p.ambar400,
  apitoNivel2: p.laranja400,
  apitoNivel3: p.verde400,
  apitoTurbo: p.azul400,
  apitoModoFire: p.laranja400,

  // -- Estado ------------------------------------------------------------
  alerta: p.vermelho400,
} as const

export type Semantico = typeof semantico
