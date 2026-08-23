# Spec 00 — Estabilização da fundação

**Estado:** implementada e certificada localmente · 21/08/2026  
**Depende de:** nada  
**Bloqueia:** integração das specs 01–07 e qualquer deploy de produção  
**Destrava:** execução segura das fatias de produto sobre contratos confiáveis

---

## Problema

A fundação passa em lint, typecheck, fronteiras, build e 214 testes, mas a
auditoria de 21/08/2026 encontrou defeitos fora da cobertura atual. Eles não são
features ausentes: são violações de contratos que o código já afirma cumprir.

Os riscos se concentram em seis fronteiras:

1. o motor pode receber média de outra temporada e não recebe jogadores não
   classificados no Fire Live;
2. uma falha entre reservar e iniciar um workflow pode impedir o Fire Live de um
   jogo sem nova tentativa;
3. crons ficam públicos quando o segredo não está configurado;
4. logout, limite de dispositivos e detecção por IP divergem do comportamento
   prometido;
5. o webhook real do Mercado Pago não consome o contrato oficial e não aplica o
   efeito de forma atômica;
6. o failover perde a identidade da fonte, justamente onde ids externos não são
   intercambiáveis.

Continuar as specs 01–07 antes de corrigir isso amplia o custo: a ingestão real
passaria a alimentar médias ambíguas, o paywall dependeria de um webhook que pode
perder pagamento e o push anunciaria um Fire Live incompleto.

---

## Objetivo

Deixar a fundação **determinística, fail-closed, reexecutável e observável** sem
adicionar funcionalidade comercial nova e sem alterar regras homologadas do CJ.

Ao final:

- o mesmo fato produz a mesma decisão, independentemente da ordem do banco;
- falha transitória pode atrasar um trabalho, nunca eliminá-lo silenciosamente;
- ausência de configuração sensível bloqueia a operação;
- encerrar acesso revoga o acesso persistido;
- evento de pagamento confirmado é aplicado exatamente uma vez, por inteiro;
- trocar do provedor primário para o reserva preserva a identidade do dado.

---

## Inventário dos defeitos

| # | Severidade | Defeito | Evidência atual |
| --- | --- | --- | --- |
| E1 | crítica | Média sem filtro de temporada; uma linha sobrescreve outra sem ordem | `dominio/fatos.ts`, `dominio/fatos-ao-vivo.ts` |
| E2 | crítica | Jogador não classificado nunca entra nos fatos do Fire Live | `dominio/fatos-ao-vivo.ts` |
| E3 | alta | Trava mínima de pontos é aplicada ao não classificado, apesar de o contrato dizer “sem trava” | `motor/fire-live/alvo.ts` |
| E4 | crítica | Reserva persistida antes de `start()` pode impedir retry do workflow | `entrega/fire-live/inicio.ts`, cron `fire-live` |
| E5 | alta | `CRON_SECRET` ausente faz as rotas aceitarem chamadas anônimas | rotas em `app/api/cron` |
| E6 | alta | Telas consultam ano civil, enquanto a ingestão grava temporada NBA | pages de `estatisticas` |
| E7 | alta | Logout remove cookie, mas não encerra a sessão no banco | `entrar/acoes.ts` |
| E8 | alta | Limite fecha sessões, não o dispositivo excedente inteiro | `plataforma/auth/sessao.ts` |
| E9 | alta | IP nunca chega ao detector no fluxo real | login, cookies e `detectarUsoSimultaneo` |
| E10 | alta | Webhook real assume dados completos no evento e não consulta o recurso | adapter Mercado Pago |
| E11 | crítica | Idempotência do webhook e seu efeito não estão na mesma transação | `assinatura/webhook.ts` |
| E12 | alta | Pagamento aprovado pode desfazer bloqueio administrativo | `assinatura/webhook.ts` |
| E13 | alta | Failover não informa qual provedor respondeu | `ingestao/nba/failover.ts` |
| E14 | média | Curadoria grava UUID canônico como id externo do provedor | `admin/mapeamento/acoes.ts` |
| E15 | média | Painel considera sessão expirada como ativa | `plataforma/admin/usuarios.ts` |
| E16 | alta | Banco novo não tem caminho seguro para criar o primeiro ADMIN | migrations e actions do admin |
| E17 | média | Destino do login aceita valor externo sem validação explícita | `entrar/acoes.ts` |

Este inventário é o contrato mínimo da spec. Achado novo na mesma fronteira entra
como caso de teste da fatia correspondente; feature nova vai para sua spec de
produto.

---

## Escopo

### Entra

- rótulo único de temporada em leitura e escrita;
- seleção determinística da média da temporada correta;
- Fire Live de pontos para jogador não classificado;
- retry e reconciliação do início do workflow;
- autenticação fail-closed dos crons;
- revogação de sessão, limite real de dispositivos e IP confiável;
- separação entre bloqueio administrativo e situação de pagamento;
- consumo do recurso real do Mercado Pago e transação do webhook;
- preservação da identidade da fonte no failover;
- correção do vínculo de id externo na curadoria;
- bootstrap auditável do primeiro administrador;
- regressões automatizadas, logs estruturados e smoke test dos fluxos corrigidos;
- tratamento das vulnerabilidades transitivas apontadas por `npm audit`, por
  atualização compatível, override comprovado ou aceitação temporária documentada.

### Não entra

- crons e loop de ingestão da spec 01;
- envio Web Push, service worker e PWA das specs 02 e 03;
- checkout, paywall, cancelamento e tela de conta da spec 04;
- feed e filtros do Fire Live da spec 05;
- odds, blowout, backtest e alertas das specs 06 e 07;
- regra nova, valor novo ou reinterpretação da estratégia do CJ;
- rebotes e assistências sem a classificação editorial correspondente;
- refatoração estética sem relação com um defeito deste inventário.

**Atenção:** o feed pago continuar aberto é defeito conhecido, mas o contrato de
quem pode acessar cada rota pertence à spec 04. Até ela ser concluída, não há
autorização para deploy público de produção.

---

## Invariantes

### 1 · Temporada é uma chave de domínio

`temporadaDe(data, config)` é a única função autorizada a construir o rótulo.
Ingestão, fatos, estatísticas e backtest recebem ou derivam o mesmo valor a partir
de `ruleset.temporada`.

Toda consulta a `medias_jogador` com janela `TEMPORADA` inclui também a temporada.
Se houver zero ou mais de uma linha para a chave esperada, o comportamento precisa
ser explícito:

- zero linhas → atributo sem média, sem inventar `0`;
- mais de uma linha → constraint impede; não se escolhe “a última que veio”.

### 2 · Não classificado também é fato do Fire Live

Em pontos, o conjunto observado é o elenco canônico dos dois times do jogo, não
apenas a lista editorial. A classificação continua vindo de `niveis` quando
existir; ausência vira `nivel: null`.

Isso **não** autoriza usar o elenco real no bloco de topo ou na OPD. Essas regras
continuam usando a lista projetada do CJ. O motor recebe as duas informações sem
misturá-las:

- vínculo canônico do jogo → quem pode produzir estatística ao vivo;
- vínculo editorial → classificação, hierarquia, OPD e bloco de topo.

Para pontos de não classificado, vale o multiplicador homologado e **não existe
trava mínima de alvo**. Rebotes e assistências seguem recusados sem classificação.

### 3 · Reserva de workflow é um lease, não uma sentença

Uma execução precisa distinguir ao menos:

```ts
type EstadoExecucao = 'RESERVADA' | 'INICIADA' | 'ENCERRADA' | 'FALHOU_AO_INICIAR'
```

O nome exato pode seguir o schema existente, mas o comportamento é obrigatório:

- duas invocações concorrentes iniciam no máximo um workflow;
- reserva sem `runId` expira ou é reconciliada;
- falha de `start()` fica registrada e pode ser tentada novamente;
- execução já iniciada nunca é duplicada por retry;
- toda transição relevante tem timestamp e erro resumido.

Não vale resolver apagando a reserva no `catch`: queda do processo antes do
`catch` recriaria o mesmo buraco.

### 4 · Configuração sensível falha fechada

Contrato dos crons:

| Situação | Resposta | Efeito |
| --- | --- | --- |
| `CRON_SECRET` ausente | `503` | nenhum acesso a banco/workflow |
| bearer ausente ou incorreto | `401` | nenhum acesso a banco/workflow |
| bearer correto | segue o job | comportamento normal |

A comparação não deve registrar o segredo nem o header recebido.

### 5 · Sessão persistida governa acesso

- logout encerra a sessão atual no banco antes de remover o cookie;
- token encerrado falha na requisição seguinte;
- o limite é de dispositivos distintos com sessão válida, não de linhas de
  sessão;
- ao expulsar um dispositivo, todas as sessões abertas daquele dispositivo são
  encerradas na mesma operação;
- sessão expirada não aparece como ativa no painel;
- IP vem de cabeçalho confiável da infraestrutura, nunca de campo enviado pelo
  formulário;
- destino pós-login aceita somente caminho interno conhecido; URL absoluta,
  protocolo relativo e sequência inválida caem no destino seguro `/`.

Fingerprint continua sendo identificação de conveniência, não mecanismo
antifraude. Nenhuma decisão sensível confia apenas nele.

### 6 · Bloqueio administrativo e pagamento são fatos independentes

Pagamento aprovado pode liberar o direito comercial, mas nunca remover bloqueio
manual de fraude, segurança ou compartilhamento.

O portão da futura spec 04 deve conseguir distinguir:

```ts
type MotivoSemAcesso =
  | 'sem-sessao'
  | 'bloqueio-administrativo'
  | 'sem-assinatura-ativa'
```

A migration pode separar campos ou manter entidades distintas. O que não pode
continuar é um único `usuarios.status` representar simultaneamente punição
administrativa e situação financeira.

### 7 · Webhook é aviso, não fonte completa

Depois de validar a assinatura, o adapter usa o id notificado para consultar o
recurso correspondente com timeout e credencial. Status, referência externa,
assinatura, plano e próxima cobrança vêm dessa resposta validada, não de campos
opcionais presumidos no aviso.

A gravação da chave idempotente e a aplicação do efeito acontecem na **mesma
transação**:

```text
BEGIN
  inserir evento, ou reconhecer duplicata
  aplicar assinatura e direito de acesso
COMMIT
```

Se qualquer efeito falhar, o evento não fica marcado como concluído. Retry volta
a processá-lo. Evento duplicado já concluído responde sucesso sem repetir efeito.

Chamadas externas acontecem antes da transação; nenhuma transação fica aberta
esperando rede.

Referências do contrato externo:

- [Webhooks do Mercado Pago](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/additional-content/your-integrations/notifications/webhooks)
- [Consulta de assinatura por id](https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/get-preapproval/get)

### 8 · Identidade externa acompanha o dado

O resultado do failover informa qual fonte respondeu. Toda persistência que usa
id externo recebe `(provedor, idExterno)` do mesmo resultado; o chamador não pode
fornecer o nome do provedor por fora e assumir que foi o primário.

Troca para o reserva, com ids diferentes para a mesma pessoa, não pode:

- rotular id do reserva como primário;
- criar dois jogadores canônicos sem mandar a ambiguidade para curadoria;
- sobrescrever vínculo confirmado de outro provedor;
- gravar UUID canônico em `provedor_player_id`.

### 9 · Primeiro administrador não tem credencial padrão

Banco vazio possui um caminho operacional, explícito e idempotente para criar o
primeiro ADMIN. O bootstrap:

- exige e-mail e senha fornecidos fora do repositório;
- usa o mesmo hash de senha do produto;
- recusa senha fraca;
- não imprime a senha nem o hash;
- não rebaixa, duplica ou troca senha em reexecução silenciosa;
- registra a criação para auditoria;
- fica documentado para ambiente local, preview e produção.

---

## Observabilidade mínima

Cada fronteira assíncrona corrigida deixa evidência suficiente para diagnóstico:

- cron: rota, autorizado/recusado, quantidade de itens e duração;
- workflow: jogo, estado anterior/novo, tentativa, `runId` e erro sanitizado;
- webhook: provedor, id do evento/recurso, duplicado, efeito e duração;
- failover: provedor tentado, provedor vencedor, latência e erro sanitizado;
- sessão: login, logout, dispositivo encerrado e motivo — nunca token, senha ou
  cookie.

Logs não incluem segredo, bearer, access token, corpo integral de pagamento,
fingerprint completo ou dado pessoal desnecessário.

---

## Harness obrigatório

Cada defeito começa com um teste que falha antes da correção.

### Domínio e motor

1. duas temporadas para o mesmo jogador → fatos usam somente a temporada pedida;
2. março de 2026 com formato `dois_anos` → ingestão e três telas usam `2025-26`;
3. jogador canônico sem nível atinge alvo de pontos → Fire Live emite apito;
4. não classificado com alvo abaixo de 4 → não é barrado pela trava dos
   classificados;
5. não classificado em rebotes/assistências → segue sem apito.

### Workflow e cron

1. duas reservas concorrentes → um único `start()`;
2. `start()` falha → execução fica elegível à reconciliação;
3. processo cai após reservar e antes de anotar `runId` → próximo ciclo recupera;
4. segredo ausente/incorreto → banco e workflow não são chamados;
5. segredo correto → rota chega ao serviço.

### Plataforma

1. logout → token anterior retorna `encerrada`;
2. A com duas sessões + B + entrada de C → só B e C permanecem ativos;
3. sessão expirada → painel não conta como ativa;
4. dois dispositivos em IPs distintos no fluxo HTTP real → evento de uso
   simultâneo;
5. destino externo no login → redirect seguro para `/`;
6. bootstrap em banco vazio → um ADMIN; segunda execução → nenhum duplicado.

### Pagamento

1. fixture fiel ao aviso oficial, contendo apenas id do recurso → adapter consulta
   e interpreta o recurso;
2. falha depois de inserir o evento e antes do efeito → rollback completo;
3. retry após essa falha → aplica o efeito uma vez;
4. evento já concluído → duplicata sem novo efeito;
5. pagamento aprovado com bloqueio administrativo → assinatura atualiza, usuário
   continua bloqueado;
6. assinatura inválida → nenhuma chamada externa e nenhuma escrita.

### Failover

1. primário falha, reserva responde com ids diferentes → persistência usa o nome
   do reserva;
2. mesma pessoa em dois provedores → um canônico, dois vínculos externos;
3. nome ambíguo → curadoria, sem vínculo automático;
4. confirmação humana grava o id externo real selecionado.

---

## Pronto quando

- E1–E17 têm teste de regressão automatizado;
- todos os invariantes desta spec estão implementados;
- não existe seleção de média de temporada sem a chave `temporada`;
- Fire Live avalia um jogador não classificado de ponta a ponta;
- uma falha simulada de `start()` é recuperada sem workflow duplicado;
- os crons falham fechados antes de qualquer I/O;
- logout invalida o token persistido e o limite mantém no máximo dois aparelhos;
- fixture oficial do Mercado Pago passa pelo adapter real com rede simulada;
- falha transacional do webhook não perde o pagamento;
- bloqueio administrativo sobrevive a pagamento aprovado;
- failover preserva `(provedor, idExterno)` até a persistência;
- banco vazio recebe o primeiro ADMIN sem segredo versionado;
- `npm run lint`, `npm run typecheck`, `npm run boundaries`, `npm test`,
  `npm run build` e `git diff --check` passam;
- smoke HTTP cobre cron autorizado/recusado e webhook configurado/não configurado;
- o relatório de `npm audit --omit=dev` não contém vulnerabilidade alta sem uma
  decisão registrada com prazo e responsável;
- documentação conflitante das specs 01 e 04 é atualizada antes de iniciar essas
  implementações.

---

# Plano

## Fatia 0 · Congelar contratos e reproduzir

1. transformar E1–E17 em testes ou fixtures que falham;
2. registrar o resultado inicial dos comandos de validação;
3. não alterar schema ou produção antes de os cenários críticos existirem;
4. decidir a migration mínima para estado de workflow e separação de acesso.

**Saída:** harness vermelho, com uma falha explicável por defeito.

## Fatia 1 · Domínio e Fire Live

1. propagar a temporada do ruleset até `montarFatos` e `montarFatosDoJogo`;
2. usar `temporadaDe` nas três telas;
3. separar elenco canônico de classificação editorial nos fatos ao vivo;
4. corrigir a trava do não classificado;
5. executar testes do motor, entrega e estatísticas.

**Rollback:** somente código; nenhuma regra ou dado histórico é alterado.

## Fatia 2 · Workflow e crons

1. migration aditiva para estado/tentativa/erro da execução, se necessária;
2. reserva recuperável e reconciliador;
3. transições e logs estruturados;
4. guarda compartilhada e fail-closed dos crons;
5. testes de concorrência, queda e retry.

**Rollout:** migration primeiro, código compatível depois. Colunas novas não são
removidas em rollback imediato.

## Fatia 3 · Sessões e administração

1. revogar sessão no logout;
2. aplicar limite por dispositivo em operação atômica;
3. filtrar expiração no painel;
4. capturar IP somente da infraestrutura confiável;
5. validar redirect interno;
6. criar bootstrap do primeiro ADMIN e documentação operacional.

**Verificação:** testes de serviço mais smoke HTTP real; teste unitário isolado
não prova que o IP atravessa o App Router.

## Fatia 4 · Pagamento

1. separar bloqueio administrativo de direito comercial com migration aditiva;
2. consultar o recurso oficial no adapter real, com timeout e erro explícito;
3. mover idempotência e efeito para a mesma transação;
4. cobrir retry, duplicata, cancelamento e bloqueio administrativo;
5. atualizar as premissas da spec 04.

**Rollout:** primeiro código que lê os dois modelos; depois backfill; por último o
novo caminho de escrita. Nenhuma coluna antiga é removida nesta spec.

## Fatia 5 · Identidade e failover

1. fazer o resultado carregar a identidade da fonte vencedora;
2. propagar essa identidade por todas as sincronizações;
3. corrigir a action de curadoria para enviar o id externo real;
4. impedir canônico órfão/duplicado em concorrência;
5. atualizar `.env.example` com todas as variáveis NBA, sem valores reais.

**Verificação:** principal e reserva usam ids deliberadamente incompatíveis na
fixture; o teste só passa se a origem viajar com o dado.

## Fatia 6 · Dependências e certificação

1. atualizar `workflow`/transitivas por caminho compatível ou registrar aceitação
   temporária com prazo;
2. rodar a matriz completa de validação;
3. smoke local sem banco, com banco de teste e com serviços fake;
4. revisar logs para ausência de segredo e dado pessoal;
5. atualizar README, specs 01/04 e runbook de bootstrap;
6. publicar somente depois de evidência externa dos fluxos críticos.

---

## Ordem e paralelismo

```text
Fatia 0
  ├── Fatia 1 · domínio
  ├── Fatia 2 · workflow/crons
  └── Fatia 3 · sessões/admin
        ↓
      Fatia 4 · pagamento

Fatia 0 ── Fatia 5 · identidade/failover

Fatia 1–5 concluídas ── Fatia 6 · certificação
```

As fatias 1, 2, 3 e 5 podem ser implementadas em paralelo depois que o harness e
as migrations forem fechados. A fatia 4 espera a decisão de modelo de acesso da
fatia 3. A certificação nunca roda sobre consolidação parcial.

---

## Riscos

### Corrigir a média muda apitos

Se o sistema já tiver dados de duas temporadas, corrigir a seleção pode mudar o
resultado do motor. Isso é correção, não mudança de regra, mas exige comparar
antes/depois numa fixture histórica e registrar quais apitos mudaram.

### Incluir não classificados aumenta o conjunto observado

O ciclo deixa de avaliar apenas a lista editorial. Medir quantidade de jogadores,
tempo por ciclo e chamadas ao banco com uma rodada cheia. O filtro incremental
por jogador alterado continua obrigatório.

### Retry mal desenhado duplica workflow

Lease sem compare-and-set ou constraint transacional troca perda silenciosa por
duplicata. O teste concorrente é critério de pronto, não otimização posterior.

### Migration de acesso pode bloquear cliente legítimo

Separar bloqueio e pagamento exige backfill explícito. Valor ambíguo não é
adivinhado: vai para relatório de exceção antes do corte.

### Webhook depende de rede

Consultar o recurso aumenta latência e cria nova falha transitória. Timeout curto,
retry do provedor e transação apenas depois da resposta limitam o risco. Responder
sucesso sem aplicar efeito não é fallback aceitável.

### Atualização forçada de dependência pode quebrar Workflow

`npm audit fix --force` não é autorizado como solução: a sugestão atual troca a
linha principal do pacote. A correção precisa preservar o contrato do Workflow e
passar pelo harness de retry.

---

## Relatório de execução · 21/08/2026

E1–E17 foram corrigidos e cobertos por regressão. A entrega inclui a migration
aditiva `0007_equal_doctor_doom`, lease com fencing para o Fire Live, crons
fail-closed, sessão transacional, bootstrap do primeiro ADMIN, adapter real do
Mercado Pago, identidade de origem no failover e vínculo correto na curadoria.

Certificação do estado consolidado:

- `npm run lint`, `npm run typecheck` e `npm run boundaries`: aprovados;
- `npm test`: 14 arquivos e 261 testes aprovados;
- `npm run build`: aprovado com Next.js 16.3.1 e Workflow compilado;
- `git diff --check`: aprovado;
- `npm audit --omit=dev`: zero vulnerabilidades;
- smoke HTTP: webhook e cron retornam `503` sem configuração; configuração
  presente com credencial inválida retorna `401`; cron autorizado atravessa a
  guarda e alcança o serviço.

A certificação é local e não autoriza deploy público: o feed pago permanece
aberto por decisão de escopo e só será fechado pela Spec 04.
