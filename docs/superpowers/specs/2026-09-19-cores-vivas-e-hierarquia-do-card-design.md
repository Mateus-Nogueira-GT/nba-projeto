# Identidade 06 — cores vivas e a odd no lugar da confiança

**Data:** 19/09/2026 · **Status:** spec escrita a partir dos três feedbacks do parceiro
(o dono da plataforma), com as quatro ambiguidades resolvidas por ele no mesmo dia.
**Aprovada para execução direta** — ele dispensou a rodada de validação da spec e do
mockup de cor.
**Nasce de:** [`Identidade 05 · Manual da Marca`](2026-09-18-identidade-05-manual-da-marca-design.md),
mesclada na `main` em 19/09 (`950be66`).
**Irmã:** [`Correções de UX no desktop`](2026-09-19-correcoes-ux-desktop-identidade-05-design.md) —
aquela conserta execução sem reabrir identidade; **esta reabre**, e é a primeira desde a 05.
**Muda decisão de:** [ADR-0005](../../adr/0005-fusao-badge-confianca.md) — ver
[ADR-0011](../../adr/0011-moldura-do-nivel-e-saida-da-confianca.md), escrito junto com esta spec.

---

## 1 · Objetivo em uma frase

Fazer o card dizer de longe, em cor viva, **quem é o jogador, de que nível ele é e quanto
paga** — a moldura inteira vestindo o metálico do nível, a odd média ocupando o lugar de
destaque que era da nota de confiança, e a meta ("4+") maior que o rótulo que a nomeia.

## 2 · Problema

O parceiro mandou três blocos de feedback sobre a tela que subiu na Identidade 05. Lidos
juntos, e conferidos contra a captura de 18/09 (`.superpowers/capturas-baseline/lista-secreta.png`),
eles descrevem quatro defeitos reais:

1. **A cor está apagada.** O rótulo do nível — "MVP", "ALL STAR", "SUPORTE", "RANDOLA" —
   sai em cinza de 12 px, igual para os quatro. A única cor metálica do card é um tracinho
   de 56 × 3 px acima da borda, que na captura de 390 px praticamente não existe. O bronze
   do Suporte (`#C8823C`, saturação 56%) é, literalmente, um laranja fraco.
2. **A hierarquia está invertida.** O número grande do canto (34 px, turquesa) é a nota de
   confiança; a odd é texto cinza de 12 px no rodapé, colado na média. O elemento que faz o
   assinante montar múltipla é o menor do card.
3. **A lateral colorida mente.** A borda esquerda de 3 px veste o *grau de confiança* —
   uma rampa turquesa que, no grau alto, lê como verde. Num card de nível 2 ela aparece
   verde, que é a cor do nível 3.
4. **O "morto" é de área, não só de matiz.** Num card de ~300 × 200 px, a cor cromática
   ocupa o anel do avatar (2 px) e as barrinhas. O resto é azul-marinho. Subir só a
   saturação dos hexes não resolve: a cor precisa de superfície.

### As quatro ambiguidades, resolvidas pelo parceiro em 19/09

| Dúvida | Resposta |
| --- | --- |
| O feedback diz "a cor do nível do jogador" mas exemplifica com "Josh Hart, Nível 2 → laranja". Qual cor veste a moldura? | **O nível do JOGADOR** (metálico). Confirmado pelo dado: Josh Hart é **Suporte** na lista do CJ (`data/fontes/introducao-ia-nba.md`, Knicks, nº 5) — o metálico dele é o bronze, e "o laranja está muito fraco" descreve o bronze `#C8823C` com precisão. |
| A confiança continua no card em algum lugar? | **Sai de vez.** Permanece na tela de análise do apito, que já a mostra em pílula, rampa e por linha. |
| Quanta cor a moldura recebe? | **Forte**: borda inteira na cor, lateral esquerda de 6 px, véu da cor no cabeçalho e no rodapé, rótulo do nível grande na cor. |
| Prata e branco quase não se distinguem. | **Prata mais fria e escura**; Randola em branco puro. |

## 3 · Princípios

1. **Hex só no primitivo.** As três camadas de token ficam como estão. Nenhum componente
   ganha um `#` novo — o teste "hex direto" continua valendo.
2. **Nada de estratégia é tocado.** Isto é apresentação. `config/ruleset.v1.yaml` não
   muda uma linha, e nenhum número desta spec entra em código: cor e tamanho são token.
3. **Cada informação continua com um canal próprio** — os canais só trocam de lugar. O
   metálico sai do tracinho e vai para a moldura; o cromático do apito fica no anel, no
   numeral e na aba. Dois canais, e só dois: o teste que vigia isso permanece.
4. **"Mais vivo" é medido, não opinado.** Cada cor nova tem saturação maior e contraste
   igual ou melhor que a atual sobre as cinco superfícies de card do app. Onde não deu
   para subir os dois, a spec diz qual cedeu e por quê.
5. **Área é meia resposta.** Além do matiz, a cor ganha superfície: borda de 6 px, véus no
   cabeçalho e no rodapé, e tipo grande na cor.
6. **Redundância textual não cede.** Toda cor segue acompanhada da palavra: "SUPORTE" está
   escrito, "N2" está escrito, "TURBO" está escrito. Daltônico continua lendo o produto.
7. **O card não inventa número.** Sem odd, o lugar de destaque fica vazio — nunca um "—"
   grande nem um valor de tabela apresentado como se fosse de casa.

## 4 · A paleta

Medida com `src/design-system/tokens/contraste.ts` contra as cinco superfícies onde uma
cor pode pousar: `cartaoNip #101C30`, `cartaoFrio #0E223E`, `campoFrio #162947`,
`campoQuente #2C1A30`, `cartaoQuente #221B30`. A coluna **pior** é o menor dos cinco —
é ela que precisa passar, não a média.

### Metálicos — nível do jogador

| Nível | Antes | Depois | sat | pior contraste | Nota |
| --- | --- | --- | --- | --- | --- |
| MVP | `#E0B24A` | **`#F2AE1C`** | 71 → 89 | 7,37 → **7,52** | Ouro mais puro; afasta-se 11° do amarelo do nível 1. |
| All Star | `#C3CCDA` | **`#A9B6C9`** | 24 → 23 | 8,99 → **7,09** | **Única cor que desce de contraste**, de propósito: é o que abre distância do branco do Randola. Segue muito acima de 4,5. |
| Suporte | `#C8823C` | **`#F08040`** | 56 → 85 | 4,66 → **5,45** | O "laranja mais vivo e brilhante" do feedback 02. É o card do Josh Hart. |
| Randola | `#7C8AA3` | **`#FFFFFF`** | — | 4,17 → **14,56** | Branco no TEXTO, como pedido. A moldura usa `rgba(255,255,255,.55)` — ver §5.3. |

### Cromáticos — nível do apito

| Nível | Antes | Depois | sat | pior contraste |
| --- | --- | --- | --- | --- |
| 1 🟡 | `#FFC93D` | **`#FFDD00`** | 100 → 100 (matiz 43° → 52°, amarelo puro) | 9,48 → **10,81** |
| 2 🟠 | `#FF9838` | **`#FFA31F`** | 100 → 100 (matiz 29° → 35°) | 6,80 → **7,29** |
| 3 🟢 | `#3DD37E` | **`#2BE884`** | 63 → 80 | 7,50 → **9,00** |
| turbo 🔵 | `#4DA3FF` | *inalterado* | — | 5,55 |

O azul do turbo não muda: o parceiro não o citou, e ele é o azul do Manual da Marca.
O laranja do **modo fire** é alias do nível 2 e acompanha.

### Colisão entre os dois canais

O teste "os dois canais não compartilham nenhuma cor" continua passando por hex. A
proximidade **perceptual** é tratada por posição e por forma:

| Par | Δ matiz | Como se separam |
| --- | --- | --- |
| ouro `#F2AE1C` × amarelo N1 `#FFDD00` | 11° | O amarelo contrasta 44% mais com o card (10,81 × 7,52), e o ouro só aparece na moldura; o amarelo, só no anel. |
| bronze `#F08040` × laranja N2 `#FFA31F` | 13° | Mesma separação por posição. No card do Josh Hart os dois convivem — e é exatamente o que o feedback pede. |
| prata `#A9B6C9` × branco `#FFFFFF` | — | Resolvido escurecendo a prata (decisão do parceiro). |
| verde N3 `#2BE884` × verde da barrinha `#2FBF71` | 1° | Já era par próprio por hex; separam-se por forma — pílula cheia com número dentro × anel e aba vazados. |

### Véus novos

Um por metálico, a 12%, para o cabeçalho e o rodapé do card:
`ouroVeu12`, `prataVeu12`, `bronzeVeu12`, `brancoVeu12`. Os véus a 12% dos cromáticos
(`ambarVeu12`, `laranjaVeu12`, `verdeVeu12`) são recalculados a partir das cores novas.
`brancoVeu55` já existe e passa a ter um segundo uso: a borda da moldura do Randola.

O primitivo `grafite` fica órfão quando o Randola vira branco e **sai**.

## 5 · Os canais, depois da troca

### 5.1 · Nível do JOGADOR → a moldura inteira

Sai o tracinho de 56 × 3 px. Entram, todos na cor metálica do nível:

- borda de 1 px em toda a volta do card (hoje `divisor`/`bordaQuente`);
- borda esquerda de **6 px** (hoje 3 px, na cor do grau de confiança);
- véu a 12% no fundo do cabeçalho e no fundo do rodapé (hoje `veuFrio`/`veuQuente`);
- o rótulo do nível em Bebas 20 px, na cor (hoje Montserrat 12 px, cinza).

O gradiente do card **não** muda: pré-live continua frio, Fire Live continua quente. A
temperatura da identidade 03 sobrevive por baixo da moldura.

### 5.2 · Nível do APITO → anel, numeral e aba

- anel do avatar: espessura de 2 px → **3 px**;
- o numeral `N2`, hoje cinza na linha de apoio, passa a sair **na cor do apito**, em
  Montserrat 12 px 700 — e no card turbo ele veste o azul do turbo, como o anel já faz.
  O texto continua `N{nível}`: trocar por `T` seria mudança de conteúdo, e o selo
  "⚡ TURBO" já está escrito ao lado;
- a aba de atributo ativa segue como está, com o véu recalculado.

### 5.3 · O caso do Randola

Branco puro é a cor de maior luminância do sistema. Uma moldura branca faria o card do
jogador **menos** importante gritar mais que o do MVP. Então a regra se divide, e é a
divisão que o próprio feedback 03 autoriza ("a alteração deve ser aplicada principalmente
no nome do nível exibido em fonte maior"):

- **texto** do nível: `#FFFFFF`, como pedido;
- **moldura** (borda, lateral, véu): `rgba(255,255,255,.55)`, para a ordem de peso visual
  continuar MVP > All Star > Suporte > Randola.

## 6 · O card, zona por zona

### 6.1 · Zona 1 — cabeçalho

```
┌ 6px bronze ─────────────────────────────────────────┐
│ ░░ véu bronze 12% ░░░░░░░░░░░░░░░░░░░  [★] [ PRÉ ]  │
│ (JH)  JOSH HART                        ODD MÉDIA    │
│  N2   SUPORTE · N2 · G                    1,58      │
│       [NYK] vs [UTA]                                │
└─────────────────────────────────────────────────────┘
```

| Elemento | Antes | Depois |
| --- | --- | --- |
| Rótulo do nível | `SUPORTE · N2 · G`, Montserrat 12 px, cinza, tudo junto | `SUPORTE` em Bebas **20 px** na cor metálica; `N2` em Montserrat 12 px 700 na cor do apito; `G` em `texto55` |
| Canto direito | nota de confiança, Bebas 34 px, turquesa | **odd**: rótulo `ODD MÉDIA` em 10 px `texto55` + valor em Bebas **38 px** branco, `tabular-nums` |
| Anel do avatar | 2 px | 3 px |

**A odd em três estados**, e nenhum deles inventa número:

1. o item traz `oddFaixa.media` (é o que o ruleset manda hoje, `odds.exibicao: media`) →
   rótulo `ODD MÉDIA`, valor em Bebas 38;
2. o item traz faixa sem média (o ruleset virado para `faixa`) → rótulo `ODD`, valor
   `1,47–1,62` em Bebas **26 px**, que é o tamanho em que a faixa cabe a 320 px;
3. o item não tem odd nenhuma — inclusive **todo card do Fire Live**, que grava
   `oddFaixa: null` por decisão de produto → o canto fica só com o badge de status e a
   estrela. Nada ocupa o lugar.

### 6.2 · Zona 3 — rodapé

| Elemento | Antes | Depois |
| --- | --- | --- |
| Meta | `REBOTES 4+`, 13 px, peso 600, tudo do mesmo tamanho | `REBOTES` em 11 px `texto55` + `4+` em Bebas **24 px** branco |
| Aba de atributo | `REB 4+`, 12 px | `REB` em 11 px + `4+` em 15 px 700 |
| Direita | `MÉDIA 4,9 · ODD MÉDIA 1,58` | `MÉDIA 4,9` — a odd subiu para o cabeçalho |
| Fundo | `veuFrio` azul 7% / `veuQuente` vermelho 8% | véu do metálico do nível, 12% |

O rodapé do card quente (`ALVO 1º Q · 11 PTS` / `FALTA 4 PTS`) e o veredito do conferido
(`fez 27` com ✓/✗) não mudam de conteúdo — só de fundo.

## 7 · O que sai: a confiança

A nota de confiança **deixa o card por inteiro**: o número, a borda lateral na cor do
grau, e o brilho do grau 5. As props `confianca` e `grauConfianca` saem de `CardEntrada`
e dos quatro chamadores.

O que **permanece**:

- a rampa turquesa e os tokens `confiancaGrau1..5` — a tela de análise do apito usa os
  dois, em pílula e por linha;
- a confiança no motor, no feed, no push e na ordenação da Lista. **Nada de dado muda:**
  o item continua carregando a nota, a Lista continua ordenando por ela. O que muda é que
  o card não a desenha.

Dos três brilhos da identidade 03, sobram dois — turbo e modo fire, cada um com seu dono.

> **Consequência comercial, a comunicar ao CJ.** A p.4 da proposta aprovada vende a nota
> de confiança no card, e o [ADR-0005](../../adr/0005-fusao-badge-confianca.md) a fundiu
> com o anel justamente para preservá-la ali. Tirá-la do card é decisão do dono da
> plataforma, tomada em 19/09, e precisa chegar ao CJ antes da próxima apresentação —
> não é defeito nem esquecimento.

### 7.1 · Efeito colateral na spec irmã

O item **4.2** da [spec de correções de UX](2026-09-19-correcoes-ux-desktop-identidade-05-design.md)
conserta o clique no número de confiança, que a Identidade 05 quebrou. Sem o número, o
defeito deixa de existir — mas a **causa** não: a coluna inteira do canto ainda carrega
`zIndex: 1` e ainda cobre a cobertura do card, agora por cima da odd. A correção continua
valendo, com outro alvo: o `zIndex` vai para um invólucro só da `acaoCanto`, e a odd passa
a ficar sob a cobertura, abrindo a análise ao clique. Esta spec executa isso; a irmã, se
for executada depois, encontra o item já fechado.

## 8 · Arquitetura

```
config/ruleset.v1.yaml                    INTOCADO — isto é apresentação
src/modules/**                            INTOCADO — nenhum dado muda

src/design-system/tokens/primitivo.ts     7 hexes novos; sai `grafite`; 4 véus metálicos;
                                          3 véus cromáticos recalculados
src/design-system/tokens/semantico.ts     nivelRandola → branco; `nivel*Veu` e
                                          `nivelRandolaBorda`
src/design-system/tokens/componente.ts    `molduraNivel` (borda + véu por nível, no molde
                                          de `abaAtributo.ativaPorNivel`);
                                          cardBordaLateral 3px → 6px;
                                          `odd` (tamanhos), `meta` (tamanhos),
                                          avatarAnelEspessura 2px → 3px
src/design-system/tokens/css.ts           NIVEL_JOGADOR ganha `veu` e `borda`
src/design-system/tokens/tokens.css       regenerado por `npm run tokens`

src/design-system/componentes/CardEntrada.tsx
                                          moldura metálica; zona 1 com odd e nível grande;
                                          zona 3 com meta grande; saem confiança,
                                          grauConfianca e a faixa de 56×3; zIndex só na
                                          ação do canto
src/app/(app)/page.tsx                    para de passar confianca/grauConfianca
src/app/(app)/resultados/[data]/page.tsx  idem
src/app/(app)/como-funciona/page.tsx      idem
src/app/(admin)/admin/galeria/page.tsx    idem

docs/04-design-system.md                  canais, anatomia do card e paleta
docs/adr/0011-moldura-do-nivel-e-saida-da-confianca.md   novo
```

## 9 · Verificação

**Testes-âncora desta passada** (escritos antes da implementação):

`tokens.test.ts`
1. os sete hexes novos estão no primitivo, literalmente;
2. `grafite` não existe mais e nenhum semântico o referencia;
3. cada cor nova tem saturação ≥ a antiga e contraste "pior superfície" ≥ o antigo, nas
   cinco cores que sobem — ouro, bronze, amarelo, laranja e verde. **Prata e Randola são
   as duas exceções declaradas em §4**, e o teste as nomeia: a prata desce nos dois para
   abrir distância do branco, e o branco não tem saturação para comparar;
4. os dois canais continuam sem compartilhar hex;
5. o rótulo do nível, na cor metálica, passa em AA para texto (4,5) sobre as cinco
   superfícies — o bronze `#F08040` dá 5,45 no pior caso;
6. cada véu metálico é o decimal exato do seu metálico;
7. `tokens.css` em sincronia com o TypeScript.

`card.test.ts`
8. a moldura veste o metálico do nível: borda, lateral de 6 px e véu, nos quatro níveis;
9. o Randola usa branco no texto e o véu de 55% na moldura;
10. o rótulo do nível sai em Bebas 20 px na cor metálica, e o numeral do apito na cor do
    apito;
11. **o card não escreve a nota de confiança em estado nenhum** — o par do teste
    "nunca escreve probabilidade", varrendo todas as lentes e estados;
12. a odd média ocupa o canto, em Bebas 38, com o rótulo `ODD MÉDIA`;
13. faixa sem média vira `ODD 1,47–1,62` em 26 px;
14. sem odd, o canto não desenha nada — nem `—`, nem zero;
15. a meta sai com o número maior que o rótulo (`4+` > `REBOTES`);
16. a aba de atributo mantém a proporção `REB` < `4+`;
17. a coluna do canto não tem `z-index`; o invólucro da ação tem (§7.1);
18. os três brilhos viraram dois: turbo e modo fire; nenhum card brilha por confiança.

**Suíte inteira:** `npm test`, `npm run typecheck`, `npm run lint`, `npm run boundaries`.

**Olho:** `scripts/captura-telas.sh` nas quatro larguras do manual (320, 390, 768, 1440),
comparando com `.superpowers/capturas-baseline/`. As telas que precisam ser olhadas são
Lista Secreta, Fire Live, Resultados, detalhe do apito e a galeria do admin — que é onde
os quatro níveis aparecem lado a lado. A captura reprova sozinha se alguma tela vazar
para os lados.

## 10 · Fora de escopo

- **A tela de análise do apito.** Ela recebe as cores novas por token, mas o layout dela
  não é tocado — e é lá que a confiança continua morando.
- **As barrinhas.** O par verde/vermelho próprio fica como está; o parceiro não o citou.
- **O azul do turbo e o vermelho do ao vivo.** São do Manual da Marca.
- **A aba de estatísticas e a nota da partida.** Paleta própria, assunto próprio.
- **Celular abaixo de 320 px.** Como sempre.

## 11 · Ordem

1. Testes-âncora 1–7 (token) — vermelhos.
2. Paleta e véus no primitivo; `grafite` sai.
3. Semântico e componente: `molduraNivel`, larguras, tamanhos. `npm run tokens`.
4. Testes-âncora 8–18 (card) — vermelhos.
5. `CardEntrada`: moldura, zona 1, zona 3, saída da confiança, `zIndex`. O anel de 3 px
   do avatar vem de graça: `Avatar` já lê `avatarAnelEspessura`.
6. Os quatro chamadores param de passar `confianca`/`grauConfianca`.
7. Suíte inteira verde.
8. Capturas nas quatro larguras, comparadas com a baseline.
9. `docs/04-design-system.md` e o ADR-0011.
10. Um commit, no fim.

## 12 · Riscos

| Risco | Mitigação |
| --- | --- |
| **O parceiro queria o laranja do APITO na moldura, não o bronze.** A leitura foi confirmada por ele e pelo dado (Josh Hart é Suporte), mas as duas leituras produzem laranja no card dele — e só um card de outro nível revelaria o engano. | A galeria do admin mostra os quatro níveis lado a lado. É a primeira captura a mandar para ele; se a leitura estiver errada, o conserto é trocar qual mapa alimenta `molduraNivel` — uma linha em `css.ts`. |
| **Bronze e laranja do nível 2 convivem no mesmo card.** | É o pedido explícito do feedback. Separados por 13° de matiz e por posição (moldura × anel). |
| **A moldura branca do Randola some sobre o card quente.** `rgba(255,255,255,.55)` sobre `#2C1A30` dá contraste de gráfico bem acima de 3. | Coberto pelo teste 5 e pela captura do Fire Live. |
| **Tirar a confiança do card contraria a proposta comercial.** | Decisão registrada no ADR-0011 e sinalizada ao parceiro no fim desta passada, para chegar ao CJ. |
| **A odd da tabela estática pode ser confundida com odd de casa.** O `fallback: tabela_estatica` do ruleset vive no motor e não alimenta `oddFaixa`. | Nada muda aqui: sem linha de casa, `oddFaixa` é `null` e o canto fica vazio (teste 14). |
