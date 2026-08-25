# Modo demonstração — o que é real e o que foi inventado

O produto está no ar sem provedor de NBA contratado, sem casa de aposta
conveniada e sem duas das três listas de níveis. Para que a apresentação ao
cliente mostre o produto inteiro, o repositório carrega um **seed de
demonstração**.

Este documento existe para uma pergunta só: **na hora de apresentar, o que dá
para afirmar?**

---

## A regra que organiza tudo

> Inventamos **fatos**. Nunca inventamos **resultados**.

O seed escreve matéria-prima — elencos, médias, box scores, escalação, quarto
ao vivo, cotações — e depois chama o pipeline de produção:
`publicarListaSecreta` e `executarCiclo`. **Todo apito, confiança, alvo, green
e faixa de odd na tela foi calculado pelo motor real com o ruleset.** Nada é
escrito à mão.

Consequência prática: se a demo mostra um apito errado, o defeito é do motor,
não do seed. A demo é prova, não maquete.

---

## Pode afirmar sem ressalva

| O quê | Por quê |
| --- | --- |
| As estratégias | Oscilação, OPD, turbo, modo fire, bloco de topo e green rodam o ruleset homologado em 18/08/2026 |
| Os níveis de **pontos** | Vêm do documento do CJ, lidos pelo parser de verdade |
| A tabela de confiança de pontos | Tabela do CJ, com os bônus por nível de apito |
| Os marcos de green de pontos | 25/30/35… são os do documento |
| Idempotência e push | A UNIQUE de `apitos` e `greens` é o mecanismo de produção |
| Cobrança e controle de acesso | Mercado Pago em modo *fail-closed* |

## Diga que é demonstração

| O quê | O que falta | Como aparece na tela |
| --- | --- | --- |
| **Níveis de rebotes e assistências** | O CJ classificou só pontos | Derivados da posição pelo seed |
| **Tabelas de rebotes e assistências** | Linhas, confiança, odds e marcos | `por_atributo` no ruleset, `origem: demonstracao` — a aba **Como funciona** marca "· demonstração" |
| **Gestão de banca** | O modelo do CJ ("enviado no grupo") não chegou | `gestao_banca` no ruleset — a aba mostra um aviso em vermelho |
| **Casas de aposta** | Nenhum contrato (G4) | "Casa Alfa/Beta/Gama" — nomes fictícios de propósito |
| **Elencos, médias e box scores** | Sem provedor NBA contratado | Determinísticos, derivados do documento |
| **Rodada do dia** | Sem calendário real | Quatro confrontos fixos, um deles ao vivo no 1º quarto |
| **Rampa turquesa de confiança** | Os cinco limiares (80/83/86/89/93) são um chute calibrado, não o número que o CJ validaria | `confianca_exibicao.origem: demonstracao` no ruleset — ver `docs/04-design-system.md` § Identidade 02 |

Um número inventado nunca fica solto no código: vive no `ruleset` num bloco
marcado `origem: demonstracao`. Quando o CJ enviar os dele, é diff de YAML.

---

## O roteiro da apresentação

1. **Lista Secreta** — filtre por atributo. Três atributos, um card por
   jogador e atributo, ordenados por confiança.
2. **"linhas e confiança →"** — os quadradinhos do documento: cada linha com
   sua nota e a faixa entre as três casas.
3. **Ao vivo** — o 1º quarto do jogo em andamento, com o MVP em modo fire.
4. **Resultados** — as rodadas encerradas conferidas contra o box score.
5. **Gestão** — troque a banca e veja as entradas mudarem. Leia o aviso em voz
   alta.
6. **Conta → Como funciona** — a metodologia inteira, com os números saindo do
   ruleset.

---

## Comandos

```bash
npx dotenv -e .env.local -- npm run demo:seed              # semeia (idempotente)
npx dotenv -e .env.local -- npm run demo:limpar -- --confirmar   # desfaz
npx dotenv -e .env.local -- npm run demo:fotos              # busca as fotos (ver abaixo)
```

`demo:limpar` apaga **somente domínio**: contas, sessões, assinaturas e
inscrições de push permanecem — quem já testou o login não perde o acesso.

O seed usa o dia em que roda como data de referência. **Rode de novo no dia da
apresentação**, senão a rodada "de hoje" será a de um dia que já passou e a
Lista Secreta abrirá vazia.

---

## Fotos dos jogadores

`demo:seed` é determinístico e não toca rede — de propósito, para continuar rodando sob
PGlite nos testes. As fotos ficam de fora dele, num script separado:

```bash
npx dotenv -e .env.local -- npm run demo:fotos
```

**Fonte.** `src/modules/ingestao/demo/fotos.ts` mantém `MAPA_FOTOS`, um mapa curado à mão
de nome (na grafia exata da lista do CJ, ex. `"Shai"`, `"stephen Curry"`) para o
`personId` oficial de cada jogador no CDN público da NBA
(`cdn.nba.com/headshots/nba/latest/1040x760/{personId}.png`). O script busca cada URL,
grava `jogadores.foto_url` só para as que responderam 200, e reporta o que pulou. As
imagens chegam ao navegador pelo otimizador de imagem do Next
(`next/image`, `<Avatar>`) — por isso aparecem servidas do nosso próprio domínio, mesmo
sendo buscadas na origem do CDN da NBA; `next.config.ts` libera só
`cdn.nba.com/headshots/**`, nenhum outro caminho.

**Por que o mapa é curado à mão, não descoberto por busca de nome.** Um `personId`
errado responde 200 igual — é uma foto válida, só que de outro atleta. A task que criou
o mapa conferiu as 13 entradas visualmente, uma a uma, contra a foto real (ver
`.superpowers/sdd/2026-08-24-identidade-rota-transmissao/task-11-report.md`). Se você
adicionar um jogador novo ao mapa, repita essa conferência — não confie só no HTTP 200.

**Risco de licença.** As fotos são headshots oficiais da NBA, hotlinkados direto do CDN
público dela. Não há contrato de licenciamento de imagem entre este projeto e a NBA — o
uso hoje se apoia em ser (a) uma demonstração privada ao cliente, não um produto público
vendido ao consumidor final, e (b) o mesmo tipo de uso editorial/informativo que sites de
estatísticas fazem rotineiramente com o CDN público da liga. Isso **não é o mesmo** que
ter permissão explícita de uso comercial. Antes de este produto sair do modo
demonstração e virar algo publicamente acessível e cobrado (ver CLAUDE.md — o app já
cobra assinatura via Mercado Pago), vale revisitar esta questão com quem cuida do
jurídico do cliente: manter as fotos como estão, trocar por um provedor de imagem
licenciado, ou cair de volta no monograma do `Avatar` (que já existe como estado sem
`fotoUrl` — nenhuma tela quebra sem foto).

---

## Para sair do modo demonstração

1. Contratar o provedor NBA e preencher as credenciais → os elencos, médias e
   box scores reais substituem o seed.
2. Receber do CJ as listas de níveis de **rebotes** e **assistências** →
   entram pelo importador, e `por_atributo` troca `demonstracao` por
   `homologado` com os números dele.
3. Receber o **modelo de gestão de banca** → `gestao_banca` troca de origem.
4. Fechar contrato com as casas → a porta de odds troca a fonte e as três
   casas fictícias somem.

Nenhum dos quatro exige mudança de código.

## Odds: média entre casas (25/08)

A demo grava `odd_media` igual à mediana nas agregadas — o rodapé `ODD MÉDIA`
do card e a linha "odd média" do detalhe existem na apresentação. Em produção
o número virá de `coletarOdds` sobre as casas do balldontlie
(`/v2/odds/player_props`, plano GOAT): 8 vendors por chamada, tradução
inteira na fronteira (`americana→decimal`, meio-ponto do over→linha do CJ).
Conectar é criar `BALLDONTLIE_API_KEY` e agendar a coleta — a lógica está
pronta e testada com fixture no shape literal do OpenAPI.
