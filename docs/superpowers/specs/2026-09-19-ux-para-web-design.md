# UX para web — o que a auditoria de desktop encontrou

**Data:** 19/09/2026 · **Status:** spec escrita a partir da auditoria de 19/09 (HTML real das
15 telas renderizado em 1024, 1280, 1440 e 1600; markup e CSS medidos, não estimados).
**Aprovada para execução direta** pelo parceiro, com as sete correções abaixo.
**Nasce de:** a constatação do parceiro de que **a maior parte dos acessos será via web**.
Até aqui o produto foi desenhado celular-primeiro; a Identidade 05 acrescentou a moldura de
desktop e a passada de 19/09 corrigiu dezoito defeitos dela. Esta olha o desktop como o
lugar PRINCIPAL, não como o adaptado.

---

## 1 · Objetivo em uma frase

Fazer o app responder ao mouse e ao teclado, e devolver às telas de dado a largura do
monitor — mais quatro defeitos pontuais que a captura de desktop revelou.

## 2 · Problema

A auditoria mediu, nas 15 telas, **520 de 794 elementos interativos sem classe** — ou seja,
sem `:hover` e sem o anel de foco do app. Estilo embutido não tem estado, e é assim que
praticamente toda a UI foi escrita. A passada de 19/09 deu estado às pílulas de navegação,
aos chips e aos CTAs; ficou de fora justamente o que se clica mais.

| Tela | Sem estado | Total |
| --- | ---: | ---: |
| Estatísticas | 96 | 104 |
| Lista Secreta | 88 | 202 |
| Classificação | 40 | 42 |
| Estatísticas (índice) | 40 | 42 |
| Gestão | 40 | 86 |
| Tela do time | 25 | 26 |
| **Total das 15** | **520** | **794** |

No celular isso não existe — não há ponteiro. No desktop é a diferença entre uma tela viva
e uma imagem.

E há um segundo problema de mesma origem: a **análise do apito**, a tela mais valiosa do
produto, roda na coluna de LEITURA de 640 px. Num monitor de 1440 o conteúdo ocupa 37% da
largura, e o que está espremido ali é tabela: dez jogos em barras, três linhas com odd, três
casas × três linhas.

## 3 · Princípios

1. **A classe é dona do ESTADO; o embutido continua dono da cor que significa.** Diferente
   da fase 1 de 19/09: lá a classe assumiu a cor dos controles neutros. Aqui, o card e a aba
   de atributo carregam cor que é DADO (o metálico do nível, o cromático do apito) — a
   classe nova acrescenta só `:hover` e `:focus-visible`, e não toca em `background`,
   `color` nem `border` de base.
2. **Coluna larga é para DADO; coluna estreita é para PROSA e FORMULÁRIO.** A análise do
   apito e a tela de planos são dado e comparação, e ganham a largura. `como-funciona`,
   `entrar`, `cadastrar` e o retorno do Mercado Pago continuam em 640: linha de leitura
   longa demais cansa, e formulário largo é pior que formulário estreito.
3. **Nenhuma decisão de identidade reabre.** A paleta da Identidade 06, os dois canais, a
   moldura de três regiões e o piso de 12 px ficam.
4. **Redundância textual vale em TODA tela, não só no design system.** Onde a cor carrega o
   nível, a palavra acompanha.
5. **O motor não muda; o ruleset não muda.** Nada em `src/modules/motor/**` nem em `config/`.
6. **Hover atrás de `(hover: hover)`**, como as quatro classes já existentes: tela de toque
   não pode ficar com o estado preso depois do toque.

## 4 · As correções

### 4.1 · O app não responde ao mouse (520 de 794)

**Erro.** Estilo embutido não tem `:hover` nem `:focus-visible`, e é assim que quase toda a
UI foi escrita. Entre os descobertos: **o card inteiro da Lista** — o maior alvo de clique do
produto —, o nome do jogador, as abas de atributo, o seletor POR JOGO/POR NÍVEL, a fileira de
lentes, os 30 links de time da Classificação, os 37 links de análise da Gestão.
**Como aparece.** A 1440, passar o mouse por um card não muda nada. O único card que reage é
o do **modo fire**, porque `.card-modo-fire` existe desde a identidade 03 — um tipo de card
responde e os outros não.
**Correção.** Quatro classes novas em `globals.css`, no molde das quatro de 19/09 e com a
mesma disciplina (só tokens, hover atrás de `(hover: hover)`, foco em `var(--foco)`):

| Classe | Onde | O que faz |
| --- | --- | --- |
| `.card-alvo` | o `<div>` que embrulha o card quando há `detalheHref` | hover e `:focus-within` acendem a borda do `<article>` e o sobem 1 px — mesmo gancho de `.card-modo-fire:hover > article` |
| `.link-texto` | nome do jogador, links de time, dia anterior/seguinte, links de análise da Gestão, "Ver completa", "Ver a noite" | hover leva a tinta a `--texto100` e sublinha; foco no anel do app |
| `.aba-atributo` | as abas PTS · REB · AST do rodapé do card | hover eleva o fundo SEM tocar na cor do nível do apito, que é dado |
| `.opcao-segmentada` | POR JOGO/POR NÍVEL, a fileira de lentes, as abas de conferência | hover eleva o fundo da opção inativa |

**Aceite.** Um teste de fonte varre o HTML renderizado das telas e cobra teto de elementos
interativos sem classe: **no máximo 12% por tela** (hoje é 65% no total; os que sobram são
`<summary>` de `<details>` nativos e âncoras de âncora). `globals.css` tem as quatro classes
com `:hover` atrás de `(hover: hover)` e `:focus-visible` com `var(--foco)`. O teste "azul
nunca é tinta" e o par dele continuam verdes.

### 4.2 · A tela mais valiosa ocupa 37% do monitor

**Erro.** `/apito/[jogadorId]` usa a largura padrão da `Moldura`, que é `leitura` (640).
**Como aparece.** A 1440 o conteúdo vive entre x≈333 e x≈867, e a tabela de três casas ×
três linhas, o gráfico de dez jogos e as três linhas com odd dividem 534 px.
**Correção.** `largura="dados"` na análise do apito e em `/assinar`. Na análise, os blocos já
são de largura total e passam a respirar; em `/assinar`, os planos saem de empilhados para
uma grade que volta a empilhar abaixo de 900 px.
**FICAM em 640**, por decisão: `como-funciona` (prosa), `entrar`, `cadastrar` e
`retorno/mercadopago` (formulário).
**Aceite.** `telas-04-detalhe` e `planos-assinar` afirmam `--largura-coluna:1120px`;
`telas-05-*` da teoria e do cadastro seguem afirmando 640. Captura a 1440 sem rolagem.

### 4.3 · "ÚLTIMOS 10" com 8 jogos na tela

**Erro.** [`apito/[jogadorId]/page.tsx`](../../../src/app/(app)/apito/[jogadorId]/page.tsx)
escreve o título fixo `FORMA NO ATRIBUTO · ÚLTIMOS 10`; o gráfico ao lado mostra 8 barras e
a legenda diz "bateu 3 de 8".
**Como aparece.** Todo jogador com menos de dez jogos conferidos lê um título que mente.
**Correção.** O título passa a dizer o número que o dado tem: `ÚLTIMOS ${n}`, com `n` sendo
o tamanho da série que a tela já recebe. Um jogo só escreve "ÚLTIMO 1".
**Aceite.** Teste com série de 8 espera `ÚLTIMOS 8` e não `ÚLTIMOS 10`.

### 4.4 · Gestão: 37 botões primários azuis

**Erro.** "Primário é UMA ação por tela" foi aplicado ao Perfil em 19/09 e não à Gestão, que
empilha 37 "Registrei" azuis idênticos.
**Como aparece.** Uma parede de azul a 1440; nenhum deles é "a" ação da tela.
**Correção.** "Registrei" vira `.botao-secundario`. O primário da Gestão passa a ser
"Aplicar" (a banca), que é o que se faz uma vez.
**Aceite.** `telas-05-gestao`: nenhum `Registrei` com `botao-primario`; "Aplicar" com ele.

### 4.5 · Gestão: 37 linhas sem agrupamento

**Erro.** A Lista agrupa por jogo e tem seis filtros; a Gestão é uma coluna de 37 linhas
iguais, e achar um jogador ali é rolar.
**Correção.** As entradas sugeridas passam a ser agrupadas POR JOGO, com o mesmo
`CabecalhoJogo` da Lista — nenhum componente novo, nenhum filtro novo, o mesmo modelo mental.
A ordem dentro do grupo continua a de hoje (maior aporte primeiro).
**Aceite.** `telas-05-gestao`: há mais de um `CabecalhoJogo` e a soma das linhas dos grupos é
igual ao total de entradas sugeridas.

### 4.6 · Gestão: o nível do jogador é só cor

**Erro.** A faixa lateral da linha usa o metálico do nível do jogador
([`gestao/page.tsx`](../../../src/app/(app)/gestao/page.tsx)) — consistente com a Lista —,
mas ali a cor está SOZINHA: a linha escreve "DAL · REB 8+ · nível 2", e "nível 2" é o do
APITO. O nível do jogador não está escrito em lugar nenhum.
**Como aparece.** Quem não distingue as cores não lê esse dado. A regra de redundância do
projeto é cobrada por teste no design system e não nas telas.
**Correção.** A linha de apoio passa a escrever o rótulo do nível antes do time:
"Suporte · DAL · REB 8+ · nível 2".
**Aceite.** `telas-05-gestao`: o texto da linha contém o rótulo do nível do jogador. E um
teste transversal novo: onde `NIVEL_JOGADOR[...].cor` é usado numa tela de `src/app`, o
rótulo daquele nível aparece no texto.

### 4.7 · O Randola é o rótulo mais brilhante da tela

**Erro.** O branco puro do Randola dá 14,56 de contraste no pior caso; a prata do All Star dá
7,09 e o bronze do Suporte, 5,45. O nível MENOS importante renderiza com o dobro do peso do
segundo mais importante.
**Como aparece.** Na Lista a 1440, os rótulos que mais saltam são os dos randolas.
**Correção.** O TEXTO do Randola passa a `texto70` (o branco a 70%, token que já existe):
**7,86** — continua branco, continua o mais claro dos quatro, e sai de outlier para a mesma
faixa do ouro (7,52) e da prata (7,09). A cor pedida pelo parceiro no feedback 03 ("Rhandola:
branco") é respeitada; muda a intensidade, não o matiz.
**Aceite.** `tokens.test`: o contraste do rótulo do Randola fica entre o do ouro e o dobro
dele; segue acima de AA para texto.

### 4.8 · O grátis rola 2.000 px de silhueta sem um CTA

**Erro.** Na Lista do grátis, depois da faixa azul do topo vêm oito pares de silhueta
idênticos. A faixa de plano da lateral é `sticky`, mas a coluna inteira é mais alta que a
viewport e sai da tela junto.
**Como aparece.** Um visitante de desktop passa a maior parte da página sem nenhuma chamada
para assinar.
**Correção.** A Lista do grátis repete a faixa do `ConviteDoPlano` UMA vez, depois do
terceiro jogo. Uma repetição, não uma a cada jogo: o convite a cada bloco vira anúncio.
**Aceite.** `telas-05-gratis`: a faixa aparece duas vezes na Lista do grátis, e a segunda
vem depois do terceiro `CabecalhoJogo`.

## 5 · Arquitetura

```
src/app/globals.css                          + .card-alvo, .link-texto, .aba-atributo,
                                               .opcao-segmentada (estado, não cor de base)
src/design-system/componentes/CardEntrada.tsx  card-alvo no invólucro; link-texto no nome;
                                               aba-atributo nas abas
src/design-system/componentes/CabecalhoTela.tsx  opcao-segmentada no seletor e nas lentes
src/components/lateral/ClassificacaoCompacta.tsx  opcao-segmentada nas abas de conferência
src/app/(app)/apito/[jogadorId]/page.tsx     largura="dados"; título ÚLTIMOS {n}
src/app/(app)/assinar/page.tsx               largura="dados"; grade de planos
src/app/(app)/gestao/page.tsx                Registrei secundário; agrupar por jogo;
                                               rótulo do nível na linha; link-texto
src/app/(app)/estatisticas/**                link-texto nos links de time e de dia
src/app/(app)/page.tsx                       link-texto; faixa repetida no grátis
src/design-system/tokens/semantico.ts        nivelRandolaTexto (o branco a 70%)
src/design-system/tokens/css.ts              NIVEL_JOGADOR.RANDOLA.cor → o de texto

docs/04-design-system.md                     seção "Estado no desktop" e a nota do Randola
```

O motor não muda. O ruleset não muda. Nenhuma tabela, rota ou campo novo.

## 6 · Verificação

- `npm run typecheck && npm run lint && npm run boundaries && npm test`.
- Testes novos: o teto de elementos sem classe por tela (4.1); largura da análise e dos
  planos (4.2); `ÚLTIMOS 8` (4.3); Registrei secundário e agrupamento (4.4, 4.5); rótulo do
  nível na Gestão e o teste transversal (4.6); contraste do Randola (4.7); a segunda faixa do
  grátis (4.8).
- Captura em 1024, 1280, 1440 e 1600, sem rolagem horizontal, e em 320/390/768 para provar
  que o celular não mudou.
- **O que o arnês não prova:** o hover e o foco só existem de verdade num browser com
  hidratação. O teste cobra que a CLASSE está no elemento e que a REGRA está no CSS; ver o
  estado acender fica para a preview, com roteiro escrito no plano.

## 7 · Fora de escopo

- Busca ou filtro na Gestão (4.5 resolve por agrupamento; filtro é recurso, não defeito).
- Redesenhar a análise do apito para a largura nova — ela só recebe a coluna larga; compor
  duas colunas ali é outra passada.
- O celular. Nada abaixo de 1024 muda de comportamento, e a captura prova.
- O selo PRÉ-LIVE que parece botão (decisão do parceiro, pendente desde 19/09).

## 8 · Ordem

1. As quatro classes (4.1) — o alfabeto do resto.
2. Aplicar as classes nos componentes e telas (4.1).
3. Largura (4.2) e título do gráfico (4.3).
4. Gestão: botão, agrupamento, rótulo do nível (4.4, 4.5, 4.6).
5. Randola (4.7) e faixa do grátis (4.8).
6. Bateria, captura, doc, commit único.

## 9 · Riscos

| Risco | Mitigação |
| --- | --- |
| **`.card-alvo` com `transform` pode brigar com o brilho do turbo e do modo fire**, que já usam `box-shadow` e `::before`. | O hover só muda `border-color` e `translateY(-1px)`; o `.card-modo-fire` continua dono da animação dele. Captura do Fire Live confirma. |
| **Agrupar a Gestão por jogo** muda a estrutura da tela mais sensível (é a de dinheiro). | O componente é o mesmo da Lista, o cálculo do plano não é tocado, e o aceite cobra que a soma das linhas não muda. |
| **A largura nova em `/assinar`** muda uma tela de conversão sem desenho prévio. | A grade volta a empilhar abaixo de 900; o conteúdo dos cartões não muda. É o item para o parceiro olhar primeiro na captura. |
| **O teto de 12% no teste** pode virar um número que alguém baixa para passar. | O teste imprime a lista dos descobertos quando falha, e o comentário diz que `<summary>` nativo é a exceção aceita. |
