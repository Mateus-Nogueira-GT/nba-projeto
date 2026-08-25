import { primitivo as p } from './primitivo'

/**
 * CAMADA 2 · SEMÂNTICO — intenção. É aqui que o resto do sistema fala.
 *
 * DOIS canais visuais categóricos, e só dois (ADR-0005):
 *   borda metálica = nível do JOGADOR
 *   anel colorido  = nível do APITO, com a confiança como número dentro
 *
 * A escala de 5 faixas MULTI-MATIZ da proposta original não existe mais — ela
 * colidia com as 4 cores categóricas do apito. A rampa de confiança abaixo
 * (identidade 02) é outra coisa: UM matiz só (turquesa), intensidade
 * crescente, calibrada para a amplitude real da confiança (80-95). Ver
 * docs/superpowers/specs/2026-08-24-identidade-rota-transmissao-design.md
 * ("A rampa de confiança — decisão central de cor") e o teste "colisão de
 * canais" em __tests__/tokens.test.ts, que garante que ela nunca reusa uma
 * cor categórica.
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

  // -- Tipografia (identidade 02) -----------------------------------------
  fonteTitulo: p.fonteAnton,
  fonteRotulo: p.fonteBarlowCondensed,
  fonteCorpo: p.fonteBarlow,

  // -- Acento de interface --------------------------------------------------
  acento: p.laranjaAcento,
  // Ponta clara do degradê de CTA — combinada com `acento` na camada de
  // componente (ver `componente.ctaFundo`). Fica aqui, e não composta já
  // como linear-gradient(), porque o teste "todo token semântico aponta para
  // um valor da paleta primitiva" exige igualdade literal com um valor do
  // primitivo — um gradiente já montado não seria mais um alias.
  acentoClaro: p.laranjaAcentoClaro,
  aoVivo: p.vermelho400,

  // -- Identidade 03 · broadcast -------------------------------------------
  // Superfícies dos dois universos: pré-live FRIO, ao vivo QUENTE. Os
  // gradientes são compostos na camada de componente (contextoFrio/Quente) —
  // aqui ficam só os aliases, como o teste de paridade exige.
  superficieFria1: p.marinho650,
  superficieFria2: p.marinho750,
  fundoTelaFim: p.marinho850,
  superficieQuente1: p.roxo700,
  superficieQuente2: p.roxo800,
  bordaQuente: p.roxoBorda,
  vivoSelo: p.vermelhoVivo,
  barrinhaBateu: p.verdeBarrinha,
  barrinhaFalhou: p.vermelhoBarrinha,
  veuFrio: p.turquesaVeu,
  veuQuente: p.laranjaVeu,
  veuTurbo: p.azulVeuTurbo,
  veuFire: p.laranjaVeuFire,

  // -- Rampa de confiança — grau 1 (menor) ao 5 (maior) ----------------------
  confiancaGrau1: p.turquesa700,
  confiancaGrau2: p.turquesa600,
  confiancaGrau3: p.turquesa500,
  confiancaGrau4: p.turquesa400,
  confiancaGrau5: p.turquesa300,

  // -- Fundos alternativos do monograma do Avatar (identidade 03) -----------
  avatarFundo2: p.avatarFundo2,
  avatarFundo3: p.avatarFundo3,
  avatarFundo4: p.avatarFundo4,
  avatarFundo5: p.avatarFundo5,
  avatarFundo6: p.avatarFundo6,
} as const

export type Semantico = typeof semantico
