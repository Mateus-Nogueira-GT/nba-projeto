# Spec 04 — Cobrança e controle de acesso

**Estado:** pronta para decisão de negócio · 21/08/2026

**Depende de:** [Spec 00](00-estabilizacao.md), [Spec 01](01-ingestao-persistente.md)
e política de cache da [Spec 03](03-pwa.md)

**Integra com:** elegibilidade de Push da [Spec 02](02-web-push.md)

**Destrava:** contratação self-service e receita

---

## Objetivo

Permitir cadastro, contratação no checkout hospedado do Mercado Pago, acesso
somente após confirmação confiável, consulta da assinatura e cancelamento sem
intervenção. O mesmo serviço de autorização protege pages, APIs, server actions,
filas e Push.

Esta spec não considera o webhook atual pronto. A Spec 00 corrige consulta do
recurso oficial, assinatura HMAC, atomicidade, logout e a mistura entre bloqueio
administrativo e pagamento.

---

## Princípios

1. retorno do checkout nunca comprova pagamento;
2. cartão e dados sensíveis ficam no Mercado Pago;
3. plano, preço, e-mail e URLs são derivados no servidor;
4. bloqueio administrativo e direito comercial são independentes;
5. webhook e reconciliação produzem o mesmo efeito idempotente;
6. eventos fora de ordem não regridem estado;
7. conteúdo pago não entra no cache offline do v0;
8. criação ambígua é reconciliada antes de novo POST.

---

## Modelo de domínio

Uma fonte de verdade por pergunta:

- `usuarios.status`: somente bloqueio administrativo/segurança;
- `assinaturas`: espelho do contrato de cobrança;
- `cobrancas`: pagamentos, recusas, estornos e chargebacks;
- `direitos_acesso`: fonte consultada pelo portão;
- `eventos_pagamento`: trilha idempotente do webhook;
- `tentativas_checkout`: coordenação da criação externa.

Direitos possuem produto, origem (`ASSINATURA`, `CORTESIA`, `MANUAL`), início,
validade e referência. Pagamento nunca altera `usuarios.status`. Assinatura e
cobrança são estados diferentes: preapproval `authorized` não significa, por si
só, pagamento aprovado.

```ts
type ResultadoAcesso =
  | { permitido: true; sessao: Sessao; direitoId: string }
  | {
      permitido: false
      motivo: 'sem-sessao' | 'bloqueio-administrativo' | 'sem-direito-ativo'
    }
```

---

## Cobertura de autorização

| Superfície | Regra |
| --- | --- |
| `/entrar`, cadastro, retorno e webhook | pública conforme função; input validado |
| `/assinar` | sessão válida; não exige direito ativo |
| `/conta` | sessão válida, inclusive para inadimplente cancelar |
| `/` e `/fire-live` | direito ativo |
| `/estatisticas/*` | decisão comercial pendente |
| `/admin/*` | autorização administrativa independente |
| APIs/actions pagas | mesmo portão, ownership e validação |
| consumidor Push | revalida direito em cada lote |

Proteger apenas pages não basta. Um teste de varredura inventaria pages, Route
Handlers, server actions, loaders e consumers que entregam conteúdo pago.

---

## Cadastro e contratação

O CTA precisa terminar em identidade autenticada. A entrega inclui cadastro
self-service ou documenta outro fluxo aprovado; criação manual pelo admin não é
contratação self-service.

```text
CTA → entrar/cadastrar → criar tentativa local → criar/recuperar preapproval
→ checkout hospedado → retorno “processando”
→ webhook ou reconciliação → assinatura/cobrança/direito → acesso
```

Idempotência:

- uma tentativa aberta por `(usuario, produto)`;
- UUID opaco de `external_reference` persistido antes da rede;
- plano, payer email e back URL resolvidos no servidor;
- idempotency key externa quando suportada;
- concorrência coordenada por constraint/lock;
- após timeout, buscar pela referência antes de criar novamente;
- ID externo e `init_point` são persistidos sem confiar no navegador.

O retorno mostra `processando`, `ativo` ou erro reconciliável. Query string nunca
concede acesso.

---

## Porta de cobrança

```ts
interface PortaCobranca {
  criarAssinatura(entrada: CriarAssinatura): Promise<CheckoutCriado>
  consultarAssinatura(id: string): Promise<AssinaturaExterna>
  buscarPorReferencia(referencia: string): Promise<AssinaturaExterna | null>
  cancelarAssinatura(id: string): Promise<AssinaturaExterna>
  validarAviso(aviso: AvisoHttp): AvisoValidado
  consultarRecursoDoAviso(aviso: AvisoValidado): Promise<RecursoCobranca>
}
```

Há adapter fake completo e adapter real. A validação usa headers e `data.id` da
query conforme o contrato oficial; o payload mínimo é um aviso para consultar o
recurso autenticado. Tópicos de assinatura e cobrança têm fixtures distintas.

---

## Webhook e reconciliação

1. capturar query, headers e corpo bruto;
2. validar assinatura e tolerância temporal;
3. consultar o recurso oficial com access token;
4. correlacionar por referência opaca/ID externo;
5. numa transação, registrar evento, atualizar assinatura/cobrança e recalcular
   direito;
6. confirmar sucesso somente após commit.

Duplicata não reaplica efeito. Falha faz rollback para o retry concluir. Eventos
fora de ordem não regridem estado ou validade.

Reconciliação é obrigatória: cron fail-closed consulta tentativas ambíguas,
pendentes recentes e assinaturas sem evento dentro do SLO. Usa a mesma função de
aplicação do webhook e registra divergências.

---

## Cancelamento e conta

`/conta` exibe plano, estado, validade, próxima cobrança, dispositivos e
preferências. Cancelar exige sessão recente, ownership e proteção contra CSRF.
Somente resposta externa confirmada ou reconciliação altera o estado local.
Retry é idempotente; falha externa não mostra “cancelado”. A política define se
o direito termina imediatamente ou no fim do período pago.

---

## Segurança

- allowlist de hosts para URLs por ambiente;
- rate limit em cadastro, criação e cancelamento;
- nenhum token/payload sensível em log;
- preço e produto nunca vêm de FormData;
- ownership em operações por ID;
- sem redirect arbitrário;
- conteúdo pago com `no-store` e fora do service worker;
- logout/cancelamento limpam cache privado legado.

---

## Harness de validação

### Automatizado

1. tabela de verdade: sessão × bloqueio × direito × validade;
2. pagamento aprovado não remove bloqueio administrativo;
3. direito vencido bloqueia page, API, action e Push;
4. aviso oficial mínimo consulta o recurso antes do efeito;
5. HMAC válida usa `data.id` da query; adulteração falha;
6. `authorized` da assinatura não vira pagamento aprovado;
7. duplicata aplica efeito uma vez;
8. falha entre evento e direito faz rollback e retry conclui;
9. eventos fora de ordem não regridem estado;
10. dois checkouts concorrentes geram uma tentativa externa;
11. timeout após criação busca por referência antes de repetir;
12. adulteração de plano/e-mail/retorno é ignorada ou recusada;
13. retorno forjado não libera acesso;
14. cancelamento alheio é recusado e repetição é idempotente;
15. falha externa não conclui cancelamento local;
16. varredura cobre todas as superfícies pagas;
17. Cache Storage não contém resposta paga.

### Smoke sandbox

Criar conta → checkout → retorno pendente → webhook → direito ativo → acesso e
Push → cancelamento → reconciliação. Repetir com cobrança recusada, webhook
duplicado, webhook perdido e estorno conforme a política definida.

### Pronto quando

- visitante não lê conteúdo pago;
- cadastro e checkout funcionam sem intervenção;
- acesso só nasce de webhook/reconciliação confirmados;
- bloqueio administrativo prevalece sem alterar cobrança;
- concorrência e timeout não duplicam assinatura;
- cancelamento é confirmado e auditável;
- usuário sem direito não recebe Push;
- nenhuma rota manipula cartão ou confia em retorno do navegador.

---

# Plano

### Fatia 0 — Decisões de negócio

Fechar plano, cadastro, estatísticas, carência, cancelamento, estorno, cortesia,
migração da base e domínios. São gates de produto.

### Fatia 1 — Modelo e autorização

Migration aditiva para tentativas, estados financeiros e direitos. Implementar o
portão e tabela de verdade, inicialmente em shadow mode.

### Fatia 2 — Porta e fake

Fechar operações da porta, erros e adapter fake. Testar criação, consulta,
cancelamento, webhook e reconciliação sem rede.

### Fatia 3 — Cadastro e checkout

Implementar identidade self-service, tentativa idempotente, CTA, retorno
processando e proteção contra concorrência/adulteração.

### Fatia 4 — Integração real

Concluir correções da Spec 00, implementar consulta/criação/cancelamento reais,
fixtures oficiais, webhook transacional e cron de reconciliação.

### Fatia 5 — Conta e cobertura

Criar `/conta`, cancelamento, estados de erro/loading e aplicar o portão em pages,
APIs, actions e Push. Confirmar política `no-store` da PWA.

### Fatia 6 — Rollout

Backfill da base → dual-read em sombra → sandbox → webhook/reconciliação em
produção sem checkout → equipe → piloto → paywall gradual.

Rollback desliga novos checkouts, mantém webhook/reconciliação e não volta a
usar `usuarios.status` como assinatura. Em incerteza de autorização, falha
fechado ou exibe manutenção; migrations permanecem aditivas.

---

## Decisões bloqueantes

1. plano: nome, preço BRL, frequência, trial e tipo de preapproval;
2. cadastro self-service e verificação de e-mail;
3. estatísticas públicas ou pagas;
4. carência e retries após recusa;
5. cancelamento imediato ou fim do período;
6. política para estorno e chargeback;
7. acesso de admin, cortesia e concessão manual;
8. migração dos usuários atuais;
9. acesso restrito à conta sob bloqueio administrativo;
10. domínios permitidos por ambiente.

Referências oficiais: [Webhooks de assinaturas](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/additional-content/your-integrations/notifications/webhooks),
[criação de preapproval](https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/create-preapproval/post)
e [gerenciamento/cancelamento](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/subscription-management).
