# Identidade 05 · Manual da Marca: a NIP na identidade oficial, com a moldura do StatsHub

**Data:** 18/09/2026 · **Status:** **IMPLEMENTADA em 18/09/2026**, nas cinco fatias da §13, no
worktree `nba-projeto-marca` (branch `identidade-05-manual-da-marca`). Login e logo continuam
fora, aguardando o arquivo do cliente. A conferência visual foi feita com as CAPTURAS reais de
cada fase (`scripts/captura-telas.sh`, agora em 320/390/768/1440 com detector de rolagem
horizontal), no lugar dos artboards da §10 — o parceiro mandou executar sem produzi-los.
**Herda de:** [`04 Varredura e análise`](2026-09-07-ux-varredura-e-analise-design.md), que
fica em tudo que não é marca (card de 3 zonas, ciclo do card, por jogo, folha de filtros,
lentes, texto em opacidades), e de [`Planos de assinatura`](2026-09-15-planos-de-assinatura-design.md),
cujos portões e matriz (§5, §6) não mudam.
**Substitui:** o princípio da Identidade 04 de que "a identidade atual fica". O Manual da
Marca (PDF, v1.0, 16/09/2026, seis páginas) trouxe identidade nova, e o parceiro confirmou
que ela vale.
**Fontes:** o manual; o StatsHub (https://www.statshub.com, futebol, desktop-first)
capturado a 1440 e 390 px (home, Player Trends, Prop Screener); o baseline das 58 telas
atuais da NIP a 390 e 1280 px (`scripts/captura-telas.sh`); medições de contraste WCAG
com `tokens/contraste.ts`.

---

## 1 · Objetivo em uma frase

Vestir a NIP com a identidade do manual (azul, vermelho, navy, Bebas Neue, Montserrat, logo
como imagem) e dar às telas a moldura do StatsHub (barra do topo no desktop, chips de
filtro, seções colapsáveis, lateral direita), sem tocar em nada que seja dado de estratégia
e sem inventar regra que o CJ não definiu.

## 2 · Problema

O manual proíbe três coisas que o app faz hoje:

- **Laranja como cor padrão da interface.** O acento `#FF7A1A` está em botões, abas ativas,
  chips, links, anel de foco, marcador da sobrancelha e véu do Fire Live.
- **Marca recriada com texto.** `MarcaNip.tsx` renderiza `<strong>NIP</strong>`; o manual
  manda usar o arquivo de logo como imagem e não recriar N, I, P, bola ou gráfico com CSS.
  Não há arquivo de logo no repositório: o cliente ainda não o enviou.
- **Anton e Barlow.** O manual fixa Bebas Neue (títulos curtos, chamadas, números de
  impacto; nunca em formulário) e Montserrat (interface, campos, botões, explicações,
  dados; pesos 400 a 700).

E o parceiro quer, além da identidade, a **moldura do StatsHub**: cabeçalho em display
condensado, chips de filtro, seções colapsáveis, lateral direita com resultados,
classificação e assistente. Decisão explícita dele, contra a recomendação da Identidade 04
e contra a nossa: **desktop manda, celular colapsa**. Desenha-se a 1440; a 390 é a coluna
única, sem perder nada.

O baseline mostrou ainda um defeito que a passada corrige de passagem: a 390 px a Lista
**vaza pela direita**, porque `GRADE_DE_CARDS = minmax(420px, 1fr)` força 420 numa tela
com 358 úteis.

## 3 · Princípios fechados no grilling e nas seções

1. **Dado não é marca.** Os canais de estratégia não mudam: anel do apito (🟡 1, 🟠 2,
   🟢 3, 🔵 turbo), borda metálica do nível do jogador, rampa turquesa de confiança, nota
   da partida, barrinhas. O 🟠 do nível 2 fica, porque é vocabulário homologado do CJ
   (regra 3 do CLAUDE.md); o manual proíbe o laranja como cor **da interface**, e sinal não
   é interface.
2. **Azul é preenchimento, nunca tinta.** O azul do manual (`#0057B8`, matiz 212°) tem o
   mesmo matiz do azul do turbo (`#4DA3FF`, 211°). Como texto sobre o cartão dá 2,48 e
   reprova; qualquer tinta clara que passe em AA (`#4D9BF5` = 5,95) é, aos olhos, o 🔵 do
   CJ. Logo o azul só existe como preenchimento com texto branco (6,87): botão, pílula
   ativa, selo, chip ativo. A tinta continua branca em quatro opacidades. Links viram
   branco sublinhado; contornos ativos viram preenchimento; o anel de foco é branco.
3. **Vermelho: cheio no selo, claro na tinta.** `#C8102E` como texto no cartão dá 2,90.
   Como selo com branco, 5,88. A divisão que o app já tem (sólido claro para texto e ponto,
   cheio para o selo) fica; só troca o pigmento.
4. **O card fica; a moldura vira StatsHub.** O card de 3 zonas aprovado na 04 é o formato
   único. O Player Trends do StatsHub é a mesma página que a Lista: título, controles,
   contador, cards. O que muda é o que envolve o card.
5. **Uma marca, um sistema (abordagem A).** Tokens primeiro, o app inteiro muda de cor
   num diff; depois a moldura; depois tela a tela. Descartadas: B (tela a tela completa,
   que faria duas identidades conviverem por semanas) e C (virada única, que trava na logo
   e contradiz "quero ver logo").
6. **Tela crua não entra.** Cada fatia tem mockup aprovado antes do código, a 1440 **e**
   a 390 (§10).
7. **Regra 3 vale para redação.** "MÉDIA 4,9 · ODD MÉDIA 1,58" continua como está até a
   decisão editorial do parceiro. Nenhuma regra, limiar ou rótulo de estratégia muda.
8. **O piso de 12 px é por tela.** O manual pede nada abaixo de 12 px; o app tem 62
   ocorrências em 30 arquivos. Não é troca de token: entra na fatia de cada tela, com o
   mockup dela.

## 4 · Tokens

### 4.1 · O manual, na íntegra

Cinco cores de marca: azul `#0057B8`, vermelho `#C8102E`, azul profundo (navy) `#001D3D`,
branco `#FFFFFF`, cinza `#A6ABB4`. Quatro superfícies: fundo `#071426`, cartão `#101C30`,
campo `#18243A`, divisória `#2A3852`. Espaçamento em base 8 (8, 16, 24, 32, 48). Cantos:
8 px em controle, 12 px em card. Botão primário azul, texto branco, 48 px de altura mínima,
hover mais claro, foco visível. Campo: rótulo acima, 52 px, placeholder cinza, erro em texto
junto do campo e nunca só pela cor. Texto: corpo 16, secundário 14, títulos 24–32, nada
abaixo de 12. Ícones de traço, 20–24 px, nunca no lugar do rótulo. Bebas Neue para títulos
curtos, chamadas e números de impacto, nunca em formulário; Montserrat para o resto, pesos
400/500/600/700. Validação em 320, 390, 768 e 1440 px, sem rolagem horizontal.

### 4.2 · O que não muda (é dado)

`apitoNivel1/2/3`, `apitoTurbo`, `apitoModoFire` e as tintas `*Tinta`; `nivelMvp`,
`nivelAllStar`, `nivelSuporte`, `nivelRandola`; `confiancaGrau1..5`; `nota*`;
`barrinhaBateu`, `barrinhaFalhou`; `turboClaro`, `turboEscuro`; `avatarFundo2..6`;
as durações. `textoSobreCor` (escuro, `#080D16`) **fica** para o número dentro do anel: o
teste "texto branco dentro do anel reprovaria" continua valendo.

### 4.3 · O que muda (semântico → hoje → novo)

| Token | Hoje | Novo | Medida |
| --- | --- | --- | --- |
| `fundo` | `#0B1220` | `#071426` (fundo do manual) | tinta50 sobre ele: 17,3 |
| `superficie` | `#131C2E` | `#101C30` (cartão) | |
| `superficieElevada` | `#1B2740` | `#18243A` (campo) | |
| `divisor` | `#2A3852` | `#2A3852` — idêntico | |
| `textoPrimario` / `texto100` | tinta50 | `#FFFFFF` (branco do manual); `texto70` e `texto55` se re-derivam do branco; `texto40` continua no piso de 55 % | |
| `textoSecundario` | `#8D9AB0` | `#A6ABB4` (cinza do manual) | 7,4 no cartão; 6,7 no campo |
| `acento` | `#FF7A1A` | `#0057B8` — **só preenchimento** | branco em cima: 6,87 |
| `acentoClaro` | `#FFB25E` | `#1F6BC1` (hover: azul + 12 % de branco) | branco em cima: 5,34 |
| `acentoVeu` | laranja 8 % | `rgba(0,87,184,.08)` | |
| `veuFrio` | turquesa 7 % | `rgba(0,87,184,.07)` | |
| `vivoSelo` | `#E03E3E` | `#C8102E` (vermelho do manual), texto branco | 5,88 |
| `aoVivo`, `aoVivoSolido`, `alerta` | `#FF6B6B` | `#FF5C70` (tinta clara derivada do vermelho) | 5,70 no cartão; 5,54 no quente |
| `aoVivoTinta` / `aoVivoBorda` | vermelho400 a 14 % / 45 % | os mesmos véus a partir de `#FF5C70` | |
| `veuQuente` / `veuFire` | laranja 8 % / 22 % | `rgba(200,16,46,.08)` / `rgba(200,16,46,.22)` | |
| `superficieQuente1` / `2` | roxo `#241A2E` / `#161226` | cartão + 12 % de vermelho `#221B30`; campo + 15 % `#2C1A30` | quase o roxo de hoje, agora derivado do manual |
| `bordaQuente` | `#3A2A52` | divisória + 12 % de vermelho `#3D334E` | |
| `superficieFria1` / `2` | marinho `#16213A` / `#111A2E` | campo + 10 % de azul `#162947`; cartão + 10 % `#0E223E` | |
| `fundoTelaFim` | `#101A2E` | `#0B1830` | o degradê da tela fica, mais sutil |
| `fonteTitulo` | Anton | Bebas Neue (`--fonte-bebas`) | |
| `fonteCorpo` | Barlow | Montserrat (`--fonte-montserrat`) | |
| `fonteRotulo` | Barlow Condensed | Montserrat 600, caixa-alta, tracking 0,06 em | o manual limita a Bebas e a proíbe em formulário |
| **novo** `textoSobreAcento` | — | `#FFFFFF` | para tudo que senta sobre azul ou vermelho |
| **novo** `cromo` | — | `#001D3D` (navy) | barra do topo, barra inferior, painel da marca do login |

O navy sobre o fundo dá 1,09: o cromo **não se separa do conteúdo por contraste, e sim
pela linha divisória** (`divisor`) na borda da barra. É o que o StatsHub faz.

No primitivo, entram `azulNip`, `azulNipHover`, `vermelhoNip`, `vermelhoNipClaro`, `navy`,
`cinzaNip`, as quatro superfícies, as superfícies derivadas e os véus; saem `laranjaAcento`,
`laranjaAcentoClaro`, `laranjaVeu`, `laranjaVeuFire`, `turquesaVeu`, `marinho*`, `roxo*`,
`fonteAnton`, `fonteBarlow*`. `laranja400` e `laranjaVeu12` **ficam**: são o nível 2.

### 4.4 · Regras que caem da tabela

- **Texto sobre cor vira dois tokens.** Dos 23 usos de `textoSobreCor`, migram para
  `textoSobreAcento` os que sentam sobre `acento` ou `vivoSelo`: CTAs de entrar, cadastrar,
  assinar, gestão, estatísticas, conta, offline, o convite do plano, as abas e o seletor de
  `CabecalhoTela`, os painéis PWA. Ficam no escuro: `Avatar` (número no anel), `Barrinhas`
  (número sobre o verde). `layout.tsx` e `manifest.ts` usam `textoSobreCor` como cor de
  fundo do PWA por acidente de nome; passam a `fundo`.
- **Acento como tinta some.** Cerca de vinte pontos usam `acento` em `color`, `border`,
  `outline` ou `stroke` (links da home e de resultados, chips de período e atributo do
  jogador, `BotaoVoltar`, `FolhaDeFiltros`, blocos da conta, ícones da navegação, botão do
  chat, os `outline` de foco, a `QuadraAoVivo`). Cada um vira preenchimento com
  `textoSobreAcento`, ou branco com peso, ou contorno neutro. O anel de foco é `texto100`
  a 2 px.
- **CTA é chapado.** `componente.ctaFundo` deixa de ser degradê: `acento` com hover em
  `acentoClaro`, 48 px de altura, raio 8.
- **Fontes.** `layout.tsx` troca `Anton`/`Barlow`/`Barlow_Condensed` por `Bebas_Neue`
  (peso 400) e `Montserrat` (400, 500, 600, 700) de `next/font/google`, sem request em
  runtime. As variáveis `--fonte-anton`, `--fonte-barlow` e `--fonte-barlow-condensed`
  somem; `globals.css` e os testes que as citam acompanham.
- **Dígito tabular.** Bebas Neue entra em placar, nota, confiança e contador. Antes de
  usá-la em número que muda ao vivo, um teste mede a largura de "88" e "11" na fonte
  carregada; se diferirem, os números que mudam a cada refresh (placar do 1º Q, badge de
  status, "FALTA n") ficam em Montserrat com `font-variant-numeric: tabular-nums`, e a
  Bebas fica para o número que não pisca.

### 4.5 · Testes que mudam

- `tokens.test.ts`: "o acento laranja é legível sobre superfície (3,0)" **sai** e entra
  "o acento é preenchimento: `textoSobreAcento` sobre `acento` ≥ 4,5, sobre `vivoSelo`
  ≥ 4,5, sobre `acentoClaro` ≥ 4,5"; "o quente é o único com o véu laranja" vira "com o véu
  vermelho"; "texto branco dentro do anel reprovaria" fica; entra "nenhum token de
  interface usa o matiz do turbo como tinta" (o único azul-claro do sistema é
  `apitoTurbo` e seu par).
- `tokens.css` regenerado com `npm run tokens`; o teste de sincronia cobra.
- `acessibilidade-identidade-04.test.ts` reroda com os valores novos (DNP sobre a opacidade
  do card).
- Os testes que afirmam `var(--fonte-anton)` ou `var(--fonte-barlow-condensed)`
  (`tabela`, `hierarquia-do-time`, `cabecalho-jogo`, `nota-partida`) passam a afirmar as
  variáveis novas.
- `npm run boundaries` continua: componente não importa primitivo.

## 5 · Moldura e navegação

Hoje três molduras repetem a barra inferior (`Moldura`, `MolduraConta`, `Esqueleto`), há
duas larguras (leitura 640, dados 1120), a barra é fixa embaixo em qualquer largura e o
assistente é um botão flutuante. Passa a existir **uma `Moldura` com três regiões**; o que
muda entre larguras é onde cada região senta.

| Largura | Cromo (navy + linha divisória) | Conteúdo | Lateral |
| --- | --- | --- | --- |
| < 1024 | barra inferior, 5 abas | coluna única, respiro 16 | não existe; assistente flutuante |
| 1024–1279 | barra do topo: logo à esquerda, 5 pílulas, conta à direita | até 1120, respiro 24 | não existe; assistente flutuante |
| ≥ 1280 | barra do topo, idem | fluido até 1040 | 320 px fixa à direita, rolagem própria |

Decisões:

- **Sem faixa de marca no celular.** O StatsHub tem a dele porque vende cadastro ali; o
  assinante da NIP já entrou, e 48 px em cada tela custam 6 % de um iPhone. A marca fica
  no login e no Perfil.
- **Pílula ativa preenchida em azul, texto branco**, no topo e na barra inferior. Inativa
  em `textoSecundario`; hover em `superficieElevada`. Rótulos em Montserrat 600 caixa-alta,
  12 px (hoje 11). Os cinco rótulos (ENTRADAS · AO VIVO · STATS · GESTÃO · PERFIL) ficam.
  `aria-current` continua marcando o estado, redundante com o preenchimento.
- **Ícones de traço** de 20 px, traço 1,5, cinco, inline em `icones.tsx`, no lugar das
  formas geométricas da Identidade 02 (quadrado, círculo, losango), que ao lado de uma logo
  real viram ruído.
- **Duas larguras continuam.** `leitura` (640) para detalhe do apito e Como funciona,
  centrada, sem lateral. `dados` para as telas de aba, que ganham a lateral a partir de
  1280. A lateral é do produto, não do texto.
- **Grade de cards em duas colunas** no desktop: com a lateral sobram 1040 de conteúdo, e
  três colunas dariam cards de 330 px para um card desenhado a 550. A grade vira
  `repeat(auto-fill, minmax(min(420px, 100%), 1fr))`, o que corrige o vazamento a 390.
- **O esqueleto desenha o cromo inteiro**, topo e lateral incluídos, como hoje desenha a
  barra. Trocar de aba não pisca a moldura.
- **`MolduraConta` encolhe** para entrar e cadastrar; perfil e gestão passam à `Moldura`.
  O login recebe o layout aprovado do manual (p. 4) quando a logo chegar; até lá continua
  como está, só com os tokens.
- **Barra do topo, da esquerda para a direita:** logo (compacta abaixo de 1280; com a
  assinatura "NBA Intelligence Platform" quando houver largura, como o manual pede), as
  cinco pílulas, e o `AvatarUsuario` como atalho para a conta. Altura 64. `position:
  sticky` no topo.
- **Pontos de quebra viram tokens** (`larguraTopo: 1024`, `larguraLateral: 1280`) e vivem
  numa folha CSS da moldura, porque a troca topo/inferior exige `@media`, e a `Moldura`
  continua componente de servidor.

**Cabeçalho de tela** (`CabecalhoTela`, parte da moldura): H1 em Bebas 32; sobrancelha em
Montserrat 12 caixa-alta, **sem o marcador colorido**, porque o selo PRÉ-LIVE / AO VIVO no
canto já diz o contexto; selo em azul (pré-live) ou vermelho (ao vivo) com texto branco;
seletor POR JOGO · POR NÍVEL segmentado com pílula preenchida; lentes viram **abas com
sublinhado branco** de 2 px, roláveis no celular; o contador ("37" em Bebas 24 + rótulo)
é um slot novo, `contador`, que as telas de lista preenchem.

## 6 · Lista Secreta a 1440 e a 390

A página, de cima para baixo:

1. **Cabeçalho**: sobrancelha LISTA SECRETA, H1 LISTA DO DIA, selo PRÉ-LIVE. A linha
   "Rodada de quinta, 15 de janeiro · publicada às 15h" é a descrição em Montserrat 14,
   `textoSecundario`. A narrativa do dia fica abaixo, com a régua lateral em `divisor`.
2. **Fileira de controles, uma linha no desktop**: o segmentado, depois os filtros. **A
   partir de 1024 a folha de filtros vira chips com menu**: 5 ENTRADAS ▾, MÉTODO ▾,
   NÍVEL ▾, TIME ▾, POSIÇÃO ▾, cada um um `<details>` que abre o grupo correspondente da
   folha. Os filtros seguem na URL, montados pela tela; só a apresentação muda. Abaixo de
   1024 ficam o botão FILTRAR e o chip do recorte ativo, como a Identidade 04 decidiu. As
   lentes (ÚLT. 5 · MÉDIA × LINHA · ODDS · HIERARQUIA) são a fileira de abas.
3. **Contador**: "37" + "ENTRADAS EM 7 JOGOS".
4. **Seções por jogo colapsáveis**: cada jogo é um `<details open>` com o `CabecalhoJogo`
   como `<summary>` e o chevron em `textoSecundario`. Aberto por padrão, sem persistir.
   POR NÍVEL continua sem seções, numa grade só.

O card de 3 zonas:

- **Fica**: as três zonas, o anel, a borda metálica, a borda lateral no grau de
  confiança, as barrinhas, a narrativa, as lentes trocando a zona 2, as abas PTS · REB ·
  AST, o rodapé com linha e "fez 27 ✓", o badge de status de largura fixa, o brilho do
  grau 5, o brilho do turbo.
- **Tipografia**: nome em Bebas 20 (a Bebas é mais leve que a Anton; 17 ficaria magro),
  confiança em Bebas 34 (com a checagem de dígito tabular da §4.4), rótulos em Montserrat
  12 caixa-alta, narrativa em Montserrat 13.
- **Piso de 12 px na Lista**: nove textos sobem para 12: "ÚLT. 5 NA LINHA", os números
  das barrinhas (caixas de 22 para 24 px), o badge de status (largura de 52 para 60 px),
  os dois rótulos do `CabecalhoJogo`, o botão de acompanhar, as lentes. O card cresce
  cerca de 6 %.
- **"+ ACOMPANHAR JOGADOR" entra no card**: estrela de 24 px no canto superior direito,
  ao lado do badge de status, acima da cobertura do link do card; preenchida em branco
  quando acompanhado; nome acessível "Acompanhar jogador". O botão solto abaixo de cada
  card, que quebra o ritmo da grade, some.
- **Cores**: degradê frio derivado do azul, véu azul no rodapé, nada laranja.

| | 1440 | 390 |
| --- | --- | --- |
| Controles | uma linha: segmentado, chips com menu, abas de lente | segmentado + FILTRAR; abas de lente roláveis |
| Grade | 2 colunas de ~505 px por seção, lateral à direita | 1 coluna de 358 px, sem vazar |
| Assistente | na lateral | botão flutuante |

Estados ficam os mesmos, só vestidos: grátis (§8), "a lista sai às 18h" antes da
publicação, "nenhuma entrada", recorte vazio.

## 7 · Lateral direita

Só a partir de 1280, só nas telas de aba (`aba !== null`), 320 px, `position: sticky` sob a
barra do topo, altura da janela menos a barra, rolagem própria. Três blocos:

1. **Última noite conferida** (todos os níveis; Resultados é grátis por decisão de venda).
   Título "NOITE DE QUINTA 14/01" em rótulo; APITOS · BATERAM · NA NOITE % em Bebas 24;
   "Temporada: 68 % em 412 apitos"; link "Ver a noite" para `/resultados/<data>`. A data
   é a de `ultimaRodadaConferida`, a mesma regra que a tela usa sem data. Com a noite em
   curso, o bloco escreve "aguardando o fim da noite" no lugar da taxa, como a tela já faz.
   Nunca taxa parcial.
2. **Classificação** (todos os níveis). Abas LESTE · OESTE em sublinhado, Leste aberta
   por padrão, troca no cliente, sem persistir. Colunas POS · logo e sigla · V–D · %;
   8 linhas de 32 px; link "Ver completa" para a tabela em Estatísticas. Oito não é regra:
   é o que cabe.
3. **Assistente** (MVP e acima; o grátis vê o banner da §8 no topo e não tem doca).
   Ancorado no rodapé da lateral. Recolhido: o campo "Pergunte sobre a lista de hoje" e,
   acima, a primeira linha da última resposta do dia, quando houver. Ao focar, a conversa
   cresce para cima até 60 % da altura da janela, e os blocos 1 e 2 rolam para fora.
   Reaproveita `PainelChat` inteiro (histórico do dia, cotas, limite por minuto, frases de
   erro); o campo recolhido é um formulário estático e o painel só baixa no primeiro foco.
   Abaixo de 1280 vale o botão flutuante de hoje. O portão é o mesmo `assistente` que a
   página já passa à `Moldura`; nenhuma regra nova.

O estado do Fire Live **não** vai para a lateral (decisão do parceiro).

**Custo**: dois leitores a mais por página a 1280 ou mais, `recapDaNoite` da última rodada
e `telaDaClassificacao`. Os dois mudam poucas vezes por dia; entram atrás de um leitor
cacheado por dia, invalidado pelo job de conferência e pela sincronização da
classificação. Nunca consulta por usuário. É o único ponto novo de infraestrutura da
passada, e `paywall.test.ts` ("nenhuma página paga opta por cache compartilhado") continua
valendo, porque o cache é do leitor da lateral, que só lê dado grátis.

## 8 · Paywall

O que o grátis vê em cada tela está fixado na spec de planos (§5 e §6) e não muda. Muda a
roupa, e ela é o **efeito StatsHub**: silhuetas borradas atrás de um véu.

**A restrição.** `paywall.test.ts` exige que o feed pago nunca seja lido antes do portão:
nada do sinal entra no HTML do grátis. O borrão portanto **não pode** ser um card real com
CSS por cima, nem a quantidade de cards pode ser real: são **silhuetas** fixas, sem nome,
sem número, sem cor de anel, idênticas em todo jogo, duas por seção, estáticas (sem o
brilho do `Esqueleto`, para não parecerem "carregando" eterno), `aria-hidden`, com um
cadeado e o véu por cima. O texto acessível é o do convite.

Por tela:

- **Lista e Fire Live.** A moldura é a do pagante (H1, selo, data, descrição), sem contador
  e sem controles. Abaixo, o **banner** azul do manual, no lugar da promo do StatsHub: "A
  LISTA SECRETA COMEÇA NO MVP" em Bebas, uma linha em Montserrat, botão branco com texto em
  navy (16,9) "Ver planos". Depois, cada jogo do dia com o `CabecalhoJogo` real (siglas,
  horário, status, o que `JogosDoDia` já mostra) e duas silhuetas. No Fire Live as
  silhuetas são neutras: nunca o universo quente, nunca o modo fire.
- **Estatísticas, as quatro páginas.** As seções pagas mantêm o título e ganham a silhueta
  da própria forma (linhas de tabela no box score e no jogo a jogo, grade de números nos
  números completos, linhas de card nos apitos da estratégia) com um **convite compacto**
  por cima: "O jogo a jogo começa no MVP · Ver planos". Compacto porque a página do
  jogador tem três seções pagas em sequência.
- **Gestão.** Histórico legível como hoje; a coluna de registrar vira silhueta de
  formulário com o convite compacto.
- **Conta.** "Grátis" e o botão azul para os planos. A página do apito segue redirecionando.
- **Lateral, a 1280 ou mais.** Para o grátis o bloco do topo é o banner e a doca do
  assistente não existe; a frase do banner absorve o assistente ("Lista, Fire Live e
  assistente começam no MVP"). Assim o banner não se repete: na lateral no desktop, inline
  no celular e em 1024–1279.

**Mecânica.** `ConviteDoPlano` ganha `variante: 'faixa' | 'compacto'` e continua sendo o
único componente de convite. Entra `SilhuetaPaga` (`components/planos/`), com
`forma: 'cards' | 'tabela' | 'numeros' | 'formulario'`, puro CSS, sem prop de dado. A
página de planos (`/assinar`) só recebe os tokens; o redesenho dela é fatia própria, fora
desta spec.

## 9 · Arquitetura

```
src/design-system/tokens/
  primitivo.ts                  paleta do manual entra; laranja de interface, marinho, roxo,
                                turquesaVeu e as fontes antigas saem; laranja400 fica (nível 2)
  semantico.ts                  tabela da §4.3; + textoSobreAcento, cromo; larguraTopo, larguraLateral
  componente.ts                 ctaFundo chapado; contextoFrio/Quente re-derivados; + moldura
                                (cromo, lateral), + chipMenu, + silhueta
  tokens.css                    regenerado (npm run tokens)
src/app/layout.tsx              Bebas_Neue + Montserrat via next/font; themeColor = fundo
src/app/globals.css             variáveis de fonte novas
src/design-system/componentes/
  MarcaNip.tsx                  continua texto até a logo chegar; `compacta` segue sendo a prop
  CardEntrada.tsx               Bebas 20/34, piso de 12, estrela de acompanhar no canto
  Barrinhas.tsx, CabecalhoJogo.tsx   piso de 12; CabecalhoJogo aceita ser <summary>
  SeloContexto.tsx              azul/vermelho com textoSobreAcento
  QuadraAoVivo.tsx, BarraAlvo.tsx    sem acento como tinta
src/components/navegacao/
  Moldura.tsx                   as três regiões; grade com min(420px, 100%); slot `lateral`
  Moldura.module.css            NOVO · @media dos pontos de quebra; sticky do topo e da lateral
  BarraTopo.tsx                 NOVO · logo, cinco pílulas, avatar; ≥ 1024
  BarraInferior.tsx             pílulas preenchidas, ícones de traço, 12 px
  icones.tsx                    cinco ícones de traço
  CabecalhoTela.tsx             Bebas 32, sem marcador, abas de lente, slot `contador`
  FolhaDeFiltros.tsx            + modo chips com menu (≥ 1024), mesmo HTML dos grupos
  Esqueleto.tsx                 desenha topo e lateral
  Chip.tsx                      extraído de CabecalhoTela; preenchido quando ativo
src/components/lateral/         NOVO
  Lateral.tsx                   montagem dos três blocos; recebe `assistente` e `nivel`
  UltimaNoite.tsx               os três números + temporada + link
  ClassificacaoCompacta.tsx     LESTE · OESTE, 8 linhas (cliente só para a troca)
  DocaDoAssistente.tsx          campo recolhido + PainelChat sob demanda
src/components/planos/
  ConviteDoPlano.tsx            variantes faixa e compacto
  SilhuetaPaga.tsx              NOVO · formas fixas, aria-hidden
src/components/conta/MolduraConta.tsx   só entrar e cadastrar
src/modules/entrega/lateral.ts  NOVO · leitor cacheado por dia (recap da última rodada +
                                classificação); só dado grátis
src/app/(app)/page.tsx          chips com menu, contador, <details> por jogo, grátis com
                                banner + silhuetas
src/app/(app)/**/page.tsx       Moldura nova; textoSobreAcento nos CTAs; acento sem tinta
scripts/gerar-tokens-css.mts    inalterado; roda de novo
docs/04-design-system.md        + seção "Identidade 05 — referência vigente"
```

O motor **não muda**. Nenhuma leitura nova de dado pago. A `Moldura` continua componente
de servidor: a troca topo/inferior é CSS, a lateral é HTML do servidor, e só a troca
Leste/Oeste e a doca do assistente têm JavaScript, os dois carregados sob demanda.

## 10 · Mockups

Um canvas, **"Identidade 05 · Manual da Marca"**, com artboards a **1440 e 390** por fatia,
na identidade nova, cada um com o estado principal e um secundário:

1. **Tokens**: a galeria do design system (o card nos quatro níveis do apito, os três
   contextos, o selo, o CTA, o chip ativo e inativo, a doca) a 1440. Sem 390: são peças.
2. **Moldura**: barra do topo + lateral vazia a 1440; barra inferior a 390; o esqueleto
   nas duas.
3. **Lista Secreta**: por jogo, com uma seção fechada, a 1440 e 390; por nível como
   variante.
4. **Lateral**: os três blocos com o assistente recolhido e aberto, a 1440.
5. **Paywall**: a Lista do grátis com banner e silhuetas a 1440 e 390; a página do jogador
   com um convite compacto.

Gate: nenhuma fatia vira tarefa do plano antes de o parceiro aprovar o artboard dela.
Aprovação parcial libera tarefas parciais. O login **não** tem artboard nesta spec: espera
a logo.

## 11 · Verificação

- `npm run tokens`, `npm test`, `npm run typecheck`, `npm run lint`, `npm run boundaries`
  verdes a cada fatia.
- Contraste, por teste: `textoSobreAcento` sobre `acento`, `acentoClaro` e `vivoSelo`
  ≥ 4,5; `textoSecundario` sobre `superficie` e `superficieElevada` ≥ 4,5; `aoVivoSolido`
  sobre `superficieQuente1` ≥ 4,5; nenhum token de interface com o matiz do turbo como
  tinta; o número dentro do anel continua ≥ 4,5 com `textoSobreCor`.
- Dígito tabular da Bebas medido antes da fatia 1 entrar em número vivo (§4.4).
- Capturas em **320, 390, 768 e 1440** (o manual pede as quatro; `captura-telas.mjs`
  passa a aceitar a lista de larguras) com a conferência de **rolagem horizontal zero**
  em todas, o que fecha o defeito do baseline.
- Grep de fechamento: nenhum `#FF7A1A`, `#FFB25E`, `Anton`, `Barlow`, `--fonte-anton`,
  `--fonte-barlow*` fora de comentário histórico; nenhum `fontSize` abaixo de 12 nas telas
  já fatiadas.
- `paywall.test.ts` ganha "a silhueta não recebe prop de dado" (o componente não tem props
  além de `forma`) e "o HTML do grátis não contém nome de jogador do feed".
- A galeria do admin (`/admin/galeria`) mostra os tokens novos e os contrastes medidos.

## 12 · Fora de escopo e aguardando

- **Aguardando a logo** (o cliente não a enviou): o login no layout aprovado do manual
  (marca à esquerda ~55 %, formulário à direita 45 %; celular em uma coluna sem a quadra),
  a logo na barra do topo e a assinatura. Até lá, `MarcaNip` continua texto.
- **Fatias posteriores, com mockup próprio**: Fire Live, detalhe do apito, Resultados,
  Estatísticas (as quatro páginas, com o Prop Screener do StatsHub como molde da tabela),
  Gestão, Conta, Como funciona, `/assinar`, o painel do admin. Nas fatias 1 e 2 elas só
  recebem tokens e moldura, o que já as deixa na identidade nova.
- **Decisão editorial do parceiro**: "MÉDIA · ODD MÉDIA".
- **Não copiar do StatsHub**: odds por casa com links, "Save pick" como aposta, a promo
  do Telegram, o feed de tweets, os borrões sobre dado real, qualquer paywall que fatie o
  sinal, probabilidade em qualquer forma.
- **Não decidir aqui**: escudos (LogoTime já existe e não é desta passada), fuso da
  rodada, a cota do assistente por nível.

## 13 · Ordem

1. **Tokens** (§4) + galeria do admin + `docs/04` — o app inteiro muda de cor num PR, sem
   mudar de forma. Inclui a checagem do dígito tabular.
2. **Moldura e navegação** (§5) — barra do topo, barra inferior nova, esqueleto, grade
   corrigida, `MolduraConta` reduzida. A lateral entra vazia, como slot.
3. **Lista Secreta** (§6) — chips com menu, contador, seções, o card na tipografia nova, a
   estrela, o piso de 12.
4. **Lateral** (§7) — os três blocos e o leitor cacheado.
5. **Paywall** (§8) — banner, silhuetas, convite compacto, em todas as telas que já têm
   portão.

Cada fatia: mockup aprovado → tarefa → fumaça renderizada nas quatro larguras →
`demo:conferir`. Um commit só ao fim do trabalho, como o parceiro pediu.

## 14 · Riscos

- **Bebas Neue sem dígito tabular** faria placar e badge pularem a cada refresh. Mitigado
  pela medição antes da fatia 1 e pelo recuo para Montserrat `tnum` nos números vivos.
- **Dois azuis na tela** (o da interface, preenchido; o do turbo, categórico). A regra
  "azul nunca é tinta" e o teste de matiz são o que impede o turbo de parecer botão.
- **Densidade**: o piso de 12 px encompridará o card e as tabelas. Por isso é decisão
  por tela, com o mockup dela, e não um `sed`.
- **A lateral custa duas leituras por página** no desktop; o leitor cacheado é
  obrigatório, não opcional.
- **Vinte pontos de acento como tinta** espalhados por telas que não são desta passada:
  a fatia 1 os cobre todos, porque deixar um contorno laranja sobrando contradiz "uma
  marca, um sistema".
