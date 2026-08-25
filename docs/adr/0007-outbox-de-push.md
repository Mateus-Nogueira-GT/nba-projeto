# ADR-0007 — Outbox para o push do Fire Live

**Status:** aceito · 19/08/2026 · deriva do requisito de idempotência do ADR-0003

## Contexto

O ciclo do Fire Live faz, a cada ~20 segundos, três coisas em sequência:

1. grava os apitos com `onConflictDoNothing` sobre `apitos_dedup`
2. descobre o que é novo
3. enfileira o push

A deduplicação por UNIQUE resolve o problema declarado — retry de workflow reexecuta
passos e não pode gerar três pushes iguais. Mas ela cria um segundo problema, no sentido
oposto, que só aparece quando a fila falha:

> O `INSERT` commitou. O envio à fila falhou. O passo é reexecutado. Agora o apito **já
> existe**, o `onConflictDoNothing` não devolve nada, o ciclo conclui que "não há
> novidade" — e o push nunca sai.

Perda silenciosa. Nada estoura, nenhum log acusa, e o assinante simplesmente não recebe o
alerta pelo qual pagou. Numa janela de aposta de 25 minutos, isso é indistinguível de o
produto não funcionar.

Inverter a ordem (enfileirar antes de gravar) só troca o lado do defeito: uma falha entre
o envio e o commit produz push duplicado, que é justamente o que a regra 5 do CLAUDE.md
existe para impedir.

## Decisão

Uma coluna `push_enfileirado_em` em `apitos` e em `greens`. Null = gravado, ainda não
notificado.

O ciclo deixa de derivar o push do retorno do `INSERT` e passa a **drenar um outbox**:

```
grava (a UNIQUE decide o que entra)
   ↓
SELECT ... WHERE push_enfileirado_em IS NULL     ← o que ainda deve push
   ↓
enfileira
   ↓
UPDATE push_enfileirado_em = agora
```

O envio acontece **antes** da marcação, nunca depois.

## Por que essa ordem

As duas falhas possíveis têm consequências assimétricas, e a ordem escolhe qual delas
pode acontecer:

| Falha entre…              | Com envio antes da marcação | Com marcação antes do envio |
| ------------------------- | --------------------------- | --------------------------- |
| gravação e envio          | reenvia no ciclo seguinte   | reenvia no ciclo seguinte   |
| envio e marcação          | **reenvia** (duplicata)     | —                           |
| marcação e envio          | —                           | **push perdido, em silêncio** |

Reenviar é recuperável: a `idempotencyKey` do Vercel Queues carrega a mesma chave de
deduplicação do apito e absorve a repetição. Perder não é recuperável por nada.

## Consequências

- **Custo:** duas colunas e um `SELECT` a mais por ciclo. Ambos indexáveis, ambos
  escopados a um jogo — irrelevante frente ao que evitam.
- **A recuperação não depende do processo que gravou.** Se a função morreu no meio, o
  ciclo seguinte — ou o workflow reiniciado — encontra o pendente e envia.
- **Três barreiras independentes contra push duplicado**, e nenhuma delas confia na
  anterior: a UNIQUE na gravação, o `push_enfileirado_em` no envio, a `idempotencyKey`
  na fila.
- O teste `falha da fila não perde o push` trava esse comportamento. Verificado por
  mutação: inverter a ordem envio/marcação faz o teste falhar.
