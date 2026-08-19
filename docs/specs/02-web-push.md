# Spec 02 — Web Push ponta a ponta

**Estado:** proposta · 19/08/2026
**Depende de:** spec 01 (sem dado não há o que notificar) · compartilha o service
worker com a spec 03
**Destrava:** o Fire Live. Sem push, ele não entrega o que promete.

---

## Problema

A deduplicação está pronta e provada por mutação — três barreiras independentes:
UNIQUE em `apitos`/`greens`, o outbox `push_enfileirado_em`, e a `idempotencyKey`
da fila. O ciclo enfileira o evento certo, uma vez só.

**E ninguém entrega.** O consumidor em `/api/fila/push` resolve os destinatários
e escreve no log:

```ts
console.info('[push] %s -> %d destinatários', mensagem.chave, destinatarios.length)
```

Duas tabelas seguem vazias: `push_inscricoes` (não há de onde vir) e
`preferencias_notificacao` (a leitura respeita, nada escreve).

O ADR-0003 é explícito: **o push notification é o canal de tempo real do
produto.** Não há WebSocket por decisão de custo. Sem push, o usuário só vê o
apito se estiver com o app aberto — e a janela de aposta do Fire Live é curta.

---

## Escopo

### Entra

- Service worker que recebe e renderiza a notificação
- Chaves VAPID e envio real no consumidor da fila
- Tela de permissão e gravação em `push_inscricoes`
- Tela de preferências por canal
- Baixa de inscrição morta (410/404 do serviço de push)

### Não entra

- Manifest, ícones e instalação do PWA (spec 03) — mas o **arquivo** do service
  worker é o mesmo; ver "Costura com a spec 03"
- Push de Lista Secreta agendado: o canal `LISTA_SECRETA` já existe no enum e no
  ruleset, mas quem o dispara é o job diário, e isso é fatia à parte

---

## Contrato

### O evento que já existe

`MensagemPush` está fechada e testada. O consumidor recebe **um evento**, nunca
uma mensagem por usuário — o fan-out acontece do lado dele. Isso é o que segura
10.000 assinantes (docs/01-arquitetura.md).

```ts
type MensagemPush = {
  chave: string          // dedup ponta a ponta
  canal: CanalPush       // FIRE_LIVE_APITO | GREEN | LISTA_SECRETA
  formato: FormatoPush   // CARD_APITO | FAIXA_GREEN
  posicao: PosicaoTela   // TOPO | RODAPE
  titulo: string
  corpo: string
  dados: Record<string, unknown>
}
```

Apito e green têm formato **e** posição distintos, com teste travando a diferença.
Os valores concretos de posição ainda não estão em `docs/04-design-system.md` —
ver "Perguntas".

### O que falta gravar

```
push_inscricoes(usuario_id, dispositivo_id, endpoint, chave_p256dh, chave_auth)
  UNIQUE(endpoint)  ← já existe no schema
```

A inscrição amarra ao **dispositivo**, não só ao usuário. A conta tem limite de 2
dispositivos ativos e o 3º encerra a sessão mais antiga; a inscrição de um
dispositivo desligado precisa morrer junto.

### Envio

```ts
interface PortaEnvioPush {
  enviar(inscricao: Inscricao, mensagem: MensagemPush): Promise<ResultadoEnvio>
}
type ResultadoEnvio = { ok: true } | { ok: false; morta: boolean; erro: string }
```

Porta, como a de pagamento e a de fila. Adapter real com `web-push`; adapter em
memória para o teste contar entregas.

**`morta: true`** quando o serviço devolve 404 ou 410 — a inscrição não existe
mais e a linha tem que sair da tabela. Sem isso, `push_inscricoes` acumula
endpoints mortos e o fan-out fica mais caro a cada mês.

---

## Fan-out sem derrubar a função

10.000 assinantes × 1 evento = 10.000 requisições HTTP ao serviço de push.

Isso **não cabe** numa invocação. O consumidor precisa paginar: lê inscrições em
lotes, envia em paralelo limitado, e reenfileira a continuação quando o lote
acaba. A `idempotencyKey` já cobre a repetição de um lote reprocessado.

```
evento chega -> lote de N inscrições -> envia -> sobrou? reenfileira com cursor
```

O tamanho do lote e o paralelismo são operacionais, não estratégicos — mas são
números. Pela regra 1, vão para o ruleset numa seção marcada como operação,
seguindo o precedente de `fire_live.observacao`.

---

## Regras que isto toca

- **Regra 5 (idempotência)** — o reenvio de um lote é caminho esperado. A chave da
  mensagem é a mesma do apito; o serviço de push não deduplica, então o
  **usuário pode receber duas vezes** se um lote for reprocessado. Ver "Riscos".
- **ADR-0003** — o push é o canal de tempo real; latência importa mais que
  completude. Melhor entregar a 9.900 rápido e reenfileirar 100 do que segurar
  tudo.
- **Privacidade** — endpoint e chaves de push são dados do dispositivo do
  assinante. Não vão para log nem para telemetria.

---

## Perguntas antes de codar

1. **As chaves VAPID são de quem?** Assim como a conta do Mercado Pago, o par
   VAPID identifica o remetente. Se for do cliente, entra em `vercel env` como as
   credenciais de pagamento e nunca no código.
2. **Posição de tela do apito e do green.** Hoje `APRESENTACAO` fixa TOPO e RODAPÉ
   por escolha minha, com o teste travando apenas que **diferem**. Precisa entrar
   em `docs/04-design-system.md` com o CJ.
3. **Push de green fora do 1º quarto.** O workflow encerra no 1Q por
   especificação. Um jogador que bate 30 pontos no 3º quarto **não gera green
   hoje**. Isso exige um observador que ninguém definiu — decisão do CJ, não minha.

---

## Pronto quando

- Um assinante permite notificação e a linha aparece em `push_inscricoes`
- Um apito do Fire Live chega ao celular com o formato de apito
- Um green chega com formato **e** posição diferentes do apito
- Quem desligou `FIRE_LIVE_APITO` não recebe apito e **continua recebendo** green
- Endpoint revogado é removido na primeira tentativa que devolve 410
- Fan-out de 10.000 inscrições completa sem estourar o tempo da função
- Reprocessar o mesmo evento não grava inscrição duplicada nem estoura

---

# Plano

### Fatia 1 · Porta e adapter fake

1. `entrega/push/porta.ts` — `PortaEnvioPush`, `Inscricao`, `ResultadoEnvio`
2. `entrega/push/memoria.ts` — conta entregas, simula endpoint morto
3. Teste: um evento com 3 inscrições produz 3 entregas; a morta some da tabela

Sem rede ainda. É o que torna o resto verificável.

### Fatia 2 · Fan-out paginado

1. `entrega/push/fanout.ts` — lê em lotes, envia, devolve cursor
2. Parâmetros de lote no ruleset, seção operacional
3. Teste com 10.000 inscrições em memória: completa e não repete nenhuma

### Fatia 3 · Service worker

1. `public/sw.js` — `push` e `notificationclick`
2. Renderiza conforme `formato`; o clique leva à rota de `dados.jogoId`
3. **Costura com a spec 03:** este é o mesmo arquivo que o PWA registra. Fazer
   agora e a spec 03 só acrescenta cache e instalação.

### Fatia 4 · Inscrição e preferências

1. `entrega/push/inscrever.ts` — grava, amarra ao dispositivo, remove na saída
2. Tela de permissão: pede no momento certo, nunca no primeiro carregamento
3. Tela de preferências, um interruptor por canal do ruleset
4. Encerrar sessão de dispositivo remove a inscrição dele

### Fatia 5 · Adapter real

1. `web-push` com VAPID do ambiente
2. Sem chave configurada, o consumidor responde 503 — mesmo padrão do webhook do
   Mercado Pago, que não finge ter processado
3. Mapear 404/410 para `morta: true`

---

## Riscos

**Duplicata no celular é possível, apesar das três barreiras.** Elas garantem um
*evento* por apito; se a função cair no meio de um lote, o reprocessamento
reenvia para quem já recebeu. Mitigação: `tag` na notificação, que faz o próprio
navegador colapsar duplicatas. Não é garantia, é redução — e vale registrar em
ADR, porque contraria a promessa de "nunca duas vezes".

**Permissão negada é definitiva.** O navegador não deixa pedir de novo. Pedir no
carregamento queima a única chance com quem ainda não entendeu o produto. Pedir
depois do primeiro apito visto converte muito mais.

**iOS exige o app instalado.** Safari só entrega Web Push para PWA adicionado à
tela inicial. Isso amarra esta spec à 03 mais forte do que parece: **no iPhone,
sem instalação não há push.**
