# Rastreamento de indicações (cadastro e assinatura), sem pagamento

**Data:** 26/09/2026 · **Status:** aprovada pelo parceiro em 26/09 e executada na branch
`rastreamento-indicacoes` (ainda não mesclada na main nem no ar — ver §10)
**Relacionadas:** [spec de identidade e afiliados (08/09)](2026-09-08-nip-identidade-e-afiliados-design.md),
[ADR-0010](../../adr/0010-afiliados-rastreamento-e-controle.md), auditoria de afiliados de 26/09.

## 1. O que é

> "A gente tem que ter esse dado — não porque a gente vai pagar esse cara, mas a gente tem que ter esse dado.
> E se ele assinar a plataforma, a gente também tem que ter esse dado." — parceiro, 26/09

Registrar, para cada conta da NIP, **quem a indicou** (parceiro convidado ou outro usuário) e, se ela
**assinar**, qual plano, quando e a situação atual. **Nada disso gera comissão ou pagamento.** A comissão
de casa de aposta (D18 da spec de 08/09) continua exatamente como está.

**Critério de sucesso:** o admin vê, por link e por indicador, quantas pessoas se cadastraram e quantas
assinaram, e abre a lista com os nomes.

## 2. Decisões do parceiro (26/09)

| # | Pergunta | Decisão |
|---|---|---|
| 1 | Quem tem link | **Os dois:** parceiros convidados (com painel de afiliado) e **todo usuário** (link pessoal "indique a NIP"). |
| 2 | Quem vê o quê | **Só o admin vê nomes.** O parceiro vê só números (cliques, cadastros, assinaturas). O usuário comum vê só o próprio link. |
| 3 | O que registrar na assinatura | **Plano, data do primeiro pagamento aprovado e situação atual** (ativa, cancelada, vencida). **Sem valores.** |
| 4 | Destino do link | **Direto para o cadastro** (`/cadastrar`). |
| 5 | Cadastro público fechado | **Fechado vale para todos**, inclusive quem vem por link (comportamento de hoje). |
| 6 | Arquitetura | **Um só motor**: indicações usam o rastreamento de afiliados que já existe (cookie, janela, primeiro toque, robôs, conflito). |

## 3. Regras

- **Janela e dono:** vale a regra de hoje — 30 dias a partir do clique, e fica com quem trouxe primeiro
  (`atribuicao.ts`). Quem já tem conta e clica num link **não** muda de indicador.
- **Ninguém se indica.** O clique no próprio link não cria atribuição; o cadastro de uma conta cujo
  indicador seria ela mesma é ignorado.
- **Assinou = primeiro pagamento aprovado.** Registrado uma vez por conta indicada, com plano (nível do
  plano e modalidade) e a data. Pagamentos seguintes não geram novo registro.
- **Situação atual** (ativa, cancelada, vencida) é **lida da assinatura na hora de mostrar**, nunca copiada —
  assim nunca fica desatualizada.
- **Nenhum valor de dinheiro** é gravado nem mostrado no rastreamento de indicação.
- Robôs e pré-visualizações de link continuam não contando (regra de hoje em `http.ts`).

## 4. Dados

- **Indicador usuário:** cada conta pode ter **um** parceiro do tipo `USUARIO`, criado na primeira vez que
  ela abre o próprio link (em `/conta`), com **um link fixo** do tipo `CADASTRO`. Parceiro convidado continua
  `PARCEIRO`. Coluna nova `parceiros_afiliados.tipo` (`PARCEIRO` | `USUARIO`, padrão `PARCEIRO`).
- **Link de cadastro:** `links_afiliados.tipo_destino` ganha o valor `CADASTRO`, que leva a `/cadastrar` e
  **não exige oferta, acordo nem casa ativa**. A campanha desse link não tem oferta (`oferta_id` passa a
  aceitar nulo quando o destino é `CADASTRO`, com CHECK que exige oferta para `NIP`/`CASA`).
- **Assinatura da indicação:** novo tipo de evento `ASSINATURA_NIP` em `eventos_afiliados`, com
  `usuario_id`, `atribuicao_id`, nível do plano, modalidade e a data do pagamento aprovado; único por
  atribuição.
- **Cadastro:** o evento `CADASTRO_NIP` que já é gravado hoje passa a ser lido pelas telas.
- Uma migração aditiva; nada existente é apagado.

## 5. Fluxo

1. Clique em `/r/<código>` de um link `CADASTRO` → grava o clique e o cookie (como hoje) → redireciona para
   `/cadastrar`.
2. Cadastro → liga a conta à atribuição e grava `CADASTRO_NIP` (já existe hoje).
3. Primeiro pagamento aprovado da conta (no ponto em que a reconciliação do Mercado Pago aprova a cobrança)
   → se a conta tem atribuição, grava `ASSINATURA_NIP` com plano e data. Falha nesse registro **nunca**
   atrapalha o pagamento: vai para o log e é refeita na reconciliação seguinte (idempotente pelo único).

## 6. Telas

- **Admin — `/admin/indicacoes` (nova):** uma linha por conta indicada: indicador (parceiro ou usuário),
  link, nome e e-mail do indicado, data do cadastro, se assinou, plano, data do primeiro pagamento,
  situação atual. Filtros: tipo de indicador, indicador, período. Totais no topo (cadastros, assinaturas).
  Só ADMIN (`exigirAdmin`).
- **Admin — `/admin/afiliados`:** criar link do tipo `CADASTRO` para um parceiro; os totais ganham
  cadastros e assinaturas.
- **Parceiro — `/afiliados`:** ganha **Cadastros** e **Assinaturas** (só números) ao lado de cliques.
- **Usuário — `/conta`:** bloco "Indique a NIP" com o link pessoal e o botão copiar. Sem números.
- Vocabulário: "indicação", "cadastro", "assinatura"; nunca "comissão" nessas telas.

## 7. Correções que entram junto (auditoria de 26/09)

1. O login volta a `/afiliados` e a `/afiliados/convite/<token>` (lista de destinos em
   `auth/requisicao.ts`, sem abrir redirecionamento externo).
2. O convite pode apontar para um parceiro criado pelo admin; ao aceitar, a conta é ligada a **ele** em vez
   de criar outro.
3. A tela do convite oferece "Criar conta" que volta ao convite depois do cadastro.

## 8. Testes

Com PGlite, sem mock:
1. Clique num link `CADASTRO` sem nenhuma casa ativa grava o clique e leva a `/cadastrar`.
2. Cadastro depois do clique liga a conta ao indicador e aparece em `/admin/indicacoes`.
3. Primeiro pagamento aprovado grava `ASSINATURA_NIP` uma vez só; o segundo não duplica.
4. Situação atual segue a assinatura (cancelada aparece cancelada).
5. Ninguém se indica pelo próprio link.
6. Quem já tem conta não troca de indicador.
7. Usuário comum não acessa `/admin/indicacoes`; parceiro vê só números, sem nomes.
8. Falha no registro da assinatura não impede o pagamento.
9. Login volta ao convite; convite liga ao parceiro do admin; convite oferece criar conta.
10. Comissão de casa de aposta inalterada (testes atuais seguem verdes).

## 9. Fora do escopo

- Qualquer pagamento, comissão ou repasse por assinatura (D18 continua valendo).
- Mostrar nomes a parceiros ou usuários.
- Reabrir o cadastro para quem vem por link quando o cadastro público estiver fechado.
- Dedupe de cliques (continua como hoje: cada clique conta).

## 10. Registro de execução (26/09/2026)

Feito em 8 tarefas na branch `rastreamento-indicacoes`, com revisão a cada tarefa, mais
uma rodada de correções da revisão final da branch inteira. **Nada disto está no ar:** a
branch ainda não foi mesclada na main nem publicada, e a migração 0035 não foi aplicada em
banco nenhum. Bateria das tarefas (typecheck, lint, boundaries, 231 arquivos de teste,
build) sem erro.

### O que foi construído

- Todo mundo tem um jeito de indicar a NIP: o parceiro convidado usa o link que o admin
  cria; qualquer outra conta ganha, sozinha, um **link pessoal** assim que abre `/conta`.
- O admin vê, em `/admin/indicacoes`, quem indicou quem — com nome e e-mail — se a pessoa
  já assinou, qual plano e a situação atual (ativa, cancelada, vencida). Sem valor em
  dinheiro em lugar nenhum dessa tela.
- O parceiro só vê números (cadastros e assinaturas) no próprio painel; o usuário comum só
  vê o próprio link. Ninguém além do admin vê nome de terceiros.
- Indicação nunca gera comissão — a comissão de casa de aposta continua exatamente como
  era antes, com os mesmos testes passando sem mudar.
- Um convite do admin pode ser endereçado a alguém que já é usuário da NIP (e por isso já
  tem link pessoal). Ao aceitar, os dois viram um só parceiro — sem perder o histórico de
  quem essa pessoa já tinha indicado.
- Três correções da auditoria de 26/09 entraram junto: o login volta para onde a pessoa
  estava (afiliados ou o convite); o convite pode apontar para um parceiro que o admin já
  cadastrou, e o aceite liga a conta a ele em vez de criar outro; e o convite oferece
  "criar conta" para quem ainda não tem uma — só quando o cadastro público está aberto
  (fechado vale para todos, decisão 5).

### Decisões tomadas em seu nome (e o custo de cada uma)

Nenhuma das perguntas abertas do documento original — as 6 respondidas em 26/09 — foi
reaberta. As decisões abaixo são só de encaixe técnico, tomadas para o trabalho poder
seguir sem te interromper a cada detalhe pequeno:

1. **Como fizemos os commits:** um por tarefa, juntando tudo num commit final — do jeito
   que você já tinha pedido antes. Custo: nenhum.
2. **Coluna que passou a aceitar vazio** (a oferta da campanha, para a campanha de
   indicação poder não ter oferta): só ajustamos o necessário para o código compilar, sem
   mudar o comportamento dos links de casa. Custo: nenhum em produção.
3. **O link pessoal em teste/desenvolvimento** aparece com um endereço mais curto
   (`/r/u-abc123`) em vez do completo — só porque nosso ambiente de teste não tem domínio
   configurado. Em produção sai completo. Custo: nenhum.
4. **A trava que impede uma assinatura sem plano** ficou explícita no banco (sem ela, o
   próprio teste que garante isso não pegaria o erro). Custo: nenhum.
5. **Se um parceiro seu (convidado) abre o próprio `/conta`**, o link pessoal que ele
   ganha fica pendurado nele mesmo, não vira uma segunda conta. Custo: no admin, ele
   aparece como indicador "parceiro", não como "usuário" — é o mesmo parceiro, só a
   etiqueta muda.
6. **A trava de "ninguém se indica"** vale para o link pessoal e o de indicação. Para o
   link de casa de aposta, ficou como já era hoje (um parceiro sempre pôde clicar no
   próprio link de casa). Custo: nenhuma mudança de comportamento aí, só não estendemos a
   trava para um lugar que a spec não pediu.
7. **Quando um convite aponta para alguém que já tinha link pessoal**, fundimos os dois
   parceiros num só (o do convite fica, o pessoal some, mas o histórico de indicações
   dele migra junto). Custo se essa decisão estivesse errada: o histórico de quem essa
   pessoa já tinha indicado sumiria ou o cadastro quebraria — por isso testamos esse
   caminho.
8. **A reconciliação de pagamento** agora recebe de onde veio a aprovação (Mercado Pago),
   em vez de escrever isso fixo no código. Custo: nenhum.
9. **A situação mostrada na tela** (ativa/cancelada/vencida) é sempre a mais recente —
   se a pessoa cancelou um plano mensal e depois assinou um de temporada, aparece ativa.
   Custo se essa leitura estivesse errada: a situação apareceria desatualizada numa troca
   de plano — é um caso raro, mas veio testado.
10. **O filtro de indicador em `/admin/indicacoes`** lista só os parceiros convidados no
    menu. Para filtrar por um usuário comum que indicou alguém, você clica no nome dele em
    qualquer linha da tabela: o nome é um link para `/admin/indicacoes?parceiro=<id>`, que
    mostra só as indicações dele (vale também para parceiros convidados). Não há caixa de
    busca. Custo: só dá para chegar a um usuário indicador que já tenha pelo menos uma
    indicação na tela — não dá para escolhê-lo numa lista (são milhares de contas, não
    caberia).
11. **O código do convite foi travado no formato exato que o sistema já gera** (43
    caracteres). Custo: nenhum enquanto não mudarmos como o convite é gerado.
12. **Regras extras da fusão de parceiros:** ela só é recusada se o link pessoal já tiver
    algo comercial nele (acordo, importação, comissão ou repasse pago) — o que, do jeito
    que o sistema funciona, nunca acontece com um link pessoal. Se uma conta que já é
    parceira tentar aceitar um convite de outro parceiro, o convite é recusado. Custo: se
    aparecer alguém em duplicidade por engano, você resolve manualmente — é um caso raro.

### O que você precisa confirmar

- **Item 5 acima:** um parceiro seu que também usa a NIP como assinante aparece no admin
  com um único registro. Se algum dia você quiser separar "o que ele indicou como
  parceiro" de "o que ele indicou como usuário comum", isso não existe hoje — são a mesma
  contagem.
- **Item 10 acima:** confirme que chegar a um usuário indicador clicando no nome dele numa
  linha (em vez de escolher numa lista ou buscar) resolve o seu uso do dia a dia em
  `/admin/indicacoes`.
- **A migração do banco (nº 0035)** precisa ser aplicada antes do próximo deploy — isso já
  está anotado no runbook de afiliados, mas fica registrado aqui também porque, uma vez em
  uso, não dá para desfazer essa migração com segurança.

### O que ficou para depois

Nenhum destes bloqueia o lançamento; são ajustes finos que anotamos para não esquecer:

- Um link pessoal que o admin desativa **continua aparecendo em `/conta`** para o dono
  copiar, e quem clica nele cai em `/oferta-indisponivel`. Ou seja: a pessoa pode seguir
  divulgando um link que não leva mais a lugar nenhum, sem aviso. Hoje só acontece se o
  admin desativar à mão um link pessoal (a tela `/admin/afiliados` nem lista os links
  pessoais de usuário comum);
  vale corrigir antes que isso vire rotina.
- Se o volume de assinaturas para reconciliar crescer muito (hoje o cálculo foi feito para
  até ~10 mil contas), vale otimizar a varredura da reconciliação.
- A validação de data (`periodo.ts`, que já existia antes desta tarefa) aceita algumas
  datas inválidas de um jeito estranho (ex.: rola dia 31 de fevereiro para março); a tela
  de indicações herdou esse comportamento antigo, não é coisa nova.
- Na fusão de parceiros, falta reservar o nome "Link pessoal" para não colidir se você já
  tiver criado uma campanha com esse nome, e faltam alguns testes extras de casos raros
  (cliques simultâneos durante a fusão, por exemplo). Nada disso muda o que a tela mostra
  hoje.
