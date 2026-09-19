import { primitivo as p } from './primitivo'

/**
 * CAMADA 2 · SEMÂNTICO — intenção. É aqui que o resto do sistema fala.
 *
 * DOIS canais visuais categóricos, e só dois (ADR-0005). Na identidade 06 eles
 * trocaram de superfície, sem deixar de ser dois (ADR-0011):
 *   MOLDURA do card = nível do JOGADOR (borda, lateral de 6 px, véu)
 *   anel do avatar  = nível do APITO, com o numeral N{n} ao lado do nome
 *
 * A confiança saiu do card na identidade 06: o número, a borda lateral do grau
 * e o brilho do grau 5. A rampa turquesa abaixo continua viva — ela veste a
 * tela de ANÁLISE do apito, que é onde a confiança passou a morar.
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
  // -- Superfícies (as quatro do manual: fundo, cartão, campo, divisória) ----
  fundo: p.fundoNip,
  superficie: p.cartaoNip,
  superficieElevada: p.campoNip,
  divisor: p.tinta500,

  // -- Texto -------------------------------------------------------------
  textoPrimario: p.branco,
  textoSecundario: p.cinzaNip,
  /**
   * Texto ESCURO sobre cor — o número dentro do anel do apito, e só ele. Sobre
   * o amarelo do nível 1 o branco daria ~1,5; é por isso que este token existe
   * e continua escuro. Quem senta sobre o azul ou o vermelho do manual usa
   * `textoSobreAcento`.
   */
  textoSobreCor: p.tinta900,
  /** Texto BRANCO sobre azul ou vermelho: CTA, pílula ativa, selo, chip ativo. */
  textoSobreAcento: p.branco,

  // -- Canal 1 · nível do JOGADOR (a moldura do card) --------------------
  // O "preto" do documento nunca pôde ser preto: borda preta sobre superfície
  // escura tem contraste ~1,3 e some. Foi grafite até a identidade 05 e virou
  // branco na 06 — os dois resolvem o mesmo problema, um por baixo e outro por
  // cima. Borda invisível não é canal.
  nivelMvp: p.ouro,
  nivelAllStar: p.prata,
  nivelSuporte: p.bronze,
  // Identidade 06: o Randola virou BRANCO por pedido do parceiro. O grafite
  // existia porque "preto" sumia sobre superfície escura; o branco resolve o
  // mesmo problema pelo outro lado, e é o que separa o Randola do All Star.
  nivelRandola: p.branco,

  // -- Identidade 06 · a MOLDURA veste o nível do jogador -------------------
  // O canal 1 saiu do tracinho de 56×3 px e passou a vestir a moldura inteira
  // do card: borda, lateral de 6 px e véu no cabeçalho e no rodapé. O véu é o
  // decimal do metálico a 12%.
  nivelMvpVeu: p.ouroVeu12,
  nivelAllStarVeu: p.prataVeu12,
  nivelSuporteVeu: p.bronzeVeu12,
  nivelRandolaVeu: p.brancoVeu12,
  /**
   * A BORDA da moldura do Randola é o branco a 55%, não o cheio.
   *
   * Branco puro é a maior luminância do sistema: uma moldura branca cheia faria
   * o card do jogador MENOS importante gritar mais alto que o do MVP, e a ordem
   * de peso visual (MVP > All Star > Suporte > Randola) se inverteria. O TEXTO
   * do nível continua branco cheio — foi ali que o parceiro pediu a cor.
   */
  nivelRandolaBorda: p.brancoVeu55,
  /**
   * O TEXTO do Randola é o branco a 70%, não o cheio.
   *
   * Cheio ele dá 14,56 de contraste no pior caso das cinco superfícies —
   * contra 7,52 do ouro, 7,09 da prata e 5,45 do bronze. O nível MENOS
   * importante renderizava com o dobro do peso do segundo mais importante, e
   * numa tela de varredura o olho ia primeiro para o card que menos importa.
   * A 70% ele dá 7,86: continua branco, continua o mais claro dos quatro, e
   * sai de outlier. A cor pedida no feedback 03 é respeitada — muda a
   * intensidade, não o matiz.
   */
  nivelRandolaTexto: p.brancoVeu70,

  // -- Canal 2 · nível do APITO (anel) -----------------------------------
  apitoNivel1: p.ambar400,
  apitoNivel2: p.laranja400,
  apitoNivel3: p.verde400,
  apitoTurbo: p.azul400,
  apitoModoFire: p.laranja400,

  // -- Estado ------------------------------------------------------------
  alerta: p.vermelhoNipClaro,

  // -- Tipografia (identidade 05 · Manual da Marca) -------------------------
  fonteTitulo: p.fonteBebas,
  /**
   * Rótulo em caixa-alta. Era a Barlow Condensed; virou Montserrat porque o
   * manual reserva a Bebas a título curto, chamada e número de impacto e a
   * PROÍBE em texto de formulário — e o rótulo veste formulário.
   */
  fonteRotulo: p.fonteMontserrat,
  fonteCorpo: p.fonteMontserrat,
  /**
   * Número de impacto: confiança, placar, contador, os números da noite.
   * `scripts/medir-digitos.mjs` mediu a Bebas Neue — 27,20 px em todos os
   * dígitos duplos, ou seja, largura fixa — então ela pode vestir número que
   * muda a cada refresh de 30 s sem o card pular. Se a fonte mudar, medir de
   * novo: proporcional aqui obriga a voltar para a Montserrat com `tnum`.
   */
  fonteNumero: p.fonteBebas,

  // -- Acento de interface --------------------------------------------------
  /**
   * O azul do manual — AÇÃO E ESTADO ATIVO, sempre como PREENCHIMENTO.
   *
   * Ele tem o mesmo matiz do azul do turbo (212° contra 211°). Como texto sobre
   * o cartão dá 2,48 e reprova; qualquer tinta clara o bastante para passar em
   * AA seria, aos olhos, o 🔵 do CJ — um quarto canal de cor mentindo. Então
   * ele só existe preenchido, com `textoSobreAcento` em cima. Tinta é branca.
   * O teste "azul nunca é tinta" varre a UI inteira atrás de violação.
   */
  acento: p.azulNip,
  /** Hover do botão primário (o manual pede "estado hover mais claro"). */
  acentoClaro: p.azulNipHover,
  /** Ao vivo como TINTA — texto e ponto. O selo cheio é `vivoSelo`. */
  aoVivo: p.vermelhoNipClaro,

  // -- Identidade 03 · broadcast -------------------------------------------
  // Superfícies dos dois universos: pré-live FRIO, ao vivo QUENTE. Os
  // gradientes são compostos na camada de componente (contextoFrio/Quente) —
  // aqui ficam só os aliases, como o teste de paridade exige.
  superficieFria1: p.campoFrio,
  superficieFria2: p.cartaoFrio,
  fundoTelaFim: p.fundoTelaFimNip,
  superficieQuente1: p.campoQuente,
  superficieQuente2: p.cartaoQuente,
  bordaQuente: p.bordaQuenteNip,
  /** Ao vivo CHEIO — o selo, com branco em cima. A tinta é `aoVivo`. */
  vivoSelo: p.vermelhoNip,
  barrinhaBateu: p.verdeBarrinha,
  barrinhaFalhou: p.vermelhoBarrinha,
  veuFrio: p.azulNipVeu7,
  veuQuente: p.vermelhoNipVeu8,
  veuTurbo: p.azulVeuTurbo,
  veuFire: p.vermelhoNipVeu22,

  // -- Rampa de confiança — grau 1 (menor) ao 5 (maior) ----------------------
  confiancaGrau1: p.turquesa700,
  confiancaGrau2: p.turquesa600,
  confiancaGrau3: p.turquesa500,
  confiancaGrau4: p.turquesa400,
  confiancaGrau5: p.turquesa300,

  // -- Nota da partida — 5 faixas de desempenho (badge da aba de estatísticas) --
  // Paleta PRÓPRIA e deliberadamente distinta do grau de confiança do apito
  // acima — as duas convivem no app e significam coisas diferentes (ver
  // componentes/NotaPartida.tsx). Precisa estar aqui, e não como hex direto
  // no componente: é o que o teste "hex direto" da camada de token cobra de
  // qualquer outro token deste arquivo.
  notaExcepcionalFundo: p.notaFundoExcepcional,
  notaExcepcionalTexto: p.notaTextoVerde,
  notaOtimaFundo: p.notaFundoOtima,
  notaOtimaTexto: p.notaTextoVerde,
  notaBoaFundo: p.notaFundoBoa,
  notaBoaTexto: p.notaTextoAzul,
  notaMedianaFundo: p.notaFundoMediana,
  notaMedianaTexto: p.notaTextoRoxo,
  notaFracaFundo: p.notaFundoFraca,
  notaFracaTexto: p.notaTextoVermelho,

  // -- Fundos alternativos do monograma do Avatar (identidade 03) -----------
  avatarFundo2: p.avatarFundo2,
  avatarFundo3: p.avatarFundo3,
  avatarFundo4: p.avatarFundo4,
  avatarFundo5: p.avatarFundo5,
  avatarFundo6: p.avatarFundo6,

  // -- Identidade 04 · varredura e análise ---------------------------------
  // Texto em opacidades: número em texto100, rótulo em texto55, apoio em
  // texto40 — uma cor, várias intensidades (a densidade do Sofascore sem a
  // paleta dele). `texto100` é o próprio textoPrimario, com nome de escala
  // para o componente falar a mesma língua nos quatro degraus.
  texto100: p.branco,
  texto70: p.brancoVeu70,
  texto55: p.brancoVeu55,
  // Nome legado da identidade 04. O piso de 55% preserva AA em texto pequeno.
  texto40: p.brancoVeu55,
  // Régua fina entre linhas de tabela — o `divisor` a meia força. Alias de um
  // primitivo, como o teste de paridade exige.
  divisorSuave: p.tinta500Veu50,
  // Ao vivo com forma própria DENTRO do quente: o sólido é o mesmo `aoVivo`
  // (o ponto e o texto); tinta e borda vestem o badge de status de largura
  // fixa. Distinto do amarelo do nível 1 e do laranja do nível 2 por teste.
  aoVivoSolido: p.vermelhoNipClaro,
  aoVivoTinta: p.vermelhoClaroVeu14,
  aoVivoBorda: p.vermelhoClaroVeu45,
  // Aba de atributo ativa (PTS · REB · AST no rodapé do card): borda no verde
  // do nível 3, fundo na tinta dele. Alias, como o teste de paridade exige.
  apitoNivel1Tinta: p.ambarVeu12,
  apitoNivel2Tinta: p.laranjaVeu12,
  /** Véu do azul de UI — fundo de estado ativo em seletor de TELA. */
  acentoVeu: p.azulNipVeu8,
  apitoNivel3Tinta: p.verdeVeu12,
  apitoTurboTinta: p.azulVeu12,
  // Par do turbo — para brilho e fundo. O categórico continua sendo apitoTurbo.
  turboClaro: p.azul300,
  turboEscuro: p.azul500,
  // Durações
  duracaoEstado: p.duracao200,
  duracaoEntrada: p.duracao400,

  // -- Identidade 05 · moldura e marca -------------------------------------
  /**
   * O CROMO — barra do topo no desktop, barra inferior no celular, painel da
   * marca no login. Sobre o fundo ele dá 1,09: o cromo NÃO se separa do
   * conteúdo por contraste, e sim pela linha divisória na borda da barra.
   */
  cromo: p.navy,
  /**
   * O anel de foco é BRANCO, nunca o acento: o azul de interface tem o matiz
   * do turbo, e um contorno azul em volta de um campo seria um sinal de apito
   * fora do card.
   */
  focoAnel: p.branco,
  /** Véu do paywall: o fundo do manual em dois passos, sobre a silhueta. */
  veuPaywallInicio: p.fundoNipVeu20,
  veuPaywallFim: p.fundoNipVeu70,
  /** A barra de navegação sobe para o topo a partir daqui. */
  larguraTopo: p.pontoDeQuebraTopo,
  /** A lateral direita passa a existir a partir daqui. */
  larguraLateral: p.pontoDeQuebraLateral,
} as const

export type Semantico = typeof semantico
