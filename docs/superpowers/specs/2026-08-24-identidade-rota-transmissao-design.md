# Identidade visual "02 Rota Transmissão" + fotos + conteúdo do mockup — Design

**Data:** 2026-08-24 · **Estado:** aprovado em brainstorm (6 seções, uma a uma)
**Referência visual:** dois mockups da rota "02 Rota Transmissão" (lista do dia; ao vivo + detalhe da entrada)
**Decisões do parceiro:** alcance "pele + conteúdo completo" · pílula = **faixa de confiança** · nível do apito no anel do avatar + nível do jogador na faixa metálica · fotos via **CDN público da NBA** · 5 abas com nomes do mockup · abordagem A (estender tokens, reescrever componentes no lugar) · fidelidade ao mockup onde não colidir com regra do CJ

## Princípio que governa a spec inteira

> **Onde o mockup e a regra do CJ divergem, o CJ vence.**
> O mockup define a FORMA (tipografia, moldura, brilho, hierarquia); a regra define o
> CONTEÚDO (qual média, qual linha, qual atributo, qual texto).

Consequências já decididas (não reabrir na implementação):

| Item | Mockup dizia | Regra do CJ | Decisão |
| --- | --- | --- | --- |
| Média no detalhe | `MÉDIA 5J` | `media.janela: temporada` | média da temporada, rótulo `MÉDIA` |
| Por que entrou | "média dos últimos 5 acima da linha" | oscilação/OPD do ruleset | texto nomeia a regra que disparou |
| Linha | `PONTOS +18,5` | linhas inteiras 20/25/30/35 | `PONTOS 20+` — sem meio ponto |
| Atributo | `3 PONTOS +2,5` | só PONTOS/REBOTES/ASSISTENCIAS | três pontos NÃO entra (regra 3) |
| Rótulo da faixa | `ALTÍSSIMO VALOR` | P12: % é confiança, não valor esperado | `CONFIANÇA MÁXIMA` |
| Placar ao vivo | `3ª Q · 7:12` | Fire Live é SÓ 1º quarto | placar somente de jogos no 1Q, sem cronômetro |

## Problema

O app está funcional e no ar, mas com visual utilitário (system-ui, estilos inline
mínimos, emojis na navegação) que não corresponde à identidade que o cliente aprovou.
Faltam as fotos dos jogadores (`jogadores.foto_url` existe e nunca foi preenchida) e
o conteúdo informacional do mockup: métricas de contexto no detalhe da entrada,
histórico visual na linha, "por que entrou", barra de progresso e placar no Fire Live.

---

## 1 · Tokens e tipografia

### Fontes

Via `next/font/google` (self-hosted em build — **zero request externo em runtime**):

| Token | Fonte | Papel |
| --- | --- | --- |
| `fonteTitulo` | Anton | títulos de tela, nomes de jogador, números grandes |
| `fonteRotulo` | Barlow Condensed | sobrancelhas, rótulos caixa alta, linha de apoio |
| `fonteCorpo` | Barlow | corpo de texto, aba teórica |

As três entram no `layout.tsx` como variáveis CSS e nos tokens (primitivo → semântico).
O gerador `npm run tokens` e o teste de paridade TS↔CSS continuam valendo.

### A rampa de confiança (decisão central de cor)

A pílula de contorno + brilho codifica a **faixa de confiança**. Para não colidir com
as 4 cores categóricas do CJ (🟡🟠🟢🔵 = apito 1/2/3/turbo) nem repetir o defeito da
escala de 5 faixas removida pelo ADR-0005 (confiança real vai só de 80 a 95 — vermelho
/laranja/amarelo nunca ocorreriam), a pílula usa **uma rampa de intensidade de um só
matiz (turquesa)**, recalibrada para a amplitude real:

```yaml
# config/ruleset.v1.yaml — bloco novo
confianca_exibicao:
  origem: demonstracao          # calibração real é pergunta ao CJ
  faixas:                       # limiar inferior -> grau (1..5)
    - { de: 80, grau: 1, rotulo: CONFIANÇA BOA }
    - { de: 83, grau: 2, rotulo: CONFIANÇA SÓLIDA }
    - { de: 86, grau: 3, rotulo: CONFIANÇA FORTE }
    - { de: 89, grau: 4, rotulo: CONFIANÇA MUITO FORTE }
    - { de: 93, grau: 5, rotulo: CONFIANÇA MÁXIMA }
```

Função pura `faixaDaConfianca(valor, ruleset)` (camada entrega ou motor? → **motor**,
`src/modules/motor/confianca.ts` ao lado de `calcularConfianca`: é derivação de regra
configurada, sem I/O). Valores abaixo da primeira faixa caem no grau 1; `null` = sem
faixa (pílula neutra, sem brilho).

### Tokens novos

- **Primitivo:** `anton`, `barlowCondensed`, `barlow` (nomes de família com fallback);
  `turquesa100..900` (5 degraus usados + apoios); `tinta950` (fundo mais profundo do
  mockup); `laranjaAcento` (o laranja de UI do mockup — chips, aba ativa, botão
  gradiente; distinto de `laranja400` do apito nível 2 por ser papel diferente:
  acento de interface vs canal de estratégia).
- **Semântico:** `fonteTitulo/Rotulo/Corpo`, `confiancaGrau1..5`, `acento`,
  `acentoGradiente`, `aoVivo` (vermelho do selo VIVO).
- **Componente:** `pilulaBordaLargura`, `pilulaBrilho(grau)`, `avatarAnelEspessura`
  (2px), `faixaNivelAltura` (3px), `abaIconeTamanho`.

Hex continua confinado ao primitivo; `npm run boundaries` + teste de tokens verificam.

---

## 2 · Anatomia do card

### Card da lista (CardEntrada reescrito)

```
▬▬▬▬▬                                       ← faixa metálica CURTA (3px, alinhada à
╭─────────────────────────────────────────╮    esquerda) = nível do jogador
│  ╭──────╮  D. MALLOY         ╭───────╮  │
│  │ foto │  PONTOS 20+        │  92%  │  │ ← pílula contorno turquesa
│  ╰──────╯  MVP · N3 · OSC.   ╰───────╯  │
╰─────────────────────────────────────────╯
```

- **Nome** em Anton caixa alta; **linha de apoio** em Barlow Condensed.
- **Avatar** com anel fino de 2px na cor do nível do apito + numeral `N3` sobreposto
  no canto (redundância textual do canal).
- **Faixa metálica** no topo: ouro/prata/bronze/grafite = MVP/All Star/Suporte/Randola;
  rótulo escrito na linha de apoio (cor nunca é canal único).
- **Brilho:** regra DO MOCKUP — brilha somente o card cuja confiança está na faixa
  mais alta (grau 5), na cor da pílula. Turbo e modo fire têm SELO escrito
  (`⚡ TURBO`, `🔥 MODO FIRE`), não brilho próprio.
- **Odd SAI do card** (mockup não a mostra) — vive só no detalhe da entrada.

### Card do Fire Live

Igual ao da lista, mais: selo `VIVO` (pílula de contorno vermelha, Barlow Condensed) e
**barra de progresso** rumo ao alvo do 1Q abaixo do conteúdo:

```
▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  LINHA BATIDA · 26 PTS      ← cheia, cor da pílula
▓▓▓▓▓▓▓▓░░░░░░░░░░░░░  FALTA 3 PTS                ← parcial, mesma cor
```

Progresso = `observado / alvo1Q` (dados que já viajam no feed). Sem minutos de jogo
(`31'` do mockup) — cronômetro da partida não existe no modelo; pergunta ao CJ.

### Colisão de canais — regra verificável

Nenhum dos 5 degraus turquesa pode ser igual a nenhuma das 4 cores do apito nem às 4
metálicas. Vira teste (seção 6).

---

## 3 · Fotos dos jogadores

### Fonte

`https://cdn.nba.com/headshots/nba/latest/1040x760/{personId}.png` — verificado
(200, image/png, fundo transparente). ⚠️ **Risco registrado:** imagem licenciada de
terceiro usada sem contrato; decisão comercial na lista do CJ. Trocar fonte = trocar
o mapa, não código.

### Componente `<Avatar>` (design-system)

- `fotoUrl` presente → `next/image`, `object-fit: cover; object-position: top`
  (headshot é paisagem; corte central decapita).
- `fotoUrl` nulo → monograma: iniciais em Anton sobre fundo derivado
  deterministicamente do nome do time.
- O anel do nível do apito + numeral moram AQUI (todas as telas herdam).
- `next.config.ts`: `images.remotePatterns` para `cdn.nba.com` — o otimizador busca
  uma vez e serve do nosso domínio (CDN fora do ar ≠ demo quebrada; sem hotlink no
  browser do cliente).

### Mapa curado + script

- `src/modules/ingestao/demo/fotos.ts`: mapa estático `nome na lista → personId`
  (grafias do CJ: "chmaphagnie", "Kesller"...), cobrindo no mínimo os 8 times da
  rodada da demo. Quem não está no mapa cai no monograma.
- `scripts/demo-fotos.ts` + `npm run demo:fotos`: para cada entrada, faz requisição de
  verificação e **só grava `foto_url` que respondeu 200**. Validação na gravação,
  nunca na renderização → zero imagem quebrada em apresentação.
- FORA do `demo:seed` de propósito: o seed é determinístico e roda sem rede (PGlite).
  A função de fetch entra por injeção para o teste rodar offline.

---

## 4 · Telas e navegação

### Barra de abas (5, nomes do mockup)

```
▣ ENTRADAS   □ AO VIVO   ○ STATS   ◇ GESTÃO   ○ PERFIL
```

Ícones geométricos SVG inline (quadrado/quadrado/círculo/losango/círculo), contorno
inativo, **preenchido laranja** no ativo. Rótulos Barlow Condensed. `/estatisticas`
promovida a aba; `/conta` vira rótulo `PERFIL` (rota mantida).

### Cabeçalho padrão (componente novo `CabecalhoTela`)

```
◆ LISTA SECRETA · PRÉ-LIVE     ← sobrancelha: marcador + texto, cor por contexto
LISTA DO DIA                    ← Anton caixa alta
[chips]
```

Contextos: losango laranja (Entradas/Stats/Gestão/Perfil) · quadrado vermelho + texto
`FIRE LIVE · AO VIVO` (Ao vivo) · botão-seta laranja nas telas de detalhe. Chips
ativos = contorno + texto laranja (substitui preenchimento branco atual).

### Entradas absorve Resultados

Seletor `[HOJE] [RESULTADOS]` no cabeçalho de `/`. A rota `/resultados` CONTINUA
existindo (push/links apontam para ela) — as duas telas compartilham cabeçalho e o
seletor navega entre elas. Aba Resultados sai da barra.

### Fire Live ganha placar

Grade de mini-placares dos jogos **em 1º quarto** (dados de `estatisticas_time_jogo`),
com ponto vermelho pulsante. Sem cronômetro (não existe no modelo).

### Inventário de telas

| Tela | Mudança |
| --- | --- |
| `/` Entradas | cabeçalho, chips, cards novos, seletor Hoje/Resultados |
| `/resultados` | mesmo cabeçalho/seletor, cards com foto |
| `/fire-live` Ao vivo | cabeçalho vermelho, placar, selo VIVO, barra de progresso |
| `/apito/[id]` | redesenho completo (seção 5) |
| `/estatisticas*` Stats | promovida a aba, cabeçalho novo, avatar nas páginas de jogador |
| `/gestao` | cabeçalho novo, cards com foto |
| `/conta` Perfil | cabeçalho novo |
| `/como-funciona` | tipografia herda; a régua de confiança vira os 5 degraus turquesa com rótulos |
| entrar/cadastrar/assinar | tipografia + botões (gradiente laranja no CTA) |
| `(admin)/*` | SÓ herda fontes — sem redesenho |

---

## 5 · Conteúdo novo

### Detalhe da entrada (`/apito/[jogadorId]` redesenhado)

```
← [seta laranja]  LISTA SECRETA · PRÉ-LIVE / D. MALLOY

╭ CONFIANÇA MÁXIMA ───────────────────────╮
│ Pontos 20+                       92%    │   hero: contorno turquesa grau 5 + brilho
╰─────────────────────────────────────────╯
[MÉDIA 25,7] [BATEU 4/5] [MIN 33']            três caixas de contorno
ÚLTIMOS 5 JOGOS NA LINHA
▓▓▓ ▓▓▓ ░░░ ▓▓▓ ▓▓▓                           bloco verde = bateu a linha; sigla do
LKV HAR CAP RED SUM                           adversário embaixo
╭ POR QUE ENTROU ─────────────────────────╮
│ ◆ 3 jogos seguidos abaixo de 20,7 pts.  │   a REGRA que disparou (oscilação: N jogos
│   Média da temporada: 25,7.             │   abaixo do limiar; OPD: quem está fora +
╰─────────────────────────────────────────╯   distância na hierarquia)
[demais linhas de pontos — como hoje, com odds]
╭─────────── VER ESTATÍSTICAS ────────────╮   gradiente laranja → rotaDoJogador()
```

**Fonte de dados:** módulo novo `src/modules/entrega/detalhe-apito.ts` — leitura
derivada de `estatisticas_jogo` + `jogos` + `medias_jogador` + o apito publicado.
NÃO é motor (nenhuma regra nova; só descreve o que o motor já decidiu). A tela
continua sem executar motor — fronteira inalterada.

- `MÉDIA` = média da temporada (a que o motor usou).
- `BATEU x/5` = últimos 5 jogos com valor ≥ linha do card.
- `MIN` = minutos do jogo mais recente.
- Blocos = mesmos 5 jogos, verde quando bateu, sigla do adversário.
- `POR QUE ENTROU` = texto montado do apito gravado (método, nível, limiar
  `média − delta` do ruleset; OPD: nome do desfalcado + distância).

### O que NÃO entra (regra do CJ vence o mockup)

- Três pontos como atributo (nenhuma classificação do CJ; evitaria-se também migration
  de enum sem down limpo).
- Linha com meio ponto (`+18,5`).
- `MÉDIA 5J` como base da entrada.
- Cronômetro do jogo no placar.

---

## 6 · Testes

Sem ferramenta de regressão visual (não introduzir). Testa-se a REGRA atrás do visual:

1. **Tokens** (existente, estendido): paridade TS↔CSS cobre os tokens novos.
2. **Contraste** (existente, estendido): 5 degraus turquesa, texto na pílula, chips
   laranja — par ilegível quebra a suíte.
3. **Colisão de canais** (novo): nenhum degrau turquesa == cor de apito == metálica.
4. **`faixaDaConfianca`** (novo, motor): bordas das faixas, fora de amplitude, null;
   trocar limiar no YAML muda a faixa sem código.
5. **`detalhe-apito`** (novo, PGlite + seed real): média correta, `bateu 4/5`,
   adversários dos 5 blocos, "por que entrou" nos dois métodos.
6. **`<Avatar>`** (novo): com foto → img; sem → monograma com iniciais certas; fundo
   determinístico.
7. **`demo-fotos`** (novo, fetch injetado): só 200 vira `foto_url`.
8. **Fumaça de telas** (existente, estendido): brilho SÓ no grau máximo; nenhuma tela
   contém `+18,5` nem `ALTÍSSIMO VALOR`; "probabilidade" só com negação (P12); as 5
   abas com rótulos novos.

Fora de escopo de teste: pixel, sombra, curva de brilho — conferência visual na
galeria do admin.

---

## Perguntas para o CJ (stand-by — levar todas de uma vez)

1. **Calibração da escala de confiança exibida** — as 5 faixas (80-82 / 83-85 / 86-88
   / 89-92 / 93-95) e seus rótulos são demonstração. Quais faixas ele quer?
2. **Rótulo da faixa máxima** — mockup dizia "ALTÍSSIMO VALOR"; usamos "CONFIANÇA
   MÁXIMA" por causa da P12. Ele valida?
3. **Fotos dos jogadores** — estamos usando headshots do CDN da NBA sem contrato.
   Decisão comercial: manter, licenciar ou trocar por monogramas?
4. **Linha com meio ponto** — casas usam 18,5; a lista dele usa inteiras. A tela deve
   exibir a linha como ele define (20+) ou na convenção da casa (19,5)?
5. **Três pontos** — o designer desenhou "3 PONTOS +2,5". Existe (ou existirá)
   classificação de três pontos? Se sim, mandar a lista de níveis.
6. **Cronômetro no placar ao vivo** — depende do provedor entregar relógio de jogo.
   Ele quer isso no card? (custo: campo novo na ingestão quando houver provedor)
7. **(reforço, já pendente)** — listas de REBOTES e ASSISTÊNCIAS; modelo da aba
   Gestão; fuso Brasília vs convenção da liga (rodada partida à meia-noite).
