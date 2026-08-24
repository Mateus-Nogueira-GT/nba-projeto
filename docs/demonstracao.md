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
```

`demo:limpar` apaga **somente domínio**: contas, sessões, assinaturas e
inscrições de push permanecem — quem já testou o login não perde o acesso.

O seed usa o dia em que roda como data de referência. **Rode de novo no dia da
apresentação**, senão a rodada "de hoje" será a de um dia que já passou e a
Lista Secreta abrirá vazia.

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
