# Rebotes e assistências saem do papel

**Data:** 21/09/2026 · **Status:** spec escrita a partir da versão nova do documento do CJ,
com o escopo fechado pelo parceiro no mesmo dia. **Aprovada para execução direta.**
**Contexto:** o arquivo de fonte no repositório é uma versão **anterior** do documento. A
versão nova traz a classificação de **rebotes** e de **assistências** — 30 times cada —, que
até aqui não existiam. O `CLAUDE.md` diz "só existe classificação de PONTOS"; essa frase
deixa de ser verdade, e o caminho que leva a lista do CJ até o banco não aguenta a mudança.

---

## 1 · Objetivo em uma frase

O caminho que importa a lista do CJ passa a entender **três atributos em vez de um**, os
dados de rebotes e assistências entram no banco, e nenhum apito com número inventado chega
em assinante.

## 2 · Problema

São três defeitos empilhados, e os dois primeiros são de construção, não de dado.

**O parser é mono-atributo por construção.** `parser.ts` lê de `lista de niveis` até
`**lista secreta**` e `JogadorNaLista` não tem campo de atributo. No documento novo, rebotes
e assistências ficam **entre** esses dois marcos: o parser engoliria os três blocos como se
fossem um só.

**As linhas de rebotes vêm em negrito.** `nomeDoTime` só rejeita linha de jogador com
`/^\s*\d+\s*\\?-/`, que não casa com `**1 \- Towns \- MVP**` por causa do `**` na frente. O
resultado não é erro: é **cada jogador de rebotes virando um time**. Cerca de 120 times
falsos e zero jogador, em silêncio.

**O import engole repetição.** `importar.ts` grava com `.onConflictDoNothing()` e conta
`casados` **antes** do conflito. Quando o mesmo jogador aparece em dois times no mesmo
atributo, a segunda entrada desaparece sem uma linha de aviso — e o relatório ainda diz que
ela entrou. O documento novo tem pelo menos dois casos assim.

Há ainda um defeito de dado: `atributo: 'PONTOS'` está cravado em dois pontos de
`importar.ts`.

## 3 · O que a versão nova do documento traz

| Bloco | Situação |
| --- | --- |
| Lista de Níveis (Rebotes), 30 times | **novo** — não existe no arquivo do repositório |
| Assistências, 30 times | **novo** |
| Limiares de rebotes (MVP ≥10 · All Star 7–9,8 · Suporte 4–6,9) | **novo** |
| Limiares de assistências (MVP ≥8 · All Star 6–7,9 · Suporte 4–5,9) | **novo** |
| Oscilação desdobrada por atributo (pontos ≤5 · rebotes ≤4 · assistências ≤2) | **novo** — o arquivo antigo só diz "≤5", genérico |
| Fire Live, assistências: média mínima | **mudou** — era `>= 5`, virou `>= 4` |
| OPD em rebotes só nos níveis 2 e 3 | já estava no ruleset, veio por DOCX em 08/09 |

## 4 · As decisões do parceiro (21/09)

1. **Escopo:** entra a máquina e o que o documento define sem ambiguidade. O que está em
   contradição **não vira código** — vira pergunta registrada. (`CLAUDE.md` §3.)
2. **Jogador repetido em dois times:** **não** muda a chave única. A repetição vira pergunta
   ao CJ. O import passa a reportá-la em vez de engolir.

## 5 · As correções

### 5.1 · O parser passa a enxergar três seções

`JogadorNaLista` ganha `atributo: Atributo`.

O `INICIO`/`FIM` de hoje dão lugar a **reconhecimento de cabeçalho de seção**, que troca o
atributo corrente:

| Cabeçalho no documento | Atributo |
| --- | --- |
| `Lista de Níveis(Pontos)` | `PONTOS` |
| `Lista de Níveis(Rebotes)` | `REBOTES` |
| `Assistências` | `ASSISTENCIAS` |

A leitura começa no primeiro cabeçalho reconhecido e termina em `**Lista secreta**`, como
hoje. Jogador encontrado antes de qualquer cabeçalho continua sendo `problema` — agora com o
motivo certo, "jogador antes de qualquer cabeçalho de seção".

**A correção do negrito é obrigatória e vem antes de tudo:** `nomeDoTime` limpa os `**` da
linha **antes** de decidir se ela é jogador ou time. Sem isso, a seção de rebotes não produz
um jogador sequer.

**As faixas viram linha ignorada, não problema.** `Mvp - média de 10 rebotes em diante` e
suas gêmeas em negrito não são time nem jogador. Ignorá-las em silêncio é correto; marcá-las
como `problema` afogaria o relatório em ruído e esconderia o que importa.

### 5.2 · O importador passa a gravar o atributo que leu

`atributo: 'PONTOS'` sai dos dois lugares e passa a vir de `j.atributo`.

**O `.onConflictDoNothing()` sai.** No lugar, antes de gravar, o import agrupa por
`(jogador, atributo)` e:

- grupo com **uma** entrada → grava;
- grupo com **duas ou mais** → **nenhuma** entra, e o caso vira um `problema` com as duas
  linhas, os dois times e o motivo `"mesmo jogador em dois times no mesmo atributo"`.

A contagem de `casados` passa a refletir o que foi gravado, não o que foi tentado.

A razão de não escolher a primeira: o vínculo jogador↔time vem da curadoria do CJ e nada
mais (`CLAUDE.md`, armadilhas). Escolher por conta própria em qual time Klay Thompson joga é
exatamente a regra inventada que a §3 proíbe.

### 5.3 · Ruleset: dois números e um interruptor

- `fire_live.assistencias.media_minima`: `5` → **`4`**, com comentário registrando que o
  valor mudou entre versões do documento e que o 5 era o da versão anterior.
- `por_atributo.REBOTES.oscilacao.delta`: os quatro níveis passam a **`4`**, o valor do
  documento, com comentário dizendo que esse número deixou de ser invenção.
**Os limiares de classificação (MVP ≥10 etc.) NÃO entram no ruleset.** Nada os consome: o
nível vem da lista nominal do CJ, não de cálculo sobre a média — não existe classificador por
média no motor. Eles ficam capturados no próprio arquivo de fonte, que esta passada troca.
Pôr no ruleset um bloco que ninguém lê é duplicação que apodrece.

**`por_atributo.*.confianca`, `.odds` e `.marcos_green` ficam exatamente como estão.** O
documento não dá esses números para rebotes nem para assistências.

**E `origem` continua `demonstracao` nos dois blocos** — apesar de o delta de rebotes ter
virado dado real. `origem` é um valor único por atributo e alimenta o aviso que a UI mostra
sobre o atributo inteiro: enquanto confiança e odds forem invenção minha, o atributo é
demonstração, mesmo com uma parte dele homologada. Marcar `homologado` por causa do delta
apagaria o aviso das odds.

### 5.4 · O interruptor

`niveis.atributos` passa a **`[PONTOS]`**.

Esse array é o que `motor/index.ts` e `motor/fire-live/avaliar.ts` iteram: ele é o
liga-desliga de atributo que já existia, e hoje só está inerte porque nenhum jogador tem
nível de rebotes. **No instante em que o import rodar, ele deixa de ser inerte** — e rebotes
e assistências iriam ao ar com confiança e odds inventadas.

Com os dados no banco e o array em `[PONTOS]`: a importação é conferível pela tela de admin,
fica versionada, e nada chega no celular de assinante. Religar, quando o CJ mandar % e odds,
é **uma linha de YAML, sem deploy de código** — que é o teste da regra 1 do `CLAUDE.md`.

### 5.5 · O arquivo de fonte

`data/fontes/introducao-ia-nba.md` é substituído pela versão nova. É fonte: tem que refletir
o que o cliente mandou, não uma foto antiga dele.

## 6 · Arquitetura

Nada de novo nasce. O que muda é a largura de um caminho que já existe:

```
documento do CJ  →  parser.ts  →  importar.ts  →  niveis (banco)  →  motor
                    (+atributo)   (+atributo)      (schema já       (já indexa por
                                  (−onConflict)     aceita os três)  atributo)
```

As duas pontas **já estão prontas** e não são tocadas:

- `niveis.atributo` é enum com os três valores, e a tabela é versionada de propósito — o
  comentário do schema diz, literalmente, que rebotes e assistências virão por INSERT de
  versão nova, sem migração. **É o que acontece aqui.**
- O motor lê `jogador.classificacoes[atributo]`, já indexado por atributo. `oscilacao.ts`
  retorna `null` para quem não tem nível naquele atributo, que é o comportamento correto.

O motor continua puro. Nenhuma migração. Nenhuma mudança de schema.

## 7 · Verificação

**Parser** — fixture com as três seções, incluindo o negrito de rebotes, as faixas repetidas
e o cabeçalho duplo `**Dallas** **Mavericks**`:

- cada jogador sai com o atributo da sua seção;
- 30 times em cada um dos três blocos;
- **zero time falso** (a prova do defeito do negrito);
- as linhas de faixa não aparecem nem como time, nem como jogador, nem como problema.

**Importador** — o mesmo jogador em dois times no mesmo atributo não grava nenhuma das duas
e produz um `problema`; `casados` bate com o que foi gravado.

**Fonte** — teste que falha se `atributo:` voltar a ser literal em `importar.ts`, lendo o
arquivo sem comentários (a armadilha de 19/09: `includes` casa dentro de comentário).

**Ruleset** — um teste prova que `niveis.atributos` é `[PONTOS]`, para que religar seja uma
decisão consciente e não um acidente de merge. Nenhuma mudança no schema Zod.

**Regressão** — os testes de `ingestao.test.ts` que hoje cravam "30 times, 230 jogadores"
leem o arquivo real e **vão quebrar** quando ele for trocado. Eles passam a afirmar por
seção, com as contagens medidas no arquivo novo.

## 8 · Fora de escopo

**Perguntas para o CJ** (vão para `docs/05-perguntas-abertas.md`, não para o código):

1. O documento termina em **"Atualização lista secreta de assistências:"** e não vem nada
   depois. O que era para vir? Enquanto não vier, a lista de assistências pode estar velha.
2. **Randola não existe** em rebotes nem em assistências — as duas tabelas só definem MVP,
   All Star e Suporte, e as listas confirmam. É esquecimento ou é regra?
3. **Assistências: ≤2 ou 4/3/3?** A seção geral diz "≤2 abaixo da média"; a seção de
   assistências diz MVP ≤4, All Star ≤3, Suporte ≤3.
4. **Vãos nas faixas:** 9,9 rebotes não é MVP (≥10) nem All Star (7–9,8). Mesma coisa em
   7,95 assistências e 6,95 rebotes.
5. **Modo Fire: 70% ou 75%?** O parágrafo diz 70, a OBS diz 75. Resolvemos por 75 (P4), mas o
   documento segue ambíguo.
6. **Klay Thompson** aparece em Dallas e Miami; **Mathurin**, em Pelicans e Clippers. Qual
   vale? (Wiggins em Miami e Atlanta são dois jogadores reais distintos e não são problema.)
7. **Detroit, em assistências,** tem "Cadê Cunningham" sem nível nenhum.
8. **"Jogadores fora da lista de rebotes entram na oscilação com média acima de 4"** — em que
   nível de apito? Quem não está na lista não tem nível, e a regra "Suporte e Randola não
   apitam nível 1" não o alcança.
9. **% e odds de rebotes e assistências.** O documento só dá as de pontos. Sem elas o
   interruptor da §5.4 não pode ser religado.

**Não entra também:** o construtor de aposta ("Divisão"), o modelo de gestão de banca (o
arquivo "enviado no grupo" nunca chegou) e a definição de quais matchups — os três já
constam de `05-perguntas-abertas.md` como escopo novo, não contratado.

## 9 · Ordem

1. Correção do negrito em `nomeDoTime` — sem ela nada mais é observável
2. `atributo` no parser e o reconhecimento das três seções
3. `atributo` no importador; fim do `.onConflictDoNothing()`; detecção de repetição
4. Troca do arquivo de fonte
5. Ruleset: os dois números e o interruptor
6. `05-perguntas-abertas.md` e a frase do `CLAUDE.md` que deixou de valer

O passo 1 vem primeiro porque é o único que, sozinho, muda o que o parser enxerga: com ele
de pé, os passos seguintes podem ser conferidos rodando o parser no documento real.

## 10 · Riscos

**A lista de assistências pode nascer velha** (pergunta 1). Aceitável: a tabela é versionada
justamente para isso, e reimportar é rodar o script de novo.

**O interruptor pode ser religado sem querer** num merge futuro, e aí odds inventadas chegam
em assinante. Mitigado pelo teste da §7 que trava `niveis.atributos` em `[PONTOS]`: religar
exige mexer no teste, o que é uma decisão visível no diff.

**A repetição pode não ser erro.** Se o CJ responder que Klay joga nos dois, aí sim a chave
única precisa mudar — e isso é outra passada, com migração.
