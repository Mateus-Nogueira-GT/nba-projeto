# Correções de UX no desktop — o que a auditoria da Identidade 05 encontrou

**Data:** 19/09/2026 · **Status:** spec escrita a partir da auditoria de 19/09 (código lido,
telas renderizadas a 1440 nos estados que os testes não capturam, fluxos conferidos pelo
código); **aguardando a leitura do parceiro**.
**Corrige:** [`Identidade 05 · Manual da Marca`](2026-09-18-identidade-05-manual-da-marca-design.md),
mesclada na `main` em 19/09 (`950be66`). Nada aqui muda decisão daquela spec; tudo aqui é
defeito de execução ou consequência que só apareceu na tela.
**Irmã:** [`Correções de lógica`](2026-09-19-correcoes-logica-identidade-05-design.md) — o que
é dado errado ou regra ignorada mora lá; o que é tela, interação e hierarquia visual mora aqui.
**Escopo de largura:** desktop, 1024 px ou mais. O celular não entra nesta passada.

---

## 1 · Objetivo em uma frase

Fechar os dezoito defeitos de desktop que a auditoria encontrou na Identidade 05 — três
regressões introduzidas pela própria passada, e quinze comportamentos novos que a tela
mostrou errados — sem reabrir nenhuma decisão de identidade.

## 2 · Problema

A Identidade 05 foi executada com testes de HTML estático e capturas nas quatro larguras.
Isso pega vazamento, paleta e estrutura; não pega o que só aparece em três situações que a
auditoria de 19/09 renderizou de propósito: um menu de filtro ABERTO, o grátis nas telas
de Estatísticas e Gestão, e as telas que não são abas (detalhe do apito, time, teoria) a
1440. Também não pega o que só um clique revela — e o arnês não hidrata React.

A auditoria separou o que achou em três grupos, e esta spec cobre os dois primeiros:

- **Regressões da passada** (§4.1–4.3): uma troca em lote de token deixou texto branco
  sobre fundo branco em quatro botões; a coluna do canto do card cobriu o número de
  confiança; e a regra "contorno azul vira preenchido" promoveu o botão de sair a ação
  primária.
- **Comportamentos novos errados no desktop** (§4.4–4.18): menus que não fecham ou abrem
  por cima da lateral, filtros sem "limpar", telas sem navegação nenhuma, esqueleto que
  faz a tela pular, doca que abre no foco, Estatísticas que perderam largura, nada com
  hover, e detalhes de acessibilidade e escrita.

## 3 · Princípios

1. **Nenhuma decisão de identidade reabre.** Azul só preenchimento, vermelho cheio no
   selo, Bebas nos números, três regiões da moldura, silhuetas no paywall: tudo fica.
   O que muda é execução.
2. **Primário é UMA ação por tela.** Botão azul cheio é o que a pessoa veio fazer ali.
   Sair, cancelar e voltar são secundários: contorno em `divisor`, texto branco.
3. **Hover existe.** O manual pede "estado hover mais claro"; os tokens já existem
   (`ctaFundoHover`, `pilulaNav.fundoHover`) e nenhum é lido, porque tudo é estilo
   embutido. Estilo embutido não tem `:hover` — a solução é classe, não mais token.
4. **Desktop tem navegação sempre.** Uma tela sem barra do topo é um beco; no celular a
   ausência da barra inferior nas telas de leitura foi decisão da Identidade 04 e fica.
5. **Teclado passa por tudo.** Nada abre só porque recebeu foco.
6. **O que o arnês não hidrata, o código prova e a preview confirma.** Os
   comportamentos de clique (fechar menu ao clicar fora, abrir a doca) ficam com
   asserção de fonte e um passo manual na preview, escrito no plano.

## 4 · As correções

Cada item: o erro, como aparece, a correção, o critério de aceite.

### 4.1 · Texto branco sobre fundo branco (regressão)

**Erro.** A Identidade 05 trocou `textoSobreCor` por `textoSobreAcento` em 23 pontos
assumindo fundo azul. Cinco têm outro fundo: o botão "Buscar" de Estatísticas, "Registrei"
e "Aplicar" da Gestão e o seletor de banca ativo (fundo `textoPrimario`, branco), e "Tentar
novamente" da tela offline (fundo verde do nível 3; branco sobre ele reprova em AA).
**Como aparece.** Estatísticas: um retângulo branco sem palavra ao lado da busca. Gestão
(MVP): os dois botões e o valor de banca escolhido viram retângulos brancos vazios.
**Correção.** Os quatro botões são ações primárias e vestem o botão do manual
(`ctaFundo` + `ctaTexto`, via a classe `.botao-primario` de 4.15). O seletor de banca ativo
é pílula preenchida no acento, como todo chip ativo. O offline volta a `textoSobreCor`
sobre o verde.
**Aceite.** Um teste varre `src/app` e `src/components`: todo `color:` com
`textoSobreAcento` ou `ctaTexto` está num bloco cujo `background` é `acento`, `acentoClaro`,
`vivoSelo`, `ctaFundo` ou `pilulaNav.fundoAtiva`. É o par do teste "azul nunca é tinta".

### 4.2 · O número de confiança deixou de abrir a análise (regressão)

**Erro.** Para a estrela ficar clicável acima da cobertura do card, a coluna inteira do
canto ganhou `position: relative; zIndex: 1` — e o número de confiança foi junto.
**Como aparece.** Na Lista, clicar no "90" grande. Antes abria o detalhe; agora nada.
**Correção.** O `zIndex` vai para um `<span>` em volta da `acaoCanto`, e só nele.
**Aceite.** `card.test.ts`: a coluna do canto não tem `z-index`; o invólucro da ação tem.

### 4.3 · "Sair" virou botão primário (regressão)

**Erro.** A regra "contorno azul vira preenchido" da fase 1 não distinguiu ação primária
de secundária. "SAIR" no Perfil ficou azul cheio, igual a "Trocar senha".
**Como aparece.** Rodapé do Perfil: um botão azul de largura de CTA para sair da conta.
**Correção.** `.botao-secundario` (contorno `divisor`, texto branco, hover em
`superficieElevada`). "Ver na casa parceira" no detalhe do apito continua azul cheio: é
link de receita e o parceiro não pediu para rebaixá-lo — **decisão dele se mudar**.
**Aceite.** `telas-05-conta`: o botão "Sair" não tem `background:#0057B8`.

### 4.4 · O menu de filtro não fecha ao clicar fora

**Erro.** Os menus de chip (≥ 1024) só fecham com Escape, ao escolher, ou ao abrir outro.
**Como aparece.** Abrir "MÉTODO" e clicar num card: o menu fica aberto sobre a página.
**Correção.** Um `pointerdown` no `document`, registrado enquanto a fileira existe, fecha
os `<details>` abertos quando o alvo não está dentro dela.
**Aceite.** Fonte de `FolhaDeFiltros` registra `pointerdown`; passo manual na preview.

### 4.5 · O menu do chip da direita abre por cima da lateral

**Erro.** O menu ancora sempre em `left: 0` com 220 px de largura mínima; o chip
POSIÇÃO está na borda direita da coluna.
**Como aparece.** A 1440, abrir POSIÇÃO ou TIME: o menu cobre o bloco de classificação
(confirmado em captura).
**Correção.** Os dois últimos chips da fileira ancoram o menu em `right: 0`.
**Aceite.** `FolhaDeFiltros.module.css` tem a regra `:nth-last-child(-n + 2)`.

### 4.6 · Não há como limpar os filtros no desktop

**Erro.** O chip "N filtros ×" vive na folha do celular, que o CSS esconde a partir de 1024.
**Como aparece.** Aplicar três filtros e procurar onde tirá-los de uma vez: só abrindo cada
menu e escolhendo "Todos".
**Correção.** O mesmo chip de recorte ativo (com o ×) sai também na fileira do desktop, à
esquerda dos menus. É um componente local, `ChipDeRecorte`, para não duplicar o markup.
**Aceite.** `FolhaDeFiltros` com `ativos` rende o link "Limpar filtro" DUAS vezes.

### 4.7 · O chip ativo perde o nome do grupo

**Erro.** Com filtro escolhido, o chip mostra só o valor: "G", "BOS", "5 vítimas".
**Correção.** "POSIÇÃO: G". O `aria-label` já era assim; o texto visível passa a ser igual.
**Aceite.** Teste da folha: `>Método: OPD<`.

### 4.8 · Telas sem aba ficam sem barra nenhuma no desktop

**Erro.** A barra do topo só existe quando `aba !== null`. Detalhe do apito, tela do time e
Como funciona perdem marca e navegação a partir de 1024 — sobra o chevron de voltar.
**Como aparece.** Abrir qualquer card a 1440 (confirmado em captura).
**Correção.** `BarraTopo` aceita `atual: Aba | null` e a `Moldura` a renderiza sempre; sem
aba, nenhuma pílula acende. A barra INFERIOR segue só com aba, como a Identidade 04 decidiu
para o celular.
**Aceite.** `navegacao.test`: `Moldura` com `aba: null` tem "Seções do app (topo)", não tem
`barra-inferior` nem `aria-current`.

### 4.9 · A tela pula ao carregar

**Erro.** O `Esqueleto` não tem lateral; o conteúdo chega com ela e a coluna encolhe de
1120 para 1040 a cada navegação a partir de 1280.
**Correção.** O `Esqueleto` reserva a coluna de 320 nas telas de aba, com dois blocos
cinzas do mesmo tamanho dos blocos reais.
**Aceite.** `Esqueleto` com `aba: 'lista'` rende `aria-label="Painel lateral"`.

### 4.10 · A doca do assistente abre no foco

**Erro.** `onFocus` abre o painel. Quem navega por Tab não passa pela lateral sem abri-lo;
ao recolher com Esc, o campo remonta sem foco e o foco vai para o topo do documento.
**Correção.** Abre com clique, com Enter, ou com a primeira tecla digitada (que não é
Tab). Ao recolher, o foco volta ao campo.
**Aceite.** Fonte da `DocaDoAssistente` sem `onFocus`, com `onClick` e `onKeyDown`;
passo manual na preview com Tab e Esc.

### 4.11 · Estatísticas a 1440 perdeu largura, e a lateral repete a classificação

**Erro.** Com a lateral, sobram 1040 px; as duas conferências lado a lado dão 508 cada, e
a tabela do Oeste (nomes longos) não cabe: rola por dentro e corta "TRILHO" (confirmado em
captura). E a lateral mostra, resumida, a classificação que a página mostra inteira.
**Correção.** Duas coisas. As conferências empilham quando há lateral e a tela tem menos
de 1600 px (a `Moldura` expõe a classe global `moldura-com-lateral` para o CSS global
enxergar). E a lateral do índice de Estatísticas não monta o bloco de classificação —
`lateralPadrao` ganha `semClassificacao`.
**Aceite.** `telas-05-classificacao`: o `<aside>` não contém "Ver completa"; `globals.css`
tem a regra de empilhamento sob `moldura-com-lateral`.

### 4.12 · "Ver completa" leva ao topo de Estatísticas

**Correção.** A grade das conferências ganha `id="classificacao"` e o link da lateral vai
para `/estatisticas#classificacao`.
**Aceite.** O índice tem o `id`; `ClassificacaoCompacta` aponta para a âncora.

### 4.13 · Concordância na faixa do grátis

**Erro.** "Lista, Fire Live e assistente COMEÇA no MVP".
**Correção.** `ConviteDoPlano` (faixa) aceita `titulo`; a lateral passa "Lista, Fire Live e
assistente começam no MVP". O `aria-label` acompanha.
**Aceite.** Teste da faixa com `titulo`.

### 4.14 · Fire Live inconsistente com a Lista

**Erro.** Na Lista o acompanhar virou estrela no canto do card; no Fire Live o botão
"+ ACOMPANHAR JOGADOR" continua solto embaixo. Está fora da fatia original, mas a diferença
já está na tela e é a mesma peça.
**Correção.** `CartaoAoVivo` repassa `acaoCanto`; a página passa a estrela e remove o botão
solto.
**Aceite.** `telas-04-firelive`: tem `aria-label="Acompanhar jogador"`, não tem
"+ Acompanhar jogador".

### 4.15 · Nada novo tem hover

**Erro.** Pílulas do topo e da barra inferior, chips, chip-menu, estrela e todos os CTAs são
estilo embutido, e estilo embutido não tem `:hover`. O manual pede hover mais claro e foco
visível.
**Correção.** Três classes globais em `globals.css`, lendo as variáveis que `tokens.css` já
publica: `.botao-primario` (fundo `--cta-fundo`, hover `--cta-fundo-hover`, foco `--foco`),
`.botao-secundario` (contorno `--divisor`, hover `--superficie-elevada`), `.pilula-nav`
(inativa transparente, `[aria-current="page"]` no acento, hover em `--superficie-elevada`),
`.chip-filtro` (idem, com contorno). Os elementos deixam de carregar fundo e cor embutidos
— o embutido vence a classe, e o hover nunca apareceria. O chip-menu e a estrela, que já
são CSS Module, ganham `:hover` no próprio módulo.
Onde `.botao-primario` entra: os CTAs de entrar, cadastrar, assinar, o convite compacto do
plano, "Buscar", "Registrei", "Aplicar", "Trocar senha", "Trocar e-mail", "Assinar" e
"Ver estatísticas" do detalhe do apito.
**Aceite.** `globals.css` tem as quatro classes com `:hover` e `:focus-visible`; o teste
"azul nunca é tinta" continua verde; nenhum dos onze CTAs tem `background:` embutido.

### 4.16 · Botão flutuante mal posicionado entre 1024 e 1279

**Erro.** `bottom: 96px` reserva a barra inferior, que não existe ali.
**Correção.** `bottom: 24px` a partir de 1024 no `BotaoChat.module.css`.

### 4.17 · A tabela da lateral perde a semântica de tabela

**Erro.** `role="tabpanel"` na própria `<table>` apaga o papel de tabela para leitor de
tela; as abas não têm `aria-controls`.
**Correção.** Um `<div role="tabpanel">` envolve a tabela; cada aba tem `id` e
`aria-controls`; o painel tem `aria-labelledby` da aba ativa.
**Aceite.** Teste do componente: `<div role="tabpanel"` e `<table` sem `role`.

### 4.18 · Pílulas de período do jogador sublinhadas

**Erro.** Pré-existente (links sem `textDecoration: 'none'`), mas dentro de pílula azul
cheia ficou pior.
**Correção.** `textDecoration: 'none'` nos chips de período e de atributo do jogador.

### Decisão que fica com o parceiro (fora do plano)

**O selo PRÉ-LIVE / AO VIVO parece botão.** Mesma pílula azul cheia das abas de navegação,
mas não é clicável. Foi decisão da seção 1 da Identidade 05. Alternativa se incomodar:
contorno em `divisor` com o ponto colorido e texto em `texto100`. Não entra neste plano.

## 5 · Arquitetura

```
src/app/globals.css                         + .botao-primario, .botao-secundario, .pilula-nav,
                                              .chip-filtro (com :hover/:focus-visible);
                                              + empilhamento das conferências sob .moldura-com-lateral
src/components/navegacao/
  Moldura.tsx                               BarraTopo sempre; classe global moldura-com-lateral
  BarraTopo.tsx, BarraInferior.tsx          atual: Aba | null; pílulas por classe
  Chip.tsx                                  por classe .chip-filtro
  FolhaDeFiltros.tsx / .module.css          pointerdown fora; ChipDeRecorte nos dois lugares;
                                            rótulo "Grupo: valor"; menus da direita em right:0;
                                            :hover no summary
  Esqueleto.tsx                             lateral de esqueleto nas telas de aba
src/components/lateral/
  DocaDoAssistente.tsx                      abre por clique/tecla; devolve o foco
  ClassificacaoCompacta.tsx                 tabpanel em div; ids e aria-controls; âncora
  Lateral.tsx                               mostrarClassificacao; titulo da faixa
src/app/(app)/lateral/montar.tsx            semClassificacao
src/components/planos/ConviteDoPlano.tsx    titulo?; botões por classe
src/components/preferencias/…module.css     :hover na estrela
src/components/chat/BotaoChat.module.css    bottom a partir de 1024
src/design-system/componentes/CardEntrada.tsx  zIndex só na ação do canto
src/app/(app)/
  estatisticas/page.tsx                     Buscar por classe; id="classificacao"
  estatisticas/jogador/[id]/page.tsx        textDecoration nos chips
  gestao/page.tsx                           Registrei/Aplicar por classe; banca ativa no acento
  conta/page.tsx, conta/blocos.tsx          Sair secundário; CTAs por classe
  fire-live/page.tsx                        estrela no card
  entrar/formulario.tsx, cadastrar/formulario.tsx, assinar/page.tsx, apito/[jogadorId]/page.tsx
                                            CTAs por classe
  offline/page.tsx                          textoSobreCor sobre o verde
```

Nenhum token novo. Nenhuma leitura nova. O motor não muda.

## 6 · Verificação

- Bateria de cada tarefa e da passada: `npm run typecheck && npm run lint && npm run
  boundaries && npm test`; captura em 1024, 1280 e 1440 sem rolagem horizontal.
- Testes novos: par de "azul nunca é tinta" para `textoSobreAcento` (4.1); `Moldura` sem
  aba com barra do topo (4.8); `Esqueleto` com lateral (4.9); folha com dois chips de
  recorte e rótulo composto (4.6, 4.7); `tabpanel` em div (4.17); classes com `:hover` no
  CSS (4.15); estrela no Fire Live (4.14); aside de Estatísticas sem classificação (4.11).
- **Passo manual na preview**, escrito no plano: abrir e fechar menu clicando fora (4.4);
  Tab pela lateral sem abrir a doca, Esc devolvendo o foco (4.10); hover nas pílulas, chips
  e CTAs (4.15).

## 7 · Fora de escopo

- Celular e tablet abaixo de 1024.
- O selo como botão (decisão do parceiro).
- "Ver na casa parceira" como primário (decisão do parceiro).
- O piso de 12 px em BarraAlvo, FormaNoAtributo, PlacarMini e Tabela — fatias do Fire Live,
  do detalhe e das Estatísticas.
- Tudo que está na spec irmã de lógica.

## 8 · Ordem

1. Classes de ação e pílula (4.15) — o alfabeto que 4.1 e 4.3 usam.
2. As três regressões (4.1, 4.2, 4.3).
3. Filtros (4.4–4.7).
4. Moldura e esqueleto (4.8, 4.9, 4.16).
5. Lateral (4.10, 4.11, 4.12, 4.13, 4.17).
6. Fire Live e jogador (4.14, 4.18).
7. Bateria, captura, passo manual, commit único.

## 9 · Riscos

- **Mover fundo e cor para classe** toca onze CTAs e duas barras. O teste "azul nunca é
  tinta" e o par dele (4.1) são a rede; o typecheck não pega classe errada, a captura pega.
- **`pointerdown` no `document`** roda em toda tela com filtros. É um listener por página,
  removido no unmount.
- **Empilhar as conferências a 1280–1599** muda o índice de Estatísticas para quem tem
  monitor de 1440, o mais comum. É a correção certa: hoje a tabela do Oeste está cortada.
