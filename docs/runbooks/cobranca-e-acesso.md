# Cobrança e controle de acesso

Este runbook opera a implementação da Spec 04. Ele não autoriza o rollout
comercial: preço, cadastro, carência e migração da base precisam ser
aprovados antes de ativar produção. O acesso às estatísticas já é decisão
tomada (spec de planos, §5): exige sessão como qualquer outra aba, sem flag
própria.

Um gate permanece deliberadamente fechado: usuários bloqueados
administrativamente não conseguem abrir `/conta`. Não dependa do
autoatendimento de cancelamento para essas contas até essa política ser
aprovada e implementada; nesses casos, o suporte deve confirmar o
cancelamento diretamente no provedor.

O cadastro público está ABERTO por padrão (`CADASTRO_PUBLICO_HABILITADO=true`)
— decisão do parceiro em 16/09, ciente de que não há verificação de e-mail
nem recuperação de senha por e-mail (o projeto não tem provedor de e-mail). A
flag continua existindo para fechar a porta numa emergência.

## Estado seguro inicial

```dotenv
MERCADOPAGO_SANDBOX=true
MERCADOPAGO_CHECKOUT_ENABLED=false
CADASTRO_PUBLICO_HABILITADO=false
```

Com esse estado, webhook e reconciliação podem ser homologados sem criar novos
checkouts. `/` exige sessão e um registro ativo em `direitos_acesso`. O padrão
do código para `CADASTRO_PUBLICO_HABILITADO` é `true` (plano grátis é conta —
spec de planos, §7); nesta fase declare `false` explicitamente, não conte com
o padrão.

## Contrato V1 implementado

- produto interno: `NBA_PRO`;
- assinatura sem plano associado, `preapproval` com status inicial `pending`;
- frequência mensal, moeda BRL e sem trial;
- preço, nome, e-mail e `back_url` são resolvidos no servidor;
- retorno do navegador nunca concede acesso;
- pagamento aprovado concede até `next_payment_date`;
- cancelamento preserva o período já pago;
- recusa não antecipa o vencimento;
- estorno e chargeback revogam o direito da cobrança;
- bloqueio administrativo sempre prevalece.

O adapter segue os endpoints oficiais `POST/GET/PUT /preapproval`,
`GET /preapproval/search`, `GET /authorized_payments/{id}`,
`GET /authorized_payments/search`, `GET /v1/payments/{id}`,
`POST /checkout/preferences` (criação da compra de temporada) e
`GET /v1/payments/search` (a volta dela, por `external_reference`).

## Variáveis obrigatórias para sandbox

```dotenv
MERCADOPAGO_ACCESS_TOKEN=
MERCADOPAGO_WEBHOOK_SECRET=
MERCADOPAGO_SANDBOX=true
MERCADOPAGO_PREAPPROVAL_TYPE=pending
# Preços dos quatro SKUs, em centavos (spec de planos §10). Obrigatórios quando
# MERCADOPAGO_CHECKOUT_ENABLED=true: faltando um deles a leitura LANÇA e derruba
# /assinar e o webhook. Com o checkout desligado, a falta só esconde o preço.
PLANO_MVP_MENSAL_CENTAVOS=5990
PLANO_MVP_MENSAL_DE_CENTAVOS=7990
PLANO_MVP_TEMPORADA_CENTAVOS=39700
PLANO_ALL_STAR_MENSAL_CENTAVOS=9990
PLANO_ALL_STAR_MENSAL_DE_CENTAVOS=14900
PLANO_ALL_STAR_TEMPORADA_CENTAVOS=59700
# Último dia INCLUSIVE da temporada vendida, no fuso da rodada. Passada a
# data, o seletor esconde a modalidade temporada sozinho.
TEMPORADA_FIM=2027-06-30
APP_PUBLIC_URL=https://preview.example.com
APP_ALLOWED_HOSTS=preview.example.com
CRON_SECRET=
```

Os quatro preços e `TEMPORADA_FIM` são obrigatórios quando
`MERCADOPAGO_CHECKOUT_ENABLED=true` — sem qualquer um deles a aplicação recusa o
checkout na hora de ler a configuração, em vez de vender por um valor que
ninguém decidiu.

`TEMPORADA_FIM` é o último dia INCLUSIVE da temporada vendida, no fuso da
rodada. Passada a data, o seletor esconde a modalidade de temporada sozinho e o
painel de usuários avisa 30 dias antes. **É anual: alguém precisa atualizá-lo
antes de cada temporada nova** — renovação automática foi descartada na decisão
4 da spec de planos.

O estorno de temporada é MANUAL: painel do Mercado Pago mais revogação do
direito pelo admin, com motivo. O upgrade não devolve o período restante, e a
tela de compra avisa isso antes de cobrar.

Nunca reutilize credenciais de produção no Preview. Configure no Mercado Pago
os tópicos `subscription_preapproval`, `subscription_authorized_payment` e
`payment`, apontando para `/api/webhook/mercadopago`.

## Conferir a configuração antes de qualquer coisa

```bash
npm run mp:conferir
```

Somente leitura: valida o `MERCADOPAGO_ACCESS_TOKEN` contra a API real
(`GET /users/me`), imprime a conta, o plano configurado, o estado das flags e
a URL de webhook a registrar no painel. **Não cria assinatura, não liga flag,
não escreve no banco.** Avisa quando `MERCADOPAGO_SANDBOX` e o tipo do token
não combinam — trocar credencial de teste por credencial de produção (ou o
contrário) é o erro clássico da virada.

Rode antes do passo 3 abaixo e de novo depois de trocar as credenciais para
produção. Token reprovado ou configuração de produto inválida sai com código
1: dá para usar como portão.

**A credencial nunca vai para arquivo commitado** — só `.env.local`
(gitignored) e painel da Vercel. `ACCESS_TOKEN` exposto autoriza cobranças na
conta: se vazar, rode-o no painel.

## Ordem de homologação

1. Aplicar a migration `0011_demonic_fat_cobra.sql`.
2. Manter cadastro e checkout desligados; `npm run mp:conferir` limpo.
3. Enviar webhook de teste e confirmar HMAC, consulta autenticada e evento.
4. Executar `/api/cron/reconciliar-pagamentos` com Bearer do `CRON_SECRET`.
5. Criar usuário de teste e liberar cadastro apenas no ambiente sandbox.
6. Ativar checkout no sandbox para a allowlist/equipe.
7. Executar: cadastro → checkout → retorno pendente → webhook → `/`.
8. Repetir com duplicata, perda do webhook, recusa, cancelamento e estorno.
9. Conferir que logs e `eventos_pagamento.carga_json` não contêm e-mail,
   endpoint Push, cartão, token ou segredo.

## Evidências mínimas

- uma única `tentativas_checkout` para duas chamadas concorrentes;
- `eventos_pagamento` idempotente e no mesmo commit do efeito;
- `authorized` sem cobrança aprovada não cria `direitos_acesso`;
- evento antigo não regride assinatura/cobrança;
- visitante e conta sem direito não leem `/` nem recebem Push;
- cancelamento confirmado no provedor antes da atualização local;
- reconciliação recupera um timeout ambíguo pela referência opaca.

## Rollout

1. Aprovar as dez decisões bloqueantes da Spec 04.
2. Backfill explícito de cortesia/direito para a base existente; não inferir de
   `usuarios.status`.
3. Rodar leitura do novo direito em sombra e comparar divergências.
4. Ativar webhook e reconciliação em produção, ainda sem checkout.
5. Liberar equipe e piloto pequeno.
6. Ativar cadastro/checkout e, por último, Push público.

## Rollback

Desative `MERCADOPAGO_CHECKOUT_ENABLED` e
`CADASTRO_PUBLICO_HABILITADO`. Mantenha webhook e reconciliação ativos para não
perder cancelamentos, estornos ou pagamentos em voo. Não reverta a migration e
não volte a interpretar `usuarios.status` como direito comercial.

## Referências oficiais

- [Criar assinatura](https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/create-preapproval/post)
- [Buscar assinaturas](https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/search-preapproval/get)
- [Gerenciar e cancelar](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/subscription-management)
- [Webhooks de assinaturas](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/additional-content/your-integrations/notifications/webhooks)
