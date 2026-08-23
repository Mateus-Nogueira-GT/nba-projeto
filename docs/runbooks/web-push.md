# Runbook — Web Push

## Estado de rollout

O transporte está implementado, mas o rollout público permanece bloqueado até
as Specs 04 e 05. Enquanto isso, `PUSH_ENABLED=false` e somente contas listadas
em `PUSH_INTERNAL_ALLOWLIST` podem se inscrever ou receber eventos.

## Configuração

1. Gere um único par VAPID por ambiente com `npx web-push generate-vapid-keys`.
2. Grave as variáveis pelo gerenciador de ambiente da Vercel. Não coloque
   valores reais em `.env.example`, logs, issues ou commits.
3. Use `VAPID_SUBJECT=mailto:...` com uma caixa monitorada.
4. Mantenha a chave pública estável. Uma rotação exige renovar as inscrições.
5. Ajuste lote, concorrência e retry somente depois de observar duração,
   atrasos e respostas do push service.

Variáveis obrigatórias para homologação:

- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`
- `PUSH_ENABLED=false`
- `PUSH_INTERNAL_ALLOWLIST=<uuid-ou-email>`

## Deploy e smoke

1. Aplique as migrations antes do deploy da aplicação.
2. Confirme no build que os triggers `push-eventos` e `push-entregas` foram
   aceitos pela Vercel.
3. Em preview HTTPS, entre com uma conta da allowlist e ative os alertas por
   gesto explícito.
4. Gere um evento Fire Live controlado e confirme os logs estruturados dos dois
   consumers sem endpoint, `p256dh`, `auth` ou chave VAPID.
5. Teste foreground, background e app encerrado nos aparelhos da matriz da
   Spec 02. No iOS, a certificação depende da fundação completa da Spec 03.

## Operação

Monitorar:

- atraso da fila e duração por consumer;
- eventos expirados;
- inscrições invalidadas por 404/410;
- retries 429/rede/5xx;
- erro global 401/403 de VAPID;
- quantidade de páginas e inscrições elegíveis.

Uma resposta 404/410 invalida a inscrição. 429, rede e 5xx permitem retry com
backoff. 401/403 interrompe o lote e exige verificar as credenciais VAPID.

## Rollback

1. Esvazie `PUSH_INTERNAL_ALLOWLIST` e mantenha `PUSH_ENABLED=false` para cessar
   novas entregas sem apagar dados.
2. Preserve inscrições e auditoria; não faça limpeza destrutiva durante o
   incidente.
3. Publique um worker corretivo ou no-op compatível. Não remova simplesmente
   `/sw.js`, pois workers já instalados continuam ativos nos dispositivos.
4. Corrija e redeploye. Eventos vencidos são descartados no consumer, adapter e
   worker e não devem ser republicados.
