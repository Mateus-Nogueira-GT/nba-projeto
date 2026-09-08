# NIP — identidade profissional e operação de afiliados

**Data:** 08/09/2026. **Estado:** proposta consolidada para revisão do usuário.
As decisões D01–D18 foram confirmadas no grilling; as soluções técnicas abaixo são
propostas. Não representam implementação, integração contratada ou publicação.

**Plano:** [Etapas de implementação](../plans/2026-09-08-nip-identidade-e-afiliados.md).
**Base inspecionada:** `origin/main`, commit `cc6390a8`; árvore igual à branch de UX
em `517d70a`. Documentos preparados em `codex/spec-nip-afiliados`.

## 1. Resultado esperado

Apresentar a plataforma como **NIP**, sem atribuir a marca a indivíduos, preservando
a metodologia esportiva e os movimentos de desempenho existentes. Criar uma área
independente para controlar uma rede de parceiros afiliados: o administrador
convida parceiros, configura ofertas, cria links, importa resultados e registra
repasses feitos externamente. Cada parceiro consulta apenas sua operação.

O sistema deve responder: qual link foi clicado, qual parceiro originou a atribuição,
se houve redirecionamento para uma casa, quais resultados essa casa informou e qual
parcela foi confirmada e paga ao parceiro. Não prometer comissão garantida por UTM.

## 2. Decisões confirmadas

| ID | Decisão |
| --- | --- |
| D01 | NIP será a marca, com neutralidade profissional e sem referências pessoais públicas. |
| D02 | Manter estilo esportivo, paleta e animações atuais no aplicativo. |
| D03 | Painéis de afiliados e administração mais sóbrios, sob a mesma identidade NIP. |
| D04 | Começar com marca tipográfica NIP; símbolo definitivo fica para depois. Não inventar expansão da sigla. |
| D05 | Manter Lista Secreta, Fire Live, Modo Fire, MVP, All Star, Suporte e Randola, com as regras atuais. |
| D06 | Usar metodologia NIP no lugar das referências públicas a CJ/Mestre da NBA. |
| D07 | Afiliados são parceiros da NIP; cada um terá links e painel individual. |
| D08 | A NIP recebe das casas e repassa a parcela contratada aos parceiros. |
| D09 | Percentual configurável por parceiro e casa/oferta, aplicado à comissão confirmada para a NIP. |
| D10 | Pagamentos externos e manuais. A plataforma serve ao controle, com registros e comprovantes. |
| D11 | Casas e contratos ainda estão em definição; nenhuma integração comercial está confirmada. |
| D12 | Primeira versão com cadastro manual de casas, ofertas e links, importação de relatórios por planilha e confirmação administrativa. |
| D13 | Links podem levar à NIP ou diretamente à casa via redirecionamento rastreado; registrar link clicado e saída para casa. |
| D14 | Atribuição interna ao primeiro afiliado por 30 dias; cliques posteriores ficam no histórico. |
| D15 | Afiliados entram apenas por convite do administrador. |
| D16 | Somente o administrador cria links e campanhas; o afiliado copia e acompanha. |
| D17 | Afiliado vê agregados e lista individual de indicados, com identificação mascarada e informações efetivamente disponíveis. |
| D18 | Suportar CPA, RevShare e híbrido por oferta. Assinaturas e afiliados são áreas independentes. |

**Decisão financeira pendente:** o usuário não sabe ainda se a liberação do repasse
dependerá da confirmação da comissão ou do recebimento pela NIP. Separar esses
eventos; não automatizar elegibilidade nem inventar periodicidade, mínimo ou vencimento.
O administrador registra a liberação manualmente até essa regra ser homologada.

## 3. Referências e ponto de partida

### 3.1 Prints fornecidos

- `Captura de tela 08.09.2026 às 18.12.24 PM.png`: referência para painel individual,
  filtro por período, CPA/RevShare, comissão por casa e lista de indicados.
- `Captura de tela 08.09.2026 às 18.11.19 PM.png`: referência para visão administrativa
  consolidada, filtros de casa/período, funil e campanhas ordenadas por resultado.

Os prints orientam hierarquia de informação, não contratos de API nem regras de
comissão. Não copiar nomes, e-mails, valores ou marcas das referências para seeds.
No painel do parceiro não haverá “Gerar link”, pois D16 reserva essa ação ao admin.
Usar “Indicados”, evitando confusão com jogadores da NBA.

### 3.2 Fatos verificados no código

| Existente | Implicação |
| --- | --- |
| `src/app/manifest.ts`, `src/app/layout.tsx`, páginas e componentes usam IA da NBA, CJ e Mestre da NBA. | Rebrand inclui PWA, metadados e textos, além do logo. |
| `src/modules/dominio/db/schema/odds.ts`: `casas` contém nome, tipo de API e estado. | Reaproveitar identificação da casa; dados comerciais precisam de modelo próprio. |
| BetMGM “Afiliados V2” e Altenar, descritos no runbook, fornecem odds. | Não assumir que oferecem conversões, depósitos ou comissões. |
| `src/app/(app)/apito/[jogadorId]/page.tsx` mostra odds por casa, sem fluxo comercial rastreado. | O redirecionamento comercial é novo. |
| Autenticação e papéis USUARIO/ADMIN já existem. | Acesso do afiliado precisa de permissão própria, sem depender de assinatura. |
| Mercado Pago já processa assinaturas. | Não reaproveitar cobranças de assinatura como comissões ou repasses. |
| Não há implementação de campanhas, UTMs comerciais, cliques, CPA, RevShare ou repasses. | Esta entrega adiciona um domínio, não apenas uma tela. |

### 3.3 Fronteira com decisões anteriores

Preservar o motor puro, o ruleset homologado, os níveis por atributo e a distinção
entre elenco editorial e canônico. Comissão não altera classificação, confiança,
ordem dos apitos ou animações de desempenho.

A implementação deve acrescentar um ADR ligado ao
[`ADR-0004`](../../adr/0004-odds-somente-leitura.md): o novo escopo permite links
comerciais e relatórios de conversão, mas não aposta automática, credencial de
apostador, acesso à conta na casa ou transferência de dinheiro. Identificador
externo pseudônimo de relatório não é autorização para vincular/login na casa.

## 4. Marca e experiência visual

- Criar marca tipográfica NIP com recursos tipográficos existentes e variações
  legíveis para navegação, login, painel e ícone PWA. Não introduzir nova paleta.
- Centralizar textos atuais de marca onde fizer sentido; não criar um sistema de
  white-label. Cobrir title, applicationName, manifest, ícones, navegação, login,
  cadastro, Como funciona, conta, assinatura, estados vazios e futuras notificações.
- Substituir atribuições pessoais por metodologia NIP ou curadoria NIP conforme
  o contexto. Preservar fatos: “time atual” e “time da curadoria NIP” continuam distintos.
- Não fazer substituição textual indiscriminada em IDs, versões de ruleset, chaves,
  dados editoriais ou histórico. Documentos históricos conservam autoria/proveniência;
  instruções e documentação de produto vigentes recebem a terminologia nova.
- Não mudar domínio público, IDs da instalação PWA, origem, URLs de usuário ou
  contratos de assinatura como consequência automática do rebrand.
- Preservar movimentos de desempenho, áudio, preferências e redução de movimento
  já implementados. Painéis comerciais usam transições discretas, sem som nem
  animação celebratória vinculada a depósito, aposta ou comissão.
- Layout responsivo e acessível: foco visível, estado escrito além da cor, valores
  legíveis, tabelas com alternativa em telas pequenas e filtros preservados na URL.

## 5. Acesso e responsabilidades

| Ação | Administrador | Afiliado |
| --- | --- | --- |
| Convidar, ativar e suspender parceiros | Sim | Não |
| Configurar casas, ofertas, contratos e percentuais | Sim | Não |
| Criar/editar/pausar campanhas e links | Sim | Não |
| Copiar links ativos | Todos | Somente os próprios |
| Consultar métricas e indicados | Toda a rede | Somente sua carteira atribuída |
| Importar, reconciliar e confirmar resultados | Sim | Não |
| Registrar recebimento, liberação e repasse externo | Sim | Não |
| Consultar extrato e comprovantes | Todos | Somente os próprios |

Proposta: associação de parceiro à identidade já existente, com estado e permissão
próprios. Uma pessoa pode ser assinante e afiliada; um direito não concede nem revoga
o outro. Reutilizar autenticação, sem colocar o portal sob a guarda de assinatura.

Convite expira e só pode ser consumido uma vez; reutilizar conta existente após
autenticação, sem criar duplicatas por e-mail. Suspensão revoga acesso e novas
campanhas, preservando histórico e obrigações financeiras. Revogar acesso e bloquear
links são estados explícitos, auditados; não apagar comissões para suspender alguém.

## 6. Superfícies propostas

As rotas abaixo são propostas, não rotas existentes.

### 6.1 Portal `/afiliados`

- **Dashboard:** período, casa, campanha, última importação; cliques, saídas,
  cadastros/FTD/QFTD confirmados quando disponíveis; comissão CPA, RevShare,
  confirmada do parceiro e repasses registrados. Oferecer detalhamento da origem.
- **Meus links:** campanhas, destino NIP/casa, oferta, estado e botão Copiar.
- **Minhas ofertas:** condições vigentes atribuídas ao parceiro, sem edição.
- **Indicados:** identificador público mascarado, origem/campanha, primeira interação,
  janela interna, saídas por casa e eventos externos confirmados. Valores individuais
  de depósito só quando recebidos e permitidos para aquela relação comercial.
- **Extrato e repasses:** lançamentos pendentes/confirmados/ajustados, parcelas
  liberadas manualmente, pagamentos externos registrados e comprovantes autorizados.

Não prometer uma lista de nomes de todos os visitantes: tráfego anônimo permanece
anônimo. Não fabricar cadastros na casa a partir de cadastro na NIP. Um relatório
agregado não autoriza inventar resultados por pessoa.

### 6.2 Administração `/admin/afiliados`

- **Visão geral:** filtros por parceiro, casa, oferta, campanha e período; separar
  receita da NIP, parcela dos parceiros, recebimentos e repasses externos.
- **Parceiros:** convite, acesso, ofertas atribuídas e condições versionadas.
- **Casas e ofertas:** cadastro comercial, destino homologado, documentação, tipo
  de comissão, estado de configuração e disponibilidade do rastreamento externo.
- **Campanhas e links:** criar destinos NIP/casa, UTMs, vínculo ao parceiro e estados.
- **Importações e conciliação:** enviar planilha, mapear colunas, prévia, erros,
  duplicidades, divergências e confirmação de resultados comerciais.
- **Recebimentos e repasses:** registrar fatos externos, evidências e alocação dos
  pagamentos às comissões. Histórico de ajustes e auditoria consultável.

“Atualizar dados” atualiza a leitura interna e informa a data da última importação.
Não sugere sincronização com casas ainda não integradas. Cadastro incompleto fica
como rascunho; dados de demonstração são identificados e separados dos reais.

## 7. Links, atribuição e limites de observação

### 7.1 Dois percursos

```text
Link do parceiro → NIP/r/{codigo} → página pública NIP
                                     ↓ ação explícita na oferta
                                  NIP/ir/{codigo} → casa

Link do parceiro → NIP/r/{codigo} → casa
```

O código identifica configuração persistida pelo admin, não uma URL livre na query.
Campanha, link, parceiro, oferta, destino e versão precisam ser recuperáveis pelo
histórico mesmo se o nome da campanha mudar.

A entrada NIP deve ser pública, com identidade/oferta e continuidade para a casa,
sem exigir assinatura. A posição de CTAs dentro das telas esportivas não foi
homologada: não espalhar botões de casas pela interface nesta entrega. O percurso
de entrada pública e sua saída rastreada já deve funcionar ponta a ponta.

### 7.2 Eventos distintos

| Evento | O que comprova |
| --- | --- |
| Clique no link | Requisição observada pelo redirector; pode incluir acesso automatizado. |
| Visita à página NIP | Chegada observada à página da NIP, quando mensurável. |
| Saída para a casa | Resposta de redirecionamento emitida para destino validado. |
| Cadastro NIP | Cadastro local associado a uma atribuição válida; não é cadastro na casa. |
| Cadastro/FTD/QFTD externo | Evento informado pelo relatório da casa e reconciliado. |
| Comissão confirmada | Resultado comercial importado e confirmado pelo administrador. |

Uma resposta de redirecionamento não comprova carregamento da casa, abertura do app,
cadastro, depósito ou direito a comissão. A interface usa “Saídas para a casa”.
Chegada externa somente será exibida se houver evidência específica do parceiro.

### 7.3 Primeiro afiliado, janela de 30 dias

- Fixar o primeiro afiliado válido e o instante inicial; cliques posteriores não
  renovam a janela nem substituem seu titular. Guardar também o link realmente
  clicado em cada evento, mesmo quando pertence a outro afiliado.
- Proposta de precisão: janela `[inicio, inicio + 30 dias)`, calculada em UTC.
  No limite exato está expirada. Um novo clique elegível depois disso inicia outra
  janela. Preservar todas as janelas para auditoria.
- Persistir associação no servidor e usar identificador opaco em cookie seguro
  próprio da NIP; não aceitar atribuição declarada apenas por UTM, query ou cliente.
- Quando houver cadastro/login, associar o histórico identificável sem estender o
  prazo. Proposta: preservar a atribuição válida mais antiga com prova de vínculo;
  conflitos entre contas/dispositivos viram pendência, nunca fusão por IP ou nome.
- Sem cookie, sessão ou identificador externo confiável, registrar a saída observada
  e a limitação; não garantir continuidade entre dispositivos ou após limpeza de dados.
- Se A originou a janela e a pessoa clicou B no dia 10, registrar B como link clicado
  e A como titular interno. A conciliação precisa distinguir os dois.
- Atribuição interna não sobrescreve atribuição comercial do relatório. Se o retorno
  indicar B, houver divergência ou faltar evidência, manter em conciliação sem gerar
  comissão confirmada automaticamente para A ou B.

### 7.4 UTMs e identificadores comerciais

UTMs descrevem origem/canal/campanha. O Google documenta esse uso para identificar
campanhas de tráfego; isso não estabelece direitos comerciais de afiliados.
[Referência: parâmetros de campanha](https://support.google.com/analytics/answer/10917952?hl=en).

Proposta: o admin configura UTMs por campanha e o sistema guarda IDs opacos de link,
clique e saída. Os nomes de parâmetros aceitos pela casa (subID, click ID ou equivalente)
serão configurados somente após obter documentação/homologação. Não inventar um
parâmetro universal nem presumir que a casa o devolverá no relatório.

Preservar IDs de afiliado e parâmetros obrigatórios do link homologado. Detectar
colisões em vez de sobrescrever valores silenciosamente. Não colocar nome, e-mail,
CPF, credenciais ou IDs internos de conta nas UTMs/URLs. Registrar nível de cobertura:
somente clique, campanha reconciliável ou conversão individual reconciliável.

### 7.5 Redirecionamento seguro e eficiente

- Resolver código para destino HTTPS cadastrado, com lista explícita de hosts
  homologados. Bloquear destinos arbitrários, URLs com credenciais e esquemas não
  autorizados. Esse desenho segue a recomendação da
  [OWASP sobre redirecionamentos](https://cheatsheetseries.owasp.org/cheatsheets/Unvalidated_Redirects_and_Forwards_Cheat_Sheet.html).
- Não buscar a URL externa no servidor durante o clique. Persistir o evento e emitir
  redirecionamento temporário sem cache público, sem aguardar API comercial.
- Não colocar scripts de analytics na rota crítica. Links de tracking não usam
  prefetch; HEAD, preview e automação identificada não contam como cliques humanos
  confirmados. Manter contagens observadas e qualificação claramente nomeadas.
- Link inexistente/pausado ou oferta encerrada mostram estado claro, sem fallback
  silencioso para outra casa. Falha de registro oferece nova tentativa; não indicar
  “rastreamento concluído” quando o evento não foi persistido.
- Site HTTPS da casa é o destino inicial. Deep link para app/evento/mercado exige
  suporte documentado e teste de preservação do rastreamento; fica para integração.

## 8. Planilhas e conciliação

### 8.1 Contrato de importação proposto

Começar por CSV UTF-8 exportável de planilhas, com template NIP e mapeamento de colunas.
XLSX nativo pode entrar se amostras reais justificarem a dependência; não executar
macros, fórmulas ou conteúdo ativo. Upload possui limites definidos e testados.

Campos canônicos, condicionais conforme granularidade: casa, oferta/versão, período,
moeda, tipo de comissão, ID externo do evento/linha, referência comercial/campanha,
ID pseudônimo do indicado quando disponível, datas dos eventos, CPA, RevShare e
estado informado pela fonte. O lote registra arquivo/checksum, responsável, datas,
mapeamento e origem. Limites exatos de tamanho/linhas serão fixados em P0.

- Valor ausente é “não informado”; zero é zero confirmado. Não preencher lacunas.
- Interpretar formatos de moeda/data explicitamente; rejeitar ambiguidades.
- Relatório agregado pode alimentar totais apenas se a granularidade estiver clara.
  Sem vínculo inequívoco com parceiro/oferta, fica pendente de conciliação e não rateia.
- IDs fornecidos pela casa têm namespace por casa/contrato. Nome ou e-mail parecido
  não prova vínculo. Ajuste manual exige evidência e trilha de auditoria.
- Toda linha recebe resultado: válida, pendente, rejeitada ou duplicada. Mostrar
  prévia e diferença de totais antes da confirmação. Upload não confirma comissão.
- Reimportar o mesmo arquivo ou evento não duplica saldo. Para relatório agregado,
  usar chave de período/granularidade e versão; arquivo revisado é substituição
  auditada/ajuste, não soma cega. Não misturar total e detalhamento como novas receitas.
- Correções e cancelamentos geram lançamentos vinculados ao original. Nunca apagar
  linhas confirmadas/pagas nem executar rollback destrutivo para corrigir importação.

### 8.2 Definições comerciais

CPA, RevShare, híbrido, FTD e QFTD são rótulos suportados, com condições dependentes
do contrato. Não presumir depósito mínimo, receita líquida, qualificação, deduções,
tributação, negativos, câmbio, vencimento ou carryover. Ausência de condição impede
cálculo inferido, mas permite registrar o valor documentado pela fonte.

Os totais de CPA e RevShare da NIP são diferentes da parcela devida ao parceiro.
Se uma fonte fornecer somente o total híbrido, exibir componente não informado;
não dividir por suposição nem somar o total novamente aos componentes.

## 9. Comissões, recebimentos e repasses

- Versionar o acordo parceiro/oferta com percentual, vigência e moeda. Validar
  percentual de 0 a 100; não definir valor padrão de negócio.
- Base: comissão confirmada para a NIP. Parcela do parceiro = base elegível ×
  percentual do acordo aplicável. Registrar base, percentual/versão e resultado.
- Proposta técnica: dinheiro decimal exato ou unidades mínimas; arredondamento
  explícito e testado. Somar valores contabilizados, não recalcular percentuais no UI.
  Não somar moedas diferentes nem converter sem política homologada.
- Marco de vigência do acordo (clique, conversão ou competência) ainda exige decisão
  comercial. Até lá, cada conciliação deve identificar explicitamente a versão do
  acordo aplicável; uma alteração atual não recalcula comissões históricas.
- Separar eixos: resultado importado; comissão pendente/confirmada/ajustada;
  recebimento da casa parcial/integral; liberação manual do repasse; registro de
  pagamento ao parceiro parcial/integral. Não usar um único status para tudo.
- “Confirmado”, “recebido pela NIP”, “liberado manualmente”, “pago externamente” e
  “saldo confirmado não pago” têm rótulos diferentes. Evitar “disponível” enquanto
  a política de liberação estiver pendente.
- Registro de repasse inclui parceiro, moeda, valor, data, responsável, referência
  externa/comprovante e alocação às comissões. Suportar pagamento parcial sem
  ultrapassar o saldo liberado e sem duplicar liquidação em requisições concorrentes.
- Não exigir conta bancária/PIX armazenado para controlar pagamento externo. O
  registro confirma que o administrador informou um fato, não que a NIP executou PIX.
- Ajuste após pagamento preserva o pagamento e abre divergência. Política de
  compensação de estorno permanece pendente, sem débito automático do próximo repasse.

## 10. Arquitetura proposta

Permanecer no monolito Next/Drizzle/Postgres; evitar microserviço, novo provedor de
auth ou fila para um fluxo ainda manual. Nomes abaixo são propostas a validar em P0.

| Área | Responsabilidade |
| --- | --- |
| `src/modules/dominio/db/schema/afiliados.ts` | Schema comercial e constraints; referenciar `casas`/`usuarios` existentes. |
| `src/modules/plataforma/afiliados/` | Permissões, convites, campanhas, atribuição, importação, comissões e repasses, organizados por responsabilidade. |
| `src/app/(afiliados)/afiliados/` | Portal com guarda própria. |
| `src/app/(admin)/admin/afiliados/` | Administração da rede e conciliação. |
| `src/app/r/[codigo]/route.ts`, `src/app/ir/[codigo]/route.ts` | Adaptadores finos para entrada e saída rastreadas. |
| `src/components/afiliados/` | Filtros, indicadores, tabelas e estados comuns aos painéis. |

Entidades mínimas: parceiro, convite, oferta comercial, acordo versionado, campanha,
link, janela de atribuição, evento de clique/saída, lote e item importado, lançamento
de comissão, registro de recebimento, repasse/alocação e auditoria. Detalhar schema
sem tabela para cada estado; limitar índices às consultas e unicidades necessárias.

Autorização no servidor em cada leitura/mutação/download, com filtros por parceiro
derivados da sessão. Mascaramento na projeção do servidor, não apenas via CSS.
Comprovantes e relatórios em armazenamento privado; selecionar o mecanismo em P0.
Não expor arquivos pelo diretório `public/` ou por URL pública permanente.

Persistência financeira em transações e com constraints de idempotência. Auditoria
registra responsável, instante, entidade, motivo e alterações relevantes. Evitar
dados pessoais em logs e URLs; aplicar retenção definida antes do uso real.

## 11. Critérios de aceite

| ID | Cenário e comportamento esperado |
| --- | --- |
| A01 | NIP aparece em marca/metadados/PWA e textos públicos atuais; nomes pessoais não aparecem como autoria comercial. |
| A02 | Os mesmos fatos e ruleset produzem os mesmos níveis/apitos; identidade canônica/editorial e motion acessível permanecem corretos. |
| A03 | Afiliado convidado entra sem assinatura; conta comum não ganha acesso; A não consulta dados/comprovantes de B por URL/API. |
| A04 | Afiliado copia links, mas não cria campanha, altera destino/percentual ou importa resultados. |
| A05 | Link para NIP registra origem e saída posterior para casa; link direto registra clique/saída com a mesma trilha. |
| A06 | A no dia 0 e B no dia 10: titular A, histórico inclui B; dia 30 exato expira, sem renovação por clique intermediário. |
| A07 | UTM adulterada não muda o titular; destino arbitrário não redireciona; link desativado não aponta para outra casa. |
| A08 | Falta de identificação entre dispositivos é explícita; cadastro NIP não vira cadastro/depósito externo. |
| A09 | Relatório válido pode ser pré-visualizado e confirmado; arquivo/evento repetido não duplica resultado. |
| A10 | Relatório agregado, sobreposição de período, revisão e conflito A/B não geram rateio silencioso. |
| A11 | CPA/RevShare/híbrido mostram apenas componentes informados; falta de contrato mantém pendência sem valor inventado. |
| A12 | Percentual versionado preserva histórico; dinheiro e moedas são exatos; total do parceiro não se confunde com total NIP. |
| A13 | Recebimento e repasse são independentes; liberação é manual; pagamento parcial/concorrente não duplica liquidação. |
| A14 | Estorno posterior mantém trilha e não executa compensação/pagamento automático. |
| A15 | Indicados aparecem mascarados, com eventos disponíveis; relatório agregado não inventa linhas individuais. |
| A16 | Filtros/períodos têm os mesmos limites nos cards, tabelas e extrato; estados sem dados/erro/atraso são distinguíveis. |
| A17 | Dashboard, importação e portal funcionam por teclado e em 390/1280 px; painéis não reproduzem áudio esportivo. |
| A18 | Sem parceiro comercial homologado, ofertas ficam em rascunho e dados de teste não entram em receitas reais. |

## 12. Pendências e limites

| Pendência | Efeito e tratamento |
| --- | --- |
| Casas, contratos e links oficiais | Não ativar oferta comercial real antes da homologação. Não usar API de odds como prova. |
| Parâmetros e amostras de relatórios | Template NIP/fixtures permitem desenvolver; rastreio externo e granularidade dependem de evidência real. |
| Critério de liberação do repasse | Mantido em aberto pelo usuário; sem automatização, liberação registrada manualmente. |
| Percentuais, qualificação e marco de vigência | Campos/versões sem defaults comerciais; conciliação exige regra aplicável identificada. |
| Estornos, impostos, mínimos e calendário | Não deduzir, compensar nem prometer prazo automaticamente. |
| Uso/retenção de dados individuais | Definir dados permitidos e acesso antes de importar pessoas reais; usar fixtures sintéticas no desenvolvimento. |
| Conflitos entre dispositivos/identidades | Proposta conservadora em §7.3; casos ambíguos ficam em conciliação. |
| CTAs dentro de telas esportivas e deep links | Não definidos; primeira versão cobre entrada pública/saída HTTPS, sem inserções em massa. |
| Símbolo e domínio definitivos | Marca tipográfica NIP nesta entrega; sem migração de origem. |

Fora do escopo: execução de apostas, movimentação bancária/PIX, rede multinível,
afiliados criando links, inscrição pública de parceiros, APIs comerciais presumidas,
alteração da assinatura ou da metodologia esportiva e liquidação automática.

## 13. Revisão final

Este documento consolida o entendimento para o usuário confirmar antes de executar
o plano. Pendências comerciais são condições explícitas de ativação, não decisões
silenciosamente preenchidas pelo implementador. A base técnica pode ser construída
com dados sintéticos após aprovação, sem exigir contratos ainda inexistentes.
