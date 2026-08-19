# Spec 04 — Paywall e contratação

**Estado:** proposta · 19/08/2026
**Depende de:** spec 01 (não adianta cobrar por feed vazio) · decisão conjunta
com a spec 03 sobre cache offline
**Destrava:** receita

---

## Problema

O webhook do Mercado Pago está pronto: valida assinatura HMAC, é idempotente por
`(provedor, evento_externo_id)`, libera usuário bloqueado quando o pagamento é
aprovado, e responde 503 sem credencial em vez de fingir que processou.

**Ele reage a um pagamento que ninguém consegue iniciar.** Não existe nada que
crie a `preapproval` no Mercado Pago — o `PortaPagamento` só sabe interpretar
notificação, não abrir cobrança.

E o feed está **aberto**: nenhuma tela de `src/app/(app)` confere sessão ou
assinatura. Quem souber a URL lê a Lista Secreta inteira sem pagar.

---

## Escopo

### Entra

- Criação de assinatura (checkout / `preapproval`)
- Portão de acesso no app do assinante
- Tela de conta: situação, dispositivos, cancelamento
- Tratamento de inadimplência

### Não entra

- **Qualquer movimentação relacionada a aposta.** ADR-0004: somente leitura de
  odds, sem envio de aposta, sem credencial de casa, sem conta vinculada a casa.
  Esta spec cobra assinatura do produto — e nada mais.
- Emissão de nota fiscal: fora do v0 por decisão explícita da visão
- Abertura da conta Mercado Pago: é do cliente

---

## Contrato

### A porta cresce

`PortaPagamento` hoje só interpreta notificação. Precisa de um método:

```ts
criarAssinatura(dados: {
  usuarioId: string
  plano: string
  emailPagador: string
  urlRetorno: string
}): Promise<{ assinaturaExternaId: string; urlCheckout: string }>
```

O adapter fake devolve uma URL falsa e um id determinístico — é o que permite
testar o fluxo inteiro sem tocar no Mercado Pago.

### O portão

O modelo de acesso **já existe e é simples**: `usuarios.status` é ATIVO ou
BLOQUEADO, e o webhook o alterna. O portão não precisa reinterpretar a assinatura
a cada requisição.

```ts
// entrega/acesso.ts
type Acesso =
  | { permitido: true; sessao: Sessao }
  | { permitido: false; motivo: 'sem-sessao' | 'bloqueado' | 'sem-assinatura' }

async function exigirAssinante(): Promise<Acesso>
```

> **Uma fonte de verdade.** Se o portão consultasse `assinaturas.status` direto,
> passariam a existir dois lugares decidindo quem entra — e eles divergiriam no
> primeiro webhook perdido. O webhook decide e escreve em `usuarios.status`; o
> portão só lê.

### Onde o portão entra

| Rota | Portão | Por quê |
| --- | --- | --- |
| `/` (Lista Secreta) | **sim** | é o produto |
| `/estatisticas/*` | **decidir** — ver Perguntas | dado público em toda parte |
| `/entrar` | não | é a porta |
| `/conta` | sessão, sem assinatura | cancelar não pode exigir estar em dia |

Cada page confere por conta própria, como o painel admin. **Não** existe
middleware para isso, pelo mesmo motivo do painel: no App Router a server action
é endpoint direto, e proteger só a rota deixa a ação aberta. Foi exatamente assim
que `/admin/mapeamento` ficou exposto.

### Tela de conta

- Situação da assinatura e próxima cobrança (`situacaoDaAssinatura` já existe)
- Dispositivos ativos, com encerrar sessão — o limite de 2 já é implementado
- Preferências de notificação (spec 02)
- Cancelamento

---

## Regras que isto toca

- **ADR-0004 (odds somente leitura)** — o limite é rígido. Assinatura é do
  produto; nenhuma tabela, rota ou campo de aposta é criado.
- **Prompt/segurança** — o sistema **nunca** manipula dado de cartão. O checkout
  do Mercado Pago é hospedado por eles; o app redireciona e recebe o webhook.
  Nenhum número de cartão atravessa a aplicação.
- **Regra 5** — o webhook já é idempotente. A criação de assinatura também precisa
  ser: dois cliques no botão não podem gerar duas cobranças.

---

## Perguntas antes de codar

1. **As estatísticas são pagas?** É a pergunta comercial mais importante desta
   spec. A aba é a única parte do produto com valor para quem não assina, e
   costuma ser o que traz gente para dentro. Aberta = isca; fechada = mais
   conversão imediata. **Decisão do cliente, não minha.**
2. **Qual é o plano?** Nome, preço, periodicidade e teste grátis não estão em
   documento nenhum.
3. **O que acontece no atraso?** Bloqueia no dia? Tem carência? O webhook já sabe
   bloquear; falta a política.
4. **Cancelamento vale quando?** Fim do ciclo pago ou imediato?

Sem 2, 3 e 4 a spec não sai do papel — são valores de negócio, e inventá-los seria
violar a regra 3 no lugar mais caro possível.

---

## Pronto quando

- Um visitante sem sessão em `/` vê convite de assinatura, não a lista
- Assinar leva ao checkout do Mercado Pago e volta com acesso liberado
- O webhook de aprovação libera o acesso sem intervenção
- Dois cliques no botão de assinar geram **uma** cobrança
- Cancelar reflete na tela de conta
- Bloqueio pelo painel derruba o acesso na requisição seguinte — já é assim, e o
  teste precisa continuar valendo
- Nenhuma rota nova toca dado de cartão

---

# Plano

### Fatia 0 · Respostas do cliente

Bloqueante. Perguntas 2, 3 e 4.

### Fatia 1 · Portão

1. `entrega/acesso.ts` com `exigirAssinante`
2. Aplicar em `/`
3. Testes: sem sessão, bloqueado, ativo
4. **Teste de varredura**, no molde do que hoje protege o painel: toda page de
   `(app)` que não seja pública chama o portão. É o que impede a próxima tela de
   nascer aberta.

### Fatia 2 · Contratação

1. `criarAssinatura` na porta + fake
2. Fluxo de checkout e retorno
3. Idempotência: reusar a `preapproval` pendente do usuário em vez de criar outra

### Fatia 3 · Tela de conta

Situação, dispositivos, preferências, cancelamento.

### Fatia 4 · Adapter real

1. `criarAssinatura` no `PagamentoMercadoPago`
2. Sem credencial, 503 — mesmo padrão do webhook
3. O teste de "nenhuma credencial em arquivo versionado" já cobre a chave nova

---

## Riscos

**Webhook perdido deixa quem pagou do lado de fora.** O Mercado Pago reenvia, e o
endpoint é idempotente, mas a janela existe. Mitigação: um job de reconciliação
que consulta as assinaturas pendentes — fatia própria, não obrigatória no primeiro
corte.

**Cache offline e paywall se contradizem.** A spec 03 quer o feed disponível sem
rede; esta quer o feed fechado. Um assinante que cancela mantém no cache o que já
baixou. Resolver explicitamente: não cachear conteúdo de assinante fora do shell.

**Bloquear no primeiro dia de atraso queima confiança** numa base pequena.
Decisão comercial, com consequência técnica mínima — mas precisa ser tomada antes,
não depois do primeiro caso.
