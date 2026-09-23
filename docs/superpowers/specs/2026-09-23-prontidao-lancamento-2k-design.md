# Prontidão para o lançamento — 2 mil usuários simultâneos

**Data:** 23/09/2026.
**Estado:** desenho aprovado pelo parceiro em 23/09 (três seções, em conversa). Onda 1 em execução.
**Gatilho:** auditoria de prontidão de 23/09 (cinco frentes, só leitura), pedida pelo parceiro:
"identifique possíveis falhas levando em conta que no lançamento podemos ter 2k usuários
simultâneos". O relatório foi entregue no chat. Esta spec cobre **só o que é código**.
**Datas:** lançamento pago ~02/10/2026 (NBA em hiato, temporada retroativa 2025-26 no ar);
NBA volta ~03/11/2026 (Fire Live, push e feed ao vivo).
**Plano da Onda 1:** [`2026-09-23-prontidao-lancamento-2k.md`](../plans/2026-09-23-prontidao-lancamento-2k.md).
**Base inspecionada:** `main`, commit `390dfe2`.

---

## 1. O problema, em uma frase por camada

- **Venda:** o cadastro trava 5 contas por hora **por IP**, contando os sucessos. No Brasil o
  celular sai por CGNAT (milhares atrás do mesmo IPv4), então a 6ª pessoa de uma operadora
  vê "Muitas tentativas" e não compra.
- **Banco:** toda tela é `force-dynamic`, grava `UPDATE dispositivos` a cada visualização e
  passa por um pool de **2** conexões por instância, sem `pool.on('error')`. Uma lentidão do
  Neon vira fila de 10 s, depois 500 em massa, depois instância derrubada.
- **Dinheiro:** a corrida no primeiro pagamento de temporada dá 500 no webhook; a fila de
  reconciliação nunca esvazia (~6–7 h para voltar a um pagamento perdido com 2 mil tentativas).
- **Custo:** uma resposta reprovada do chat apaga a reserva — a chamada foi paga e nenhum freio
  anda. Um assinante faz ~60 chamadas pagas por minuto.
- **Superfície:** sem cabeçalho anti-iframe; Next 16.3.1 com advisory crítico; login sem teto por
  IP e com corrida no contador; a rota `demo` sobrescreve dado real se a variável ficar ligada.

A estimativa (sem teste de carga — o único banco é o de produção): ~80 visualizações/s com 2 mil
ativos; ~1.200 consultas/s mais 80 escritas/s no hiato; ~2.000–2.500 comandos/s na temporada.
Com a Onda 1 e o cache do feed (Onda 2), a meta é **~6–8 consultas por visualização, quase só
leitura**.

## 2. Decisões

| # | Decisão | Quem |
|---|---|---|
| D1 | Uma spec, duas ondas. Plano só da Onda 1 agora; a Onda 2 ganha plano próprio. | parceiro, 23/09 |
| D2 | Limite de cadastro/checkout com **dois tetos**: por e-mail/usuário estrito (5, como hoje) e por IP folgado (30 cadastros/h; 30 checkouts/15 min). Reabrir checkout pronto não conta. Abuso volumétrico fica no firewall da Vercel. | parceiro, 23/09 |
| D3 | Falha do chat **devolve a cota do dia** até 3 vezes por dia, mas **conta no limite por minuto**. Da 4ª falha no dia em diante, conta na cota. | parceiro, 23/09 |
| D4 | Uma branch (`prontidao-lancamento-2k`), uma tarefa por área, **um commit no fim** (preferência registrada do parceiro). | parceiro, 23/09 |
| D5 | O motor (`src/modules/motor`) e o ruleset não mudam. Nenhuma regra de estratégia é tocada. | regra 1/2 do CLAUDE.md |
| D6 | P3 (mensal aprovado sem `next_payment_date` avançado) **não** ganha regra nova: continua sem conceder; ganha alerta na Onda 2. A regra é do cliente. | regra 3 do CLAUDE.md |

## 3. Onda 1 — até 02/10

Cada item nasce com um teste que falha antes da correção e passa depois (PGlite, como o resto
das suítes de persistência).

### 3.1 Banco — `src/modules/dominio/db/cliente.ts`

- `pool.on('error', …)` registra em `console.error` (JSON) e **não** relança: o driver emite
  `error` quando uma conexão ociosa cai, e sem ouvinte o EventEmitter derruba a instância.
- `max` lido de `DB_POOL_MAX` (inteiro positivo; qualquer outra coisa vira o padrão **5**).
  `connectionTimeoutMillis` passa a **5 s**.
- **Aceite:** emitir `error` no pool não lança; `DB_POOL_MAX=8` vira 8; `DB_POOL_MAX=abc` vira 5.

### 3.2 Cadastro e checkout — `src/modules/plataforma/assinatura/operacoes.ts`

- `PoliticaOperacao` ganha `maxPorIp`. CADASTRO `{ max 5, maxPorIp 30, 1 h }`; CHECKOUT
  `{ max 5, maxPorIp 30, 15 min }`; CANCELAMENTO `{ max 3, maxPorIp 3, 15 min }` (o mesmo de hoje).
- `excedeuOperacoes` faz **duas** contagens: por `identificador_hash` contra `max`, e por `ip`
  contra `maxPorIp`. Excede se qualquer uma exceder. Sem IP, só a primeira.
- `checkout.ts`: a reabertura de uma tentativa `pronta` deixa de chamar `registrarOperacao`.
- Migração nova: índice `tentativas_operacao_conta_ip_idx (operacao, ip, tentado_em)`, com o
  arquivo em `drizzle/down/` gerado por `npm run db:generate`.
- **Aceite:** 6 cadastros de e-mails distintos no mesmo IP passam; o 31º é barrado; o 6º com o
  mesmo e-mail (IPs distintos) é barrado; reabrir o mesmo checkout 10 vezes não barra.

### 3.3 Sessão — `src/modules/plataforma/auth/sessao.ts`, `auth/cookies.ts`

- O `UPDATE dispositivos` em `validarSessao` ganha `ultimo_uso < agora - 60 s` no `WHERE`. É
  gravação condicional, sem leitura extra; o dado só alimenta `detectarUsoSimultaneo` (janela 5 min).
- `sessaoAtual` é embrulhada em `cache()` do React (memo por requisição).
- O bloqueio pelo painel continua valendo na requisição seguinte: a leitura da sessão não muda.
- **Aceite:** duas validações a 30 s uma da outra deixam `ultimo_uso` igual ao da primeira; a
  terceira, 61 s depois, atualiza.

### 3.4 Chat — `entrega/chat.ts`, `ingestao/llm/perfis.ts`, `app/api/chat/route.ts`

- Migração: `chat_mensagens.falhou_em timestamptz null`.
- Falha (reprovação ou erro) deixa de apagar a mensagem USUARIO e grava `falhou_em`.
- `mensagensNoUltimoMinuto` conta todas as mensagens USUARIO (com ou sem falha).
- `mensagensUsadasHoje` = mensagens USUARIO sem falha + `max(0, falhas_do_dia − 3)`.
  O `3` fica em `chat-limites.ts` como `FALHAS_DEVOLVIDAS_POR_DIA`, ao lado dos outros freios.
- `ultimasMensagens` (histórico) ignora as mensagens com `falhou_em`.
- Perfil `chat`: `maxTokens` **350** (≈ os 1.200 caracteres que o validador aceita) e modelos
  `deepseek/deepseek-v4-flash`, `openai/gpt-4o-mini` — sai o Haiku, 10–30× mais caro.
- A rota passa a exigir `origemDaMutacaoValida` e `conteudoJson` e a ler o corpo por
  `lerJsonLimitado`, como as rotas de push e preferências.
- **Aceite:** com a LLM sempre reprovando, a 6ª pergunta no mesmo minuto recebe
  `limite-por-minuto`; a 4ª falha do dia consome cota; o histórico não traz a pergunta falha;
  POST com `Origin` estranho recebe 403.

### 3.5 Login — `auth/rate-limit.ts`, `auth/sessao.ts`, `auth/redefinicao.ts`, cadastro

- `autenticar` grava a tentativa **antes** de conferir a senha, como falha presumida, e só depois
  conta (a própria tentativa entra na conta). Se a senha confere, a linha vira `sucesso = true`.
  Isso limita a corrida: N logins paralelos não passam todos pela contagem zerada.
- Teto novo por IP: **50 falhas / 15 min** (só falhas: quem acerta a senha atrás do CGNAT não é
  barrado).
- O cadastro abre a sessão sem reconferir a senha (um scrypt a menos por cadastro).
- `concluirRedefinicao` calcula o hash **antes** de abrir a transação.
- **Aceite:** 20 logins errados em paralelo para o mesmo e-mail — no máximo 5 chegam a conferir a
  senha; a 51ª falha do mesmo IP (e-mails distintos) é barrada; o login certo continua passando.

### 3.6 Pagamento — `assinatura/webhook.ts`, `assinatura/reconciliacao.ts`

- `aplicarEventoPagamento` abre a transação com `pg_advisory_xact_lock(hashtext(<referência>))`
  (referência externa, ou o id externo da assinatura quando não houver referência). Eventos do
  mesmo pagamento passam a ser serializados; o segundo vê a linha que o primeiro criou.
- Reconciliação:
  - temporada com cobrança aprovada aplicada → tentativa `ENCERRADA` (sai da fila);
  - tentativa sem pagamento encontrado e criada há **mais de 7 dias** → `ENCERRADA`;
  - mensal autorizado continua na fila (as renovações também precisam da rede de segurança);
  - candidatas criadas nas últimas **48 h** vêm primeiro; depois, o rodízio por `atualizado_em`.
- **Aceite:** dois eventos simultâneos do primeiro pagamento de uma temporada não dão erro e deixam
  uma assinatura; temporada paga não volta a ser candidata; tentativa abandonada sai após 7 dias;
  uma tentativa de ontem é examinada antes de uma de 10 dias com `atualizado_em` mais antigo.

### 3.7 Segurança — `next.config.ts`, `package.json`

- Cabeçalhos em todas as rotas: `X-Frame-Options: DENY`,
  `Content-Security-Policy: frame-ancestors 'none'` (só essa diretiva — uma CSP completa arrisca
  quebrar script e fica fora), `Referrer-Policy: strict-origin-when-cross-origin`,
  `X-Content-Type-Options: nosniff`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
  Os cabeçalhos específicos que já existem (`/sw.js`, manifest, `/redefinir`) continuam.
- `next` fixo em **16.3.6** (corrige GHSA-2xp9-vwfh-vxw4).
- **Aceite:** teste lê `headers()` do config e acha os cinco na rota global; `npm run build` passa.

### 3.8 Guarda da demo — `app/api/cron/demo/route.ts`

- A rota não semeia se `NBA_INGESTAO_HABILITADA === 'true'` **ou** se existir linha em
  `checkpoints_ingestao` (só o backfill real escreve nela — ver `pente-fino-gestao.md` §1).
  Responde como as outras recusas do cron: `{ executado: false, motivo }` com `console.warn`
  (pular não é falha, e o padrão da rota é esse). `DEMO_AUTOSSEMEADURA` continua sendo a
  primeira guarda.
- **Aceite:** com um checkpoint gravado, a rota devolve `executado: false` com motivo
  `DADO_REAL_PRESENTE` e `simularAte` não é chamado.

### 3.9 Portão antes do banco — telas de estatística de jogador, time e jogo

- Antes de qualquer consulta, a tela confere só o cookie (`tokenDaSessaoAtual()`). Sem cookie,
  redireciona para `/entrar` (com o mesmo `destino` de hoje) sem tocar no banco. Com cookie, o
  fluxo segue como está.
- **Aceite:** sem cookie, a tela redireciona e o banco não é chamado.

### 3.10 Afiliados — `app/r/[codigo]/route.ts`, `app/ir/[codigo]/route.ts`

- Resolver o destino e registrar o clique viram dois passos com tratamento separado. Se o
  **registro** falhar depois de o destino estar resolvido, o redirect segue para o destino e o
  erro vai para o log. Falha ao **resolver** continua indo para `/oferta-indisponivel`.
- **Aceite:** com o insert do clique falhando, a resposta é um redirect para a casa.

### 3.11 Agregados da temporada — `entrega/estatisticas/temporadas.ts`, `entrega/resultados.ts`

- `temporadasComDados` e `taxaDaTemporada` passam por `unstable_cache` com a tag que a lateral já
  usa (invalidada pelos crons que gravam jogos). Mudam uma vez por dia; hoje rodam em toda visita,
  e no hiato Estatísticas é a tela principal.
- **Aceite:** as duas leituras usam cache com a tag certa — no mesmo padrão do teste da lateral.

### 3.12 Bateria de fechamento

`typecheck`, `lint`, `boundaries`, vitest completo (em lotes, pelo disco), `next build`.
O `%` não commitado em `apito/[jogadorId]/page.tsx` é de outra entrega e fica fora do commit.

## 4. Onda 2 — até 03/11 (plano próprio)

| # | O quê | Meta |
|---|---|---|
| W2-1 | `lerFeedCacheado(data)` com `unstable_cache` e tag `feed-<data>`, invalidada por quem publica (cron da Lista, `materializarFeedFireLive`) com `revalidateTag(…, 'max')`. Auth, nível e preferências continuam dinâmicos. O apito filtra o jogador no feed em cache. A página continua sem `'use cache'`. | Lista de ~19 para ~6 consultas por visualização |
| W2-2 | Push: reinscrição só quando o endpoint muda (cliente guarda o último; servidor não grava nada se igual); retry republica só as inscrições que falharam; 403 isolado invalida a inscrição (global só acima de metade do lote); `push-entregas` com `maxConcurrency` 20 e cursores da expansão em paralelo; push expirado vira métrica e alarme. | rodada cheia entregue antes da validade de 5 min |
| W2-3 | Fire Live: erro capturado por ciclo dentro do workflow; heartbeat em `fire_live_execucoes` e retomada de `INICIADA` parada há mais de 3 ciclos; reserva/início fora do `try` da ingestão do `ao-vivo`; BDL confere `period` de novo depois de ler as estatísticas. | um soluço do provedor não apaga o jogo |
| W2-4 | Odds coletadas também no cron da `lista-secreta`, antes de publicar. | linha da noite presente no card |
| W2-5 | `instrumentation.ts` com `onRequestError`; notificador real no `saude` (canal = G8, pendente; sem ele fica configurável e desligado); o caso P3 dispara esse alerta. | alguém fica sabendo |
| W2-6 | `AtualizarAoVivo` com jitter de ±10 s; limpeza semanal de sessões encerradas, tentativas antigas e inscrições invalidadas; `workflow` 4.8.9. | — |

## 5. Decisões pendentes (do cliente ou do parceiro — não inventar)

1. **P3:** o que fazer quando o mensal é aprovado e o `next_payment_date` ainda não avançou.
2. **G8:** o canal do alerta operacional (e-mail, webhook, outro).
3. **Reserva NBA:** chave da API-Sports, ou aceitar `NBA_RESERVA_OBRIGATORIA=false`.
4. **Fila da reconciliação** (achado da revisão final): a 3.6 só encerra tentativa **sem nada no
   provedor**. Na prática, o checkout mensal abandonado (preapproval `pending` para sempre) e o
   PIX gerado e não pago (`rejected`/`cancelled`) continuam na fila indefinidamente. Falta
   decidir se, passados 7 dias, esses dois casos também saem.

## 6. Checklist de configuração (fora do código, com o parceiro)

- [ ] **`npm run db:migrate` (0030–0032) no Neon ANTES do deploy** — ver §8.
- [ ] Vercel **Pro**; `CRON_COMPLETO=true`; **redeploy** (a flag é lida no build); conferir os 7
      crons na aba Cron Jobs.
- [ ] Cadastrar `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`, os 6
      `PLANO_*_CENTAVOS` e `TEMPORADA_FIM`; conferir `MERCADOPAGO_SANDBOX=false`; um pagamento
      real de ponta a ponta.
- [ ] Neon pago: ≥ 1 CU fixo, autoscaling até 2–4 CU, scale-to-zero desligado.
- [ ] Trocar a chave da OpenRouter e definir teto de crédito.
- [ ] Firewall da Vercel: rate limit em `/entrar` e `/cadastrar`.
- [ ] Remover `DEMO_AUTOSSEMEADURA` de Production.
- [ ] Monitor de uptime externo em `/entrar` e numa rota logada.
- [ ] (opcional) `DB_POOL_MAX` só se o teste de carga pedir outro valor.

## 7. Fora do escopo

- Teste de carga (exige banco de staging; recomendado antes de 03/11).
- Mudança de UX, motor, ruleset ou vocabulário.
- O `%` não commitado do apito.

## 8. Achados da execução (23/09)

Onda 1 executada inteira, tarefas 1–11 com teste visto vermelho antes de verde. Nada foi
implantado nem migrado no Neon.

**Migrar antes de implantar.** O `build` não migra, e o `db:migrate` é manual. O código novo
lê `chat_mensagens.falhou_em` (0031): implantado antes da migração, o chat inteiro responde
erro. As três migrações são aditivas e compatíveis com o código de hoje, então a ordem é
`db:migrate` (0030–0032) primeiro e deploy depois. O passo entrou no checklist da §6.

**Onde o código divergiu do desenho**

- **3.3 Sessão:** o filtro de `ultimo_uso` não tem `isNull` — a coluna é `notNull` no schema.
- **3.8 Guarda da demo:** o teste do checkpoint cria antes uma linha em `execucoes_ingestao`; o
  checkpoint tem FK obrigatória para ela, o que o plano não previa.
- **3.9 Portão antes do banco:** sem cookie de sessão, as telas de jogador, time e jogo agora
  redirecionam **antes** de ir ao banco. Consequência aceita: `estatisticas-url-invalida`
  simula um cookie presente para continuar provando o 404 sem erro de UUID.
- **3.10 Afiliados:** o destino é resolvido **antes** do registro do clique. O registro volta a
  chamar `configuracaoDoLink`, então são algumas consultas sequenciais a mais por clique (4
  SELECTs, na conta da revisão), não uma. Para a Onda 2: passar ao registro a configuração já
  resolvida. É o que permite redirecionar para a casa
  mesmo quando o insert falha.
- **3.11 Agregados:** o cache mora na camada `app`
  (`src/app/(app)/estatisticas/temporada-cacheada.ts`), não em `entrega/`. As funções de
  `entrega/` continuam puras de framework e o `unstable_cache` fica ao lado de
  `lerLateralCacheada`, que segue o mesmo padrão. Usa a tag da lateral e `revalidate` de 1 h
  como rede de segurança.
- **3.7 Segurança:** o `package.json` ficou com `next` em `^16.3.6`, não exato. O lockfile trava
  a 16.3.6 e o `npm ci` da Vercel respeita o lock, então o piso já fecha o GHSA. O `npm install` trouxe o `sharp` 0.35.4 (transitivo do `next`), que fecha
  o advisory alto. `npm audit --omit=dev` fica em 0 crítico, 0 alto e 14 moderados.

- **3.5 Login (correção da revisão final):** a tentativa barrada tem a linha reservada
  **apagada**. Antes, ela contava como falha, e quem insistia durante o bloqueio o prolongava
  para sempre. No teto por IP, isso trancava todo o CGNAT, inclusive quem acertava a senha,
  contra o que esta spec pede. A corrida continua fechada: linha que passa para a conferência
  nunca é apagada. Dois testes novos provam que o IP e o e-mail destravam quando a janela vence.

**Testes existentes ajustados**

- Quatro testes de tela (`telas-04-estatisticas`, `planos-estatisticas`, `telas-demo`,
  `estatisticas-url-invalida`) ganharam `tokenDaSessaoAtual` no mock de `auth/cookies`.
- `estatisticas-url-invalida` ganhou mock de `next/cache` (`unstable_cache` = função crua),
  como as suítes vizinhas.
- `chat`, `rota` do chat, `checkout-sku`, `webhook-temporada`, `reconciliacao-temporada` e a
  rota do cron da demo foram ajustados às novas assinaturas. A única asserção removida é a do
  chat: com o LLM indisponível, a pergunta não some mais. Ela fica gravada com `falhouEm`
  preenchido (3.4), e o teste agora exige exatamente isso.

**Bateria de fechamento**

- `typecheck` com 0 erros, `lint` com 0 erros (1 aviso em `scripts/_gerar-dados-front.ts`, não
  versionado) e `boundaries` com 0.
- Vitest em 18 lotes de 12 arquivos (209 arquivos): tudo verde, exceto
  `telas-04-detalhe`. Com `apito/[jogadorId]/page.tsx` trocado temporariamente pela versão do
  HEAD, ele passa 24/24. A falha é só o `%` não commitado de outra entrega, que ficou fora do
  commit.
- O disco zerou duas vezes no meio da suíte, por swap do macOS, não por arquivo do projeto. A
  bateria só terminou depois de reiniciar o Mac.
- `next build` com o banco apontado para `127.0.0.1:1` sai com 0. Uma primeira execução, feita
  por engano com o `.env.local`, leu o Neon: só `next build`, sem migração, e as rotas estáticas
  não consultam banco.

**Revisão final da branch** (com correções; nenhum crítico). Ficam para a Onda 2: o chat com
`maxTokens` 350 não trata resposta truncada (`finish_reason = length`); a trava do webhook
usa `hashtext` de um argumento, no mesmo espaço das travas de afiliados (colisão só causa
espera); o `CANCELAMENTO` com 3 por IP mantém o problema de CGNAT (decisão desta spec); e
`taxaDaTemporadaCacheada` pode atrasar até 1 h na temporada ao vivo, porque a tag da lateral
só é invalidada pela rodada. Uma lacuna do plano está em aberto na §5.

**Para a Onda 2 / fora deste commit:** o que está acima, além da §4. As pendências P3, G8 e reserva
NBA (§5) e o checklist da §6 continuam com o parceiro.

## 9. Achados da Onda 2 (23/09)

Onda 2 executada inteira, com um subagente por tarefa, revisão por tarefa e uma revisão final da
branch. Não há migração nesta onda. Nada foi implantado.

**Para o deploy de 03/11** (além da §6)

- `CRON_COMPLETO=true` no plano Pro. Sem isso, `ao-vivo`, `saude` e a limpeza nova não rodam.
- `ALERTA_WEBHOOK_URL`, com o canal do G8 (Slack, Discord ou Zapier aceitam o JSON). Sem ela, os
  alertas novos ficam só no log.
- `VAPID_SUBJECT` real, e não `mailto:push@example.com`. A Apple recusa um `sub` de VAPID que não
  aceita, e isso tira o push da base iOS.
- **Implantar sem Fire Live em curso e sem push na fila.** Durante a troca de deployment, a
  instância velha e a nova usam chaves de trava diferentes, e uma mensagem nova da fila
  (`faixa`, `fins`, `tentativa`) que cair num consumidor velho é descartada. Na entressafra o
  risco é praticamente nulo.

**Onde o código divergiu do plano, e por quê**

- **W2-1:** a meta da Lista é **17 → 12 consultas**, não ~6. As outras dez são por usuário
  (sessão, acesso, preferências, experiência) e continuam dinâmicas.
  - O `null` em cache nunca é confiado, e a marca de "calculado agora" só vale depois da leitura
    do banco. Sem isso, a rajada logo depois da publicação via "Próxima lista às…".
  - A invalidação sai também logo depois de gravar o snapshot. Se a função morrer por
    `maxDuration`, porém, nenhuma invalidação roda, porque o Next só as executa quando a rota
    responde. Nesse caso o `revalidate: 600` cobre, com até ~10 min de atraso numa republicação.
- **W2-2, push:**
  - Quando a recusa atinge a maioria (VAPID global), o lote **não é relançado inteiro**. Só as
    recusadas e as que pediram retry voltam, em 60 s. Relançar tudo duplicava push para quem já
    tinha recebido (regra 5).
  - A maioria é contada **por serviço de push** (FCM, Mozilla, Apple), não por lote.
  - A expansão publica um **plano congelado**, e as faixas saem do conteúdo desse plano. Chave de
    fila já usada (`DuplicateMessageError`) conta como sucesso. Sem isso, uma reentrega recalculava
    as fronteiras e duplicava push, ou perdia faixas.
- **W2-3, Fire Live:**
  - O erro de um ciclo não derruba mais o run.
  - O batimento é renovado também no caminho de erro, porque uma pane lenta do provedor faria o
    cron retomar um run vivo a cada minuto.
  - As escritas do ciclo ganharam fencing por `run_id`.
- **W2-4:** a coleta extra de odds acontece uma vez por dia, antes da primeira publicação, e só
  quando há lista ativa.
- **W2-5:** o canal é um webhook genérico, desligado sem a variável.
  - O P3 grava o alerta na mesma transação do pagamento, sem regra nova (D6).
  - Push que vence tanto na entrega quanto na expansão gera alerta.
- **W2-6:** a limpeza semanal (segunda, 08:00 UTC, só no Pro) apaga:
  - tentativas de login e de operação com mais de 7 dias;
  - sessões encerradas ou expiradas com mais de 30 dias;
  - inscrições de push invalidadas com mais de 30 dias.

  A auditoria não é tocada. **Os prazos são operacionais: confirmar com o parceiro.**
  - O `workflow` 4.8.9 trouxe no lockfile peers da própria árvore dele (`@nestjs` 12, `@aws-sdk`).
- **Minors da §8:**
  - O clique de afiliado lê a configuração uma vez.
  - Resposta truncada por `maxTokens` conta como falha, tanto no chat quanto na narrativa da Lista.
  - As travas ganharam namespace (`src/modules/dominio/db/travas.ts`).

**Fica para depois do merge**

- Alerta para `fire_live_ciclo_falhou` repetido. Hoje, uma configuração ausente vira log a cada
  20 s, em silêncio.
- Log dos erros por casa na coleta de odds antes da Lista.
- Conferir a cota do plano da BallDontLie. Durante o 1º quarto, cada snapshot faz uma leitura a
  mais do jogo.
- Pendências que continuam com o parceiro: a §5 (P3, G8, reserva NBA e a fila da reconciliação).
