# Identidade visual "03 Broadcast" + gaps de UX da proposta comercial — Design

**Data:** 2026-08-25 · **Estado:** aprovado em brainstorm (5 seções + 2 telas de mockup no navegador)
**Referência visual:** mockups aprovados na sessão de brainstorm — `.superpowers/brainstorm/11292-1787622719/content/direcao-visual.html` (direção **B · Broadcast bold** escolhida entre 3) e `linguagem-b.html` (Lista Secreta e Fire Live na linguagem B, aprovadas)
**Decisões do parceiro:** direção "transmissão esportiva de alto nível" · execução B (broadcast bold) com enxerto das barrinhas da direção C · reforma **no lugar** (tokens/componentes reescritos, sem kit v2 paralelo) · migração tela a tela **com aprovação visual no navegador antes do código** · gaps de UX da proposta comercial entram nesta spec · duas specs separadas (esta é a 1ª; a lógica de dados prontos-para-plugar é a 2ª)

## Princípio que governa a spec inteira

> **Onde o mockup e a regra do CJ divergem, o CJ vence.** (herdado da identidade 02 — continua valendo palavra por palavra)
> A identidade 03 muda a FORMA outra vez; o CONTEÚDO segue o ruleset homologado.

E o princípio novo, nascido do diagnóstico desta rodada:

> **Tela crua não entra.** A identidade 02 acertou a direção e falhou no acabamento.
> Cada tela desta reforma só vira código depois de um mockup aprovado no navegador.
> "Parecido com o mockup" não basta — é o mockup.

## Problema

Duas frentes:

1. **O visual atual foi julgado péssimo pelo dono do produto** — tanto a execução
   (telas-esqueleto, espaçamento apertado, hierarquia fraca) quanto a identidade em si,
   que não sustentou a intenção "transmissão esportiva". A direção B aprovada nos
   mockups é a intenção da 02 executada com acabamento de verdade: gradientes, borda
   lateral na cor do grau, brilho no destaque, temperatura por contexto.
2. **A proposta comercial (05/08/2026) promete itens que o app não tem:** histórico das
   últimas partidas no próprio card, exclusão de jogadores no Fire Live, lances livres
   e 2 pontos no perfil, estatísticas do time na partida. Esses gaps entram aqui porque
   são indissociáveis do redesenho das telas onde vivem.

**Fora do escopo desta spec:** Mercado Pago (decisão do parceiro), ingestão real de
dados e odd média entre casas (Spec 2 — "lógica pronta-para-plugar", documento
separado). O rodapé do card já nasce com o slot de odd; mostra a **faixa** atual
(min–máx) até a média existir.

## Itens da proposta comercial já superados (não reconstruir)

A proposta é anterior ao ruleset homologado (18/08). Estes itens dela morreram por
decisão do CJ e **não** voltam:

| Proposta dizia | Decisão posterior | Onde está registrado |
| --- | --- | --- |
| Escala de 5 cores (vermelho→verde) | rampa de um matiz só, recalibrada 80–95 | ADR-0005 + nota de 24/08 |
| Badge "PROBABILIDADE" | % é **nota de confiança**, nunca probabilidade | P12, docs/05 |
| "Integração com casa de apostas" (riscada na proposta, depois cogitada) | **só leitura de odds** — o pedido real era a média entre casas | ADR-0004 intacto; média na Spec 2 |

---

## 1 · Fundação — tokens

Só a **camada de valores** muda. A arquitetura de 3 camadas (primitivo → semântico →
componente), o gerador `npm run tokens` e o teste de paridade TS↔CSS ficam.

### Tipografia — mantida

Anton (display) + Barlow Condensed (rótulos) + Barlow (corpo), via `next/font`.
A personalidade da direção B veio de peso, cor e composição — não de fonte nova.
Trocar corpo agora seria churn sem ganho. **Decisão fechada: nenhuma fonte nova.**

### Cores — o que muda

| Token (semântico) | Valor | Papel |
| --- | --- | --- |
| `fundoTela` | gradiente sutil `#0B1220 → #101a2e` (175°) | fim do chapado |
| `cardGradiente` | `linear-gradient(135deg, #16213a, #111a2e 55%)` | corpo do card pré-live |
| `cardBordaGrau` | 3px na cor do grau (rampa turquesa) | borda **lateral esquerda** do card |
| `turbo` | `#4da3ff` + brilho `0 0 22px rgba(77,163,255,.18)` | card e % do turbo |
| `fireCardGradiente` | `linear-gradient(135deg, #241a2e, #161226 55%)` | card do Fire Live (universo quente) |
| `fireDestaque` | `#FF7A1A` + brilho | modo fire, barra de alvo |
| `vivoSelo` | `#e03e3e` | selo AO VIVO, cronômetro do 1Q |
| `barrinhaBateu` / `barrinhaFalhou` | `#3DD37E` / `#e05555` | histórico últ. 5 |

A rampa turquesa da confiança (80–95, `confianca_exibicao` no ruleset) **não muda** —
o que muda é onde ela aparece (borda lateral + % com brilho, não mais só pílula).

### Temperatura por contexto — regra nova, vira token

Pré-live é **frio** (azuis/turquesa — análise). Ao vivo **esquenta** (laranja/roxo —
urgência). Não é escolha por tela: é um par de tokens semânticos (`contextoFrio*`,
`contextoQuente*`) que cada tela declara. O teste de identidade trava: nenhuma tela
pré-live usa o universo quente e vice-versa.

### Guarda-corpos que continuam

- Colisão de canais: as 4 cores categóricas do apito (🟡🟠🟢🔵) seguem exclusivas do
  anel/badge do avatar; a confiança segue mono-matiz. O teste existente é atualizado
  para as superfícies novas (borda lateral, brilho).
- Brilho de confiança **só no grau 5** (pílula/%). O brilho do turbo e do modo fire
  são de OUTRO canal (nível do apito / estado fire) e coexistem — o teste nomeia os
  três brilhos e seus donos para nunca se confundirem.
- Contraste AA nos pares texto/fundo novos (gradientes medidos no ponto mais claro).

## 2 · Componentes

### Reformados (mesmos arquivos, anatomia nova)

**`CardEntrada`** — 3 zonas empilhadas:

1. **Cabeçalho:** Avatar (anel do nível) · nome em Anton caixa-alta · linha de apoio
   `SIGLA · VS ADV · HOJE HH:MM` (Barlow Condensed) · % em Anton 30px com brilho na
   cor do grau (turbo: azul).
2. **Barrinhas:** rótulo `ÚLT. 5 NA LINHA` + 5 quadradinhos com o VALOR do jogo,
   verde/vermelho por bateu/falhou (componente novo abaixo).
3. **Rodapé:** faixa translúcida na cor do grau — `PONTOS 25+` à esquerda,
   `MÉDIA 25,7 · ODD 1,47–1,62` à direita (o slot troca para `ODD MÉDIA` quando a
   Spec 2 entregar).

Borda lateral esquerda 3px na cor do grau. Brilho de card só para turbo e modo fire.
No Fire Live, a zona 2 vira a **BarraAlvo** (não faz sentido "últ. 5" durante o 1Q).

**`Avatar`** — mantém contrato (foto/monograma, anel nivelApito, badge N); ganha os
valores novos de anel e o badge turbo `🔵T`.

**`Pilula`** — segue existindo para rótulos de faixa (`CONFIANÇA MUITO FORTE`);
perde o papel de portadora única da cor (a borda lateral divide o trabalho).

**`CabecalhoTela`** — título Anton + selo de contexto à direita (`PRÉ-LIVE` laranja /
`■ AO VIVO` vermelho), como nos mockups.

### Novos

| Componente | O que é | Dado que consome |
| --- | --- | --- |
| `Barrinhas` | 5 quadrados valor+cor, rótulo opcional | `ultimos5` do item do feed |
| `PlacarMini` | `LAL · 23 · 19 · DEN` + `1Q · 4:12` | placar do snapshot fire live (já existe) |
| `BarraAlvo` | barra de progresso com marca do alvo e contagem `9 / 10` | `valorNoQuarto` / `alvo1Q` (já existem) |
| `ChipFiltro` | pílula de filtro ativo/inativo (laranja/contorno) | estado de URL (como hoje) |

Todos entram na galeria do admin e ganham teste próprio. A galeria é o catálogo vivo:
componente que não está nela não existe.

## 3 · Dados que o design exige

### `ItemFeed.ultimos5` — barrinhas no card

Novo campo materializado: `ultimos5: { valor: number; bateu: boolean }[]` (0–5
entradas, mais recente primeiro), calculado **na materialização** contra a linha
principal do apito — a tela não chama o motor (`tela-nao-chama-o-motor`). O detalhe
do apito já calcula "últimos 5 na linha"; a função sai do módulo `detalhe-apito`
para ser compartilhada pela materialização. O hash do feed cobre o item inteiro
(commit `ef62423`), então o campo novo conta como mudança automaticamente — nenhum
cuidado extra de invalidação.

### `ItemFeed.mediaTemporada` e `ItemFeed.oddFaixa` — o rodapé do card

O rodapé exige mais dois campos que hoje só o detalhe tem:

- `mediaTemporada: number | null` — de `medias_jogador`, na materialização (o mesmo
  valor que o detalhe mostra; a função é compartilhada para as telas nunca
  discordarem).
- `oddFaixa: { min: number; max: number; qtdCasas: number } | null` — de
  `odds_agregada` para a linha principal, na materialização. Null quando não houve
  coleta (o rodapé então mostra só linha e média — sem "odd —" vazio). Quando a
  Spec 2 entregar a média entre casas, o campo ganha `media` e o rótulo do rodapé
  troca de `ODD 1,47–1,62` para `ODD MÉDIA 1,55` — o componente já nasce sabendo
  renderizar os dois estados.

Odds mudam ao longo do dia e o snapshot republica no cron da Lista Secreta — a
faixa do card tem o frescor do feed, igual a tudo no card. Não é defeito: é o
mesmo contrato de frescor do resto do snapshot, e o rodapé do detalhe continua
consultando a coleta na hora para quem quer o número mais quente.

### `jogadores_ocultos` — exclusão no Fire Live

Tabela nova: `jogadores_ocultos (usuario_id, jogador_id, criado_em)` com UNIQUE no
par. Por **conta** (não dispositivo): sincroniza entre aparelhos. UI: ícone de olho
no card do Fire Live (ocultar) + seção "Jogadores ocultos" na própria tela com a
lista e o desfazer. Aplicação: recorte de **leitura** puro sobre os itens do feed —
o motor e a materialização não sabem que a preferência existe (o snapshot é por
evento, nunca por usuário). Push: **não** filtra nesta spec — ocultar tira da tela,
não da notificação (comportamento simples de explicar; filtrar push por preferência
individual mexe no fan-out e fica para quando o CJ pedir).

### Perfil — 2 pontos e lances livres

`estatisticas_jogo` já tem `doisC/doisT`; **lances livres não têm coluna** — migração
adiciona `llC/llT` (smallint, default 0) + `gerar-down`. A consulta do perfil e a
tabela de últimos jogos ganham as duas colunas (acertos/tentativas/%). O seed da demo
passa a gerar valores coerentes (2P + 3P + LL somam os pontos do jogo — o teste
trava a soma).

### Tela do time — boxscore na partida

**Constatação da execução (25/08, T11):** a tela do time JÁ renderiza o boxscore
por partida — tabela com 1º..4º quarto, prorrogação, total, FG%, 3P%, rebotes,
assistências e turnovers (entregue na T10 da identidade 02; o brainstorm
subestimou o que existia). O item da proposta comercial está coberto.

O "bloco ao vivo do time" desenhado aqui NÃO foi construído, de propósito: seria
um cano de dado que nem a ingestão fake nem a demo alimentam separadamente — o
jogo em andamento aparece na MESMA tabela assim que o box do time chega. Se um
provedor real passar a escrever `estatisticas_time_jogo` durante a partida, a
tabela o mostra sem código novo. Reabrir só se o CJ pedir um destaque dedicado.

## 4 · Migração tela a tela

Ordem de reforma (cada uma: **mockup no navegador → aprovação → código com teste**):

> **Delegação de 25/08 (madrugada):** o parceiro delegou a aprovação por etapa.
> O critério passa a ser objetivo: cada mockup é conferido contra os dois aprovados
> em sessão (`linguagem-b.html`) — mesmos tokens, mesma anatomia de card, mesma
> temperatura por contexto — antes de virar código. Todos os mockups ficam salvos
> em `.superpowers/brainstorm/` para auditoria do parceiro pela manhã; divergência
> apontada vira retrabalho da tela, não reabertura da spec.

1. **Tokens + componentes base** (Barrinhas, PlacarMini, BarraAlvo, ChipFiltro,
   CardEntrada novo) — validados na galeria do admin
2. **Lista Secreta** (é a vitrine; estreia barrinhas e rodapé)
3. **Fire Live** (estreia PlacarMini, BarraAlvo, card quente, exclusão de jogadores)
4. **Detalhe do apito** (hero, linhas, POR QUE ENTROU na linguagem nova)
5. **Resultados + Gestão de banca**
6. **Estatísticas** (índice, jogador com 2P/LL, time com boxscore)
7. **Como-funciona / auth / assinar / conta** (a régua de confiança re-renderizada)

Telas 5–7 podem ter aprovação em lote (mockup único com as três) — são aplicação da
linguagem, não criação. O passo 1 não tem mockup próprio: os aprovados desta sessão
são a referência dele.

## 5 · Testes

- **Identidade:** paridade TS↔CSS de tokens · colisão de canais nas superfícies novas
  · os três brilhos e seus donos · temperatura por contexto (pré-live frio / vivo
  quente) · contraste AA nos pares novos.
- **Componentes:** cada novo com render test (Barrinhas: valor e cor por bateu;
  BarraAlvo: proporção e marca; PlacarMini: só 1Q). CardEntrada: as 3 zonas, slot de
  odd com faixa, zona 2 trocada no contexto fire.
- **Dados:** `ultimos5` materializado correto (mesma função do detalhe — as duas
  telas nunca discordam) · exclusão como recorte puro (`filtrarOcultos`) · soma
  2P+3P+LL = pontos no seed · migração LL com down.
- **Transversais:** `telas-demo.test.ts` — nenhuma tela pré-live com token quente,
  barrinhas presentes na lista, exclusão persiste entre requests.
- **Fumaça final:** tsc + lint + boundaries + suíte + build, o rito de sempre.

## Registro

- Esta spec é a identidade **03 · Broadcast**. `docs/04-design-system.md` ganha a
  seção nova e a nota de superação na seção da 02 (mesmo rito da nota do ADR-0005).
- Os mockups aprovados ficam em `.superpowers/brainstorm/` (gitignored) — os valores
  que importam estão transcritos nesta spec; o mockup é referência de sessão, não
  documento canônico.

## Perguntas para o CJ (stand-by — juntar às pendentes)

1. As **barrinhas no card** mostram os últimos 5 **na linha principal** do apito.
   Quando o jogador tem 2+ linhas (20+/25+/30+), a principal é a de menor linha —
   confirmar que é essa a leitura que ele quer de relance.
2. **Ocultar jogador** no Fire Live esconde da tela mas **não** silencia o push do
   jogador oculto — confirmar se é o comportamento desejado ou se o push também cala.
