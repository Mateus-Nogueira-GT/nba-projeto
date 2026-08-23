# Spec 02 — Web Push ponta a ponta

**Estado:** implementada localmente; rollout público bloqueado pelas Specs 03, 04 e 05 · 21/08/2026

**Depende de:** [Spec 00](00-estabilizacao.md), [Spec 01](01-ingestao-persistente.md)
e fundação da [Spec 03](03-pwa.md)

**Destrava:** entrega em tempo real do Fire Live

**Rollout público depende também de:** Specs 04 e 05

---

## Objetivo

Transformar eventos já enfileirados em notificações Web Push reais, com inscrição
autenticada, preferências, fan-out escalável, retries e descarte de alertas
vencidos. O transporte tem semântica **at-least-once**; não promete exatamente
uma entrega.

Antes desta execução, o produtor e a fila existiam, mas `/api/fila/push` apenas
resolvia usuários e registrava contagem; não havia inscrição, VAPID, envio real
nem configuração do consumer da fila.

> Implementação: o contrato V1, APIs, dois consumers, adapter VAPID, revogação,
> preferências e handlers do worker foram entregues. A certificação em aparelhos
> reais e os ícones/manifest dependem da Spec 03; o público continua fail-closed.

---

## Divisão com a Spec 03

Existe um único service worker:

- a Spec 03 é dona do manifest, registro, atualização, cache e instalação;
- esta spec é dona dos handlers `push`/`notificationclick`, inscrição, envio e
  preferências;
- alterações no worker são entregues e revisadas juntas;
- o E2E no iPhone só fecha quando ambas estiverem integradas.

`formato` e `posição` pertencem ao feed do app. O SO controla o layout da
notificação; Web Push diferencia título, corpo, ícone, `tag` e deep link.

---

## Contrato do evento

O consumidor valida uma versão fechada do payload:

```ts
type MensagemPushV1 = {
  versao: 1
  chave: string
  canal: 'FIRE_LIVE_APITO' | 'GREEN' | 'LISTA_SECRETA'
  titulo: string
  corpo: string
  url: string
  ocorridoEm: string
  expiraEm: string
  dados: DadosApito | DadosGreen | DadosLista
}
```

Regras:

- `url` é caminho relativo de uma allowlist; nunca URL externa ou `javascript:`;
- Fire Live vencido é descartado antes do fan-out e novamente no worker;
- `tag = chave` reduz duplicata visível em retry, sem garantir exactly-once;
- `lang`, ícone e badge são locais;
- payload inválido gera erro observável e não executa navegação arbitrária;
- o clique foca/navega uma janela existente ou abre o deep link;
- até a Spec 05, o deep link temporário é `/`; produção usa `/fire-live`.

---

## Inscrição e preferências

### API autenticada

| Método | Rota | Contrato |
| --- | --- | --- |
| POST | `/api/push/inscricoes` | valida subscription e faz upsert idempotente |
| DELETE | `/api/push/inscricoes` | remove vínculo do dispositivo atual |
| GET | `/api/push/preferencias` | retorna defaults explícitos por canal |
| PATCH | `/api/push/preferencias` | valida enum fechado e faz upsert |

Todas exigem sessão, Zod e limite de payload. `usuarioId` e `dispositivoId` vêm da
sessão, nunca do corpo. Endpoint e chaves não entram em logs.

`push_inscricoes` ganha timestamps de criação/atualização, expiração e
invalidação. Novas inscrições exigem dispositivo. O endpoint continua único e
pode ser reassociado de forma auditável ao usuário que autenticar no navegador.

No logout, remove-se o vínculo do servidor; não é obrigatório cancelar a
`PushSubscription` do navegador. Expulsar ou bloquear dispositivo remove todas
as inscrições dele na mesma operação.

A permissão só é pedida após gesto e contexto de valor. Estado negado não dispara
novas solicitações; a UI explica como reativar nas configurações. No iOS, o fluxo
de instalação da Spec 03 vem antes da solicitação.

---

## Elegibilidade no momento do envio

O fan-out consulta inscrições, não apenas IDs de usuários. Em cada lote revalida:

1. usuário e sessão/dispositivo não bloqueados;
2. preferência do canal;
3. validade do evento;
4. direito comercial ativo da Spec 04.

Antes da Spec 04, `PUSH_ENABLED` permanece desligado para público; uma allowlist
interna permite homologação sem vazar conteúdo pago.

---

## Fan-out e Vercel Queue

Vercel Queue entrega ao menos uma vez. O consumer deve ser registrado em
`vercel.ts` com trigger de queue e usar `handleCallback`; sucesso confirma a
mensagem e exceção permite retry.

O fluxo usa dois tópicos:

```text
push-eventos
  -> consumer de expansão por cursor
  -> push-entregas (lotes delimitados)
  -> consumer de envio com concorrência limitada
```

A paginação é keyset por `(criadoEm, id)` e captura um limite superior no começo.
Inscrições criadas depois não recebem evento antigo. Cada continuação possui
chave determinística; reentrega continua possível e é parte do contrato.

O tamanho do lote, paralelismo, timeout de visibilidade e backoff são configuração
operacional medida, não números escondidos no handler. O SDK pode estender a
visibilidade durante processamento; handlers continuam curtos e retomáveis.

Tratamento de resposta:

| Resultado | Ação |
| --- | --- |
| `2xx` | sucesso |
| `404/410` | invalidar/remover inscrição |
| `429` | retry respeitando `Retry-After` |
| rede/`5xx` | retry com backoff e jitter |
| `401/403` | parar lote e alertar erro global de VAPID |
| outro `4xx` | erro permanente da mensagem; não apagar inscrição |

---

## Porta de envio e configuração

```ts
interface PortaEnvioPush {
  enviar(
    inscricao: InscricaoPush,
    mensagem: MensagemPushV1,
  ): Promise<ResultadoEnvioPush>
}
```

Há adapter fake para todos os resultados e adapter Web Push real. Variáveis:

```dotenv
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=
PUSH_ENABLED=false
```

As chaves são estáveis por ambiente. Ausência de configuração torna inscrição
indisponível e o envio falha fechado. Rotacionar chave pública exige renovação de
inscrições e plano explícito.

---

## Observabilidade e privacidade

Métricas mínimas: atraso da fila, eventos expirados, lotes, tentativas, `2xx`,
`404/410`, `429`, `5xx`, erro VAPID e duração. Logs usam IDs opacos e chave do
evento; endpoint, `p256dh`, `auth` e segredo VAPID nunca são registrados.

Alertas vencidos não são reenviados ao religar o sistema. O endpoint é dado do
dispositivo e deve respeitar a política de retenção da conta.

---

## Harness de validação

### Automatizado

1. schema, expiração e allowlist de deep link;
2. adapter fake cobrindo `2xx`, `404`, `410`, `429`, `5xx`, timeout e VAPID;
3. inscrição idempotente, reassociação, preferências e revogação de dispositivo;
4. rotas rejeitando sessão ausente e IDs fornecidos pelo cliente;
5. paginação de 10 mil inscrições com cursor estável;
6. falha no meio do lote e retry sem perda, aceitando duplicata at-least-once;
7. elegibilidade reavaliada por lote;
8. worker com push válido, expirado/inválido, `tag` e clique seguro;
9. consumer realmente registrado no config da Vercel;
10. endpoint e chaves ausentes de logs.

### Aparelhos reais

- iPhone/iPad no menor iOS suportado e no atual;
- Chrome Android, Chrome desktop e Safari macOS;
- foreground, background e app encerrado;
- permissão aceita, negada e revogada;
- endpoint morto, toque no deep link e atualização do worker.

### Pronto quando

- inscrição/preferência funcionam por dispositivo/conta;
- apito válido chega a um aparelho permitido dentro do SLO definido;
- evento vencido nunca aparece;
- endpoint morto deixa o fan-out;
- 10 mil inscrições completam sem timeout monolítico;
- retries não perdem evento e duplicata está documentada/colapsada por `tag`;
- usuário sem direito ativo não recebe conteúdo pago;
- iOS real fecha o fluxo em conjunto com a Spec 03.

---

# Plano integrado

### Fatia 1 — Contrato e migration

Fechar `MensagemPushV1`, timestamps das inscrições, preferências e porta fake.

### Fatia 2 — API de inscrição

Implementar rotas autenticadas, vínculo com dispositivo, defaults e revogação.

### Fatia 3 — Fan-out durável

Adicionar os dois tópicos, triggers, paginação keyset, expiração, retries e
métricas. Validar 10 mil inscrições no harness.

### Fatia 4 — Adapter real

Adicionar VAPID, envio real e classificação de resposta, inicialmente desligado.

### Fatia 5 — Worker compartilhado

Integrar handlers ao worker da Spec 03 e validar atualização compatível.

### Fatia 6 — Rollout

Preview → allowlist interna → canary iOS/Android → ativação gradual após Specs 04
e 05. Rollback desliga inscrição/envio e publica worker corretivo ou no-op; não
se remove simplesmente um worker já instalado.

---

## Decisões pendentes

1. conta responsável pelas chaves VAPID;
2. SLO de entrega e validade de cada canal;
3. tamanho/paralelismo após teste de carga;
4. conteúdo final e ícones por canal;
5. retenção de inscrições invalidadas para auditoria.

Referências: [Vercel Queues](https://vercel.com/docs/queues/concepts),
[Push API](https://www.w3.org/TR/push-api/) e
[Web Push no iOS/iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).
