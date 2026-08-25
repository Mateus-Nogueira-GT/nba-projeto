# Spec 05 — Feed e filtros do Fire Live

**Estado:** proposta · 19/08/2026
**Depende de:** spec 01 (dado ao vivo) · spec 02 (o push precisa de destino)
**Destrava:** o destino do toque na notificação

---

## Problema

O Fire Live grava apitos, deduplica em três barreiras e enfileira push. **Não há
tela.** O feed materializado só existe para a Lista Secreta:

```
feed_snapshot UNIQUE (data_referencia, estrategia)
```

A estratégia `FIRE_LIVE` está no enum e nunca é gravada. `/` renderiza apenas
`lerFeed(db, hoje)`, que filtra por `LISTA_SECRETA`.

O usuário recebe o push, toca, e não tem para onde ir.

---

## Escopo

### Entra

- Materialização do feed do Fire Live
- Tela `/fire-live`
- Os quatro filtros da visão: todos, por time, por jogo, excluir jogadores
- Cruzamento com a OPD pré-live no card

### Não entra

- Mudar qualquer regra do motor. Alvo, modo fire, bloco de topo e green estão
  fechados, testados e homologados.
- Green fora do 1º quarto — pergunta aberta com o CJ, herdada da spec 02

---

## A diferença que mais importa

A Lista Secreta é publicada **uma vez** por dia. O Fire Live muda **a cada 20
segundos**, e some ao fim do 1º quarto de cada jogo.

Isso muda a materialização. A chave atual de `feed_snapshot` é
`(data_referencia, estrategia)` — uma linha por dia. Para o Fire Live isso
significaria reescrever a mesma linha a cada ciclo de cada jogo, com todos os
jogos misturados e disputa de escrita entre workflows simultâneos.

> **Decisão proposta:** o snapshot do Fire Live é **por jogo**.
>
> Migration: `feed_snapshot` ganha `jogo_id NULL` e a UNIQUE passa a
> `(data_referencia, estrategia, jogo_id)` com `nullsNotDistinct`, para que a
> Lista Secreta (jogo_id NULL) continue com uma linha por dia.
>
> Custo: a tela lê N linhas e junta. Ganho: cada workflow escreve só a sua, sem
> corrida entre jogos simultâneos.

`nullsNotDistinct` é o mesmo mecanismo já usado em `apitos_dedup`, pela mesma
razão: NULL precisa colidir consigo mesmo.

---

## Contrato

### Quem materializa

O **ciclo** do Fire Live, ao fim de `executarCiclo` — junto da gravação dos
apitos, na mesma passagem em que já tem os fatos na mão.

```
observa -> detecta mudança -> avalia afetados -> grava -> outbox -> MATERIALIZA
```

Materializar fora do ciclo exigiria uma segunda leitura dos mesmos dados a cada
20 segundos.

**O que a tela lê nunca é o motor.** A regra `tela-nao-chama-o-motor` do
dependency-cruiser vale aqui igual: a tela lê `feed_snapshot`, ponto. A avaliação
acontece uma vez por evento, não uma vez por usuário — é o que separa 10.000
assinantes de ser trivial ou impossível.

### Conteúdo

Reaproveita `ItemFeed`, que já carrega tudo que o Fire Live produz: `alvo1Q`,
`modoFire`, `opdOrigemNivel`. Acrescenta o que a tela ao vivo exige:

```ts
type ItemFireLive = ItemFeed & {
  jogoId: string
  adversarioSigla: string
  quartoAtual: number | null
  /** Valor no 1Q quando o apito nasceu — o card mostra progresso contra o alvo. */
  valorNoQuarto: number
}
```

### Filtros

| Filtro | Como |
| --- | --- |
| Todos | sem recorte |
| Por time | `?time=SIGLA` |
| Por jogo | `?jogo=<id>` |
| Excluir jogadores | `?excluir=id,id` |

Os três primeiros são recorte de leitura. **"Excluir jogadores" é preferência do
usuário** e precisa sobreviver ao recarregamento — a lista some e volta a cada
ciclo, e reexcluir a cada push é inaceitável.

> **Onde guardar?** Query string não sobrevive ao push. `localStorage` não
> atravessa dispositivos, mas não exige tabela nem escrita a cada toque.
> Proposta: `localStorage`, com migração para tabela se o cliente pedir que a
> exclusão acompanhe a conta. **Confirmar** — ver Perguntas.

---

## Estado vazio é a tela mais comum

O Fire Live só existe durante o 1º quarto dos jogos. Fora dessa janela — a maior
parte do dia — a tela está vazia. Ela precisa dizer **por quê**, e o motivo é
diferente em cada caso:

- Não há jogo hoje
- Há jogos, o primeiro começa às 21h30
- Jogos em andamento, nenhum no 1º quarto
- Jogos no 1º quarto, ninguém atingiu alvo ainda

O quarto caso é o único em que a tela "funcionando e vazia" é a resposta certa. Os
outros três são informação que o usuário quer.

E, como toda tela do produto, informa **o horário do dado** — usando o mesmo
componente da aba de estatísticas.

---

## Regras que isto toca

- **Fire Live é só 1º quarto**, em nenhuma hipótese além. A tela não inventa
  histórico: apito de jogo encerrado sai do feed ao vivo.
- **O % é nota de confiança, nunca probabilidade** — no Fire Live a confiança é
  `null`, e o card não deve inventar número no lugar.
- **Cruzamento OPD** — o card exibe o nível e a cor da OPD pré-live. Isso já vem
  pronto em `opdOrigemNivel`, lido da OPD **como foi publicada**.

---

## Perguntas antes de codar

1. **Excluir jogadores: por dispositivo ou por conta?** Muda ter ou não tabela.
2. **O apito sai da tela quando o 1Q acaba?** Ele não vale mais como entrada, mas
   sumir na cara do usuário que acabou de receber o push é ruim. Proposta: manter
   até o fim do jogo, marcado como encerrado. **Precisa do CJ.**
3. **Ordenação.** A Lista Secreta ordena por confiança. No Fire Live não há
   confiança — ordenar por quê? Proposta: mais recente primeiro. Do CJ.

---

## Pronto quando

- Um apito aparece na tela em até um ciclo depois de gravado
- O toque no push abre a tela no jogo certo
- Os quatro filtros funcionam e combinam entre si
- Jogador excluído não reaparece depois de recarregar
- Cada estado vazio explica o próprio motivo
- A tela informa o horário do dado
- `npm run boundaries` continua limpo — a tela não importa o motor
- Dois jogos simultâneos não sobrescrevem o snapshot um do outro

---

# Plano

### Fatia 1 · Snapshot por jogo

1. Migration: `feed_snapshot.jogo_id` + nova UNIQUE com `nullsNotDistinct`
2. Teste: a Lista Secreta continua com uma linha por dia (regressão)
3. Teste: dois jogos gravam duas linhas, sem colidir

### Fatia 2 · Materialização no ciclo

1. `entrega/fire-live/feed.ts` — monta e grava
2. Chamar de `executarCiclo`, depois do outbox
3. Teste: o replay gravado da suíte do Fire Live produz o snapshot esperado
4. Teste: replay do mesmo jogo não muda o hash

### Fatia 3 · Tela

1. `/fire-live` lendo os snapshots do dia
2. `CardEntrada` já sabe exibir alvo, modo fire e OPD — reaproveitar inteiro
3. Os quatro estados vazios
4. Rodapé de última atualização

### Fatia 4 · Filtros

1. Time e jogo por query string
2. Exclusão persistida, conforme a resposta da pergunta 1
3. Teste de combinação: time + exclusão ao mesmo tempo

### Fatia 5 · Costura com o push

`dados.jogoId` já viaja na mensagem. O `notificationclick` do service worker leva
a `/fire-live?jogo=<id>`.

---

## Riscos

**Escrita a cada 20 segundos por jogo.** Numa rodada cheia são ~8 jogos × 3
escritas/minuto. O `hash` já evita regravar quando nada muda — a mesma proteção da
Lista Secreta. Medir antes de otimizar.

**A tela vazia é a experiência dominante.** Fora da janela dos jogos, é isso que
o assinante vê. Se ela parecer defeito, o produto parece quebrado a maior parte
do tempo. É a parte desta spec que merece mais cuidado de texto, não de código.
