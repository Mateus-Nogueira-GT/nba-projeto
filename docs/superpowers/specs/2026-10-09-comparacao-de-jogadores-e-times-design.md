# Comparação de jogadores e de times

**Data:** 09/10/2026. **Origem:** a lista de planos do parceiro (09/10) promete ao MVP "comparação
entre jogadores, times e confrontos", e isso não existe no app. Decisões tomadas em conversa no
mesmo dia.

## 1. Objetivo

O assinante põe dois jogadores, ou dois times, lado a lado e vê quem está melhor: nas médias da
temporada e na forma recente. Para times, vê também os jogos entre eles. É dado canônico, da aba
de estatísticas: **nenhuma regra de estratégia, nenhum apito, nenhum nível NIP** entra aqui.

## 2. Decisões

| Pergunta | Decisão |
| --- | --- |
| O que é "confrontos" | Dois times frente a frente, com o histórico dos jogos entre eles na temporada |
| O que compara entre jogadores | Médias da temporada e forma recente (últimos 5, 10, temporada). Sem nível NIP, sem apitos |
| Acesso | A regra das estatísticas: na temporada do calendário exige MVP; 2025-26 aberta a todo plano |
| Entrada | Botão "Comparar com…" na página do jogador e na do time, que abre a busca do mesmo tipo; link compartilhável |
| Jogador × time | Não existe |

## 3. Rota e entrada

- `GET /estatisticas/comparar?tipo=jogador|time&a=<id>&b=<id>` com os parâmetros que as páginas
  já aceitam: `temporada=` (só entre as disponíveis, como `temporadaDasEstatisticas`) e, para
  jogadores, `periodo=5|10|temporada`.
- `a` e `b` são UUIDs de `jogadores` ou de `times`, conforme `tipo`. Id inválido, inexistente ou
  `a === b` → `notFound()`. A ordem é a da URL: `a` à esquerda.
- Na página do jogador e na do time, ao lado de "Acompanhar", o botão **"Comparar com…"** leva a
  `/estatisticas/comparar?tipo=…&a=<id da página>` **sem `b`**: a tela abre com o lado A
  preenchido e um campo de busca para o lado B. A busca é a de `busca.ts` com `apenas:
  'JOGADOR' | 'TIME'`, e escolher um resultado completa a URL. Sem `b`, a tela não é a comparação
  ainda; é a escolha do segundo.
- `rotas.ts` ganha `rotaDaComparacao(tipo, a, b?, contexto?)`. As páginas e a busca só montam a
  URL por ela.

## 4. Dados

Os números saem **dos mesmos carregadores das páginas**, chamados uma vez por lado, em paralelo:
`telaDoJogador` (com `periodo`) e `telaDoTime`. É o que garante que a comparação e o perfil nunca
discordam. A comparação não lê o provedor nem cria consulta de médias própria.

- **Jogadores:** `perfil` (foto, time, posição) e `perfilNumeros` (médias da temporada:
  pontos, rebotes, assistências, minutos, FG%, 3P%, LL%, roubos, tocos, erros) de cada lado; o
  `recorte` e o `historico` para a forma recente, no `periodo` escolhido.
- **Times:** `time`, `campanha` (vitórias, derrotas, aproveitamento, posição, sequência) e as
  médias por jogo de pontos marcados e cedidos, rebotes, assistências, bolas de 3 tentadas e
  convertidas, e erros, calculadas do `jogosDoTime` de cada lado. O histórico entre os dois vem de
  uma função nova em `entrega/estatisticas`, `confrontosEntre(db, timeA, timeB, temporada)`, que
  reaproveita a consulta de `h2h` de `telaDoJogo` (jogos encerrados entre os dois na temporada,
  com data e placar, do mais recente ao mais antigo).
- **Fonte do box do time (achado de 09/10):** `telaDoTime` lê `estatisticas_time_jogo` para o
  box por jogo (`nosso`, `deles`, FG%, 3P%, rebotes, assistências, erros), e essa tabela está
  **vazia em produção**: a BallDontLie não dá box de time. Hoje a página do time mostra "box do
  time ainda não chegou" em todos os jogos. A correção vale para a página e para a comparação: uma
  função única em `entrega/estatisticas`, `boxDoTimePorJogo(db, idsJogo)`, soma `estatisticas_jogo`
  por (jogo, `time_id`), incluindo os pontos por quarto a partir de `estatisticas_quarto`, e
  `telaDoTime` passa a usá-la. A tabela de time deixa de ser lida nas estatísticas. Linhas de
  jogador sem `time_id` (anteriores à 0033) não entram, e o jogo sem nenhuma fica `null`, como hoje.
- A tela recebe os dois lados num só objeto, `DadosDaComparacao`, com `tipo`, `a`, `b`,
  `temporada`, `seletor`, `fuso`, `fusoDia`, `profundidade` e, para times, `confrontos`.

## 5. Tela

- **Cabeçalho:** os dois lados em duas colunas, com foto ou escudo, nome, time e posição (ou
  campanha), e o seletor de temporada que as páginas usam.
- **Jogadores:**
  - *Médias da temporada:* uma linha por número, valor A à esquerda e B à direita. **O melhor de
    cada linha ganha destaque**; em erros e faltas o menor é o melhor; empate não destaca.
  - *Forma recente:* o seletor de período (5, 10, temporada) e, para cada lado, a média do recorte
    e o `GraficoDesempenho` que a página do jogador já desenha, com o mesmo atributo (pontos por
    padrão).
- **Times:**
  - *Campanha e médias* na mesma forma de linhas com destaque (em pontos cedidos e erros, o menor
    é o melhor).
  - *Jogos entre eles:* lista com data, placar e quem venceu, mais o saldo "A 2 × 1 B" na
    temporada. Sem jogo entre eles, a seção diz isso.
- **Acesso:** `exigirNivel('GRATIS', rota)` abre a página; `profundidade = seletor.anterior ||
  atende(nivel, 'MVP')`. Sem profundidade, a tela mostra o cabeçalho dos dois e a `Silhueta` com o
  mesmo botão de assinar das páginas; nenhum número pago chega ao HTML.
- **Celular:** duas colunas estreitas; os nomes ficam fixos no topo ao rolar (`position: sticky`).
  Abaixo de 360 px os dois gráficos de forma empilham.
- Cores e tipografia só por tokens de `src/ui/tokens.css`. Nenhum texto com "probabilidade".

## 6. Testes

- Fumaça da tela: jogador × jogador e time × time, na temporada atual e em 2025-26, pela página e
  pela `@painel` se a seção tiver painel.
- Igualdade: os números de cada lado são **iguais** aos da página do mesmo jogador/time com a
  mesma temporada e período (prova de que não há segunda conta).
- Destaque: o maior vence, o menor vence em erros e faltas, empate sem destaque.
- Confrontos: três jogos entre A e B e um de A contra C → só os três aparecem, do mais recente ao
  mais antigo, com o saldo certo.
- Box do time somado dos jogadores: com `estatisticas_time_jogo` vazia e só box de jogador, a página
  do time e a comparação mostram os números por jogo (inclusive por quarto); jogador sem `time_id`
  não entra.
- Portão: grátis na temporada atual vê silhueta e nenhum número pago no HTML; em 2025-26 vê tudo;
  MVP vê tudo nas duas.
- Rota: `a === b`, id inválido e `tipo` desconhecido dão `notFound`; sem `b` abre a escolha.
- Botão "Comparar com…" presente nas duas páginas e apontando para a rota certa.

## 7. Fora do escopo

Jogador contra time, nível NIP e apitos na comparação, comparar três ou mais, painel
personalizado, histórico de análises e Telegram.
