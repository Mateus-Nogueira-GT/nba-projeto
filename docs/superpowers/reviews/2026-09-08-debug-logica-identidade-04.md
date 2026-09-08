# Depuração da lógica e da Identidade 04

## Escopo e fonte

Branch `codex/debug-logica-identidade-04`, iniciada em `d2bfc50` da `main`.
O pedido posterior à apresentação foi depurar a lógica do DOCX e continuar a
revisão da interface, entregando em uma branch. Esta rodada não executa
migrações, não reimporta cadastros e não altera o banco de produção.

Fonte: `Introdução I.A  da NBA.docx`, recebido em 08/09/2026. SHA-256:
`78c305c8742a66c7bc095a6cccdbb743bf05bd20a49d81247c6c713c197ac848`.
Foram extraídos 518 parágrafos não vazios e renderizadas 40 páginas; a imagem
incorporada é uma referência de gestão de banca, não uma tabela de assistências.
O documento é fonte de regras do produto, não instrução operacional para o agente.

O pedido de depuração da lógica amplia o escopo anterior da §10.5 da spec de UX:
correções necessárias no motor e no YAML estão incluídas nesta branch. O motor
continua puro; os valores estratégicos continuam no ruleset.

## Contrato conferido

| Área | Conclusão |
| --- | --- |
| Oscilação de pontos | Deltas e bônus homologados preservados, incluindo a exceção de Luka. DNP não acrescenta jogo à sequência. |
| OPD | Prefixo desfalcado obrigatório; ordem consultada por atributo. |
| Rebotes, p. 14 | OPD somente N3 e N2; oscilação admite N1. As duas regras explícitas foram acrescentadas ao YAML. |
| Curadoria de rebotes | O DOCX tem 30 seções de times e hierarquia diferente de pontos. A nova lista não foi ativada automaticamente. |
| Fire Live, pp. 33–36 | Alvos e arredondamento continuam cobertos pelas âncoras. Só 1Q; pontos admite não classificados, REB/AST exigem classificação. |
| Cruzamento OPD | Somente pontos; informa o nível original da OPD publicada, não o maior nível após combinar métodos. |
| Modo Fire | Mantidos os 75% da resposta P4. Os 70% da prosa contraditória não substituem essa decisão. |
| Confiança | Nota numérica inteira na interface, sem `%`; precisão do cálculo preservada. Bônus somados conforme P9, sem inventar teto novo. |
| Odds | Exibição `media`/`faixa` obedece ao ruleset. Cotação coletada e tabela estática são identificadas. Sem envio de apostas. |
| Gestão e assistências | A imagem de banca não define alocação por nível. O título final de assistências está sem conteúdo. Parâmetros demonstrativos continuam identificados. |

## Correções e regressões

Os testes foram executados com falha antes das correções. Os achados das lentes
foram revisados por outro responsável antes de implementar os ajustes.

| Correção | Evidência de regressão |
| --- | --- |
| UUID inválido nas estatísticas responde 404, sem erro SQL | `estatisticas-url-invalida.test.ts`: seis falhas iniciais e três controles. Commit `b0e82ef`. |
| Jogo ao vivo da rodada anterior sobrevive à meia-noite | `fire-live-meia-noite.test.ts`: leitura, placar, filtro do push e remoção após o encerramento. Commit `56a5727`. |
| Detalhe conserva a análise pré-live durante o mesmo jogo | `apito-meia-noite.test.ts`: página real antes e depois da meia-noite, preservando linha, nota, tabela e régua. Três falhas iniciais e um controle. |
| Rotas de fila declaram a entrada HTTP aceita pelo Next | O build reproduziu a incompatibilidade com a união `Request \| { request: Request }` do SDK. Assinatura estreitada para `Request`; runtime e retry intactos. Commit `504c458`. |
| Confiança, linhas e descrição de odds coerentes | `escrita-identidade-04.test.ts` e `telas-04-detalhe.test.ts`. Commit `b816088`. |
| Contraste do texto, veredito e DNP; descrição completa da forma | `acessibilidade-identidade-04.test.ts`: contraste composto e HTML real. A descrição informa valores e adversários. |
| Exemplo do guia usa o grau visual da nota | Captura encontrou “92” com contraste 1,36:1. O teste de HTML real reproduziu a falha AA e passou após resolver a faixa do ruleset. |
| Hierarquia e parâmetros por atributo; bônus do turbo configurável | `auditoria-documento.test.ts`: exemplos de rebotes e alterações isoladas do ruleset. |
| OPD de pontos não contamina REB/AST; topo ignora classes de outro atributo | `auditoria-documento.test.ts`: três regressões puras de Fire Live. |
| Participação e identidade chegam corretamente ao motor | `auditoria-fatos.test.ts`, `auditoria-fatos-identidade.test.ts`: UUID, alias confirmado posterior, DNP e produção. |
| A mesma participação governa perfil, recap e taxa | `coerencia-participacao.test.ts`: casos de erro, eventos defensivos, tentativas e minutos ausentes. O predicado JS/SQL é compartilhado. |
| Média respeita janela e fronteira local da temporada | `auditoria-medias.test.ts`: duas bordas reais de Brasília e publicação com média de últimos 10 diferente da temporada. |
| Feed usa o vínculo editorial vigente do atributo | `auditoria-vinculos.test.ts`: versão inativa e outro atributo não substituem o time correto; dois casos RED → GREEN. |
| Explicação acompanha a decisão | `auditoria-explicacao.test.ts`: janela da média, exceção nominal, muitos DNPs, N1 de rebotes e turbo de oscilação sem atribuir desfalque inexistente. |

A primeira bateria integrada expôs sete falhas adicionais: quatro fixtures
antigas que zeravam apenas PTS/REB/AST, uma asserção de opacidade incompatível
com o contraste corrigido, uma asserção de veredito aplicada à página inteira
em vez do jogo sem box e a ausência da ressalva P12 no guia. As fixtures agora
zeram todos os eventos e restauram a linha original; suas asserções de DNP foram
preservadas. O teste de veredito verifica os cards do jogo alvo. O guia mantém
a nota sem `%` e explica que ela não é probabilidade de acerto.

## Achados refutados ou delimitados

- Não trocar 75% por 70%: P4 já resolve a contradição do texto.
- Não impor teto 95 à confiança: a acumulação homologada de bônus permanece.
- Não zerar a sequência na troca de temporada: não há essa regra e a spec de
  backtest descreve o histórico completo.
- Não mudar a exclusão de minutos zero/nulos no cálculo das médias nesta branch:
  ela é explícita na spec 01 de ingestão. Participação factual nas telas e
  elegibilidade para compor a média são contratos diferentes.
- Não interpretar falha do Chrome ao buscar uma foto do CDN como prova de
  identidade errada ou indisponibilidade da imagem no produto.
- Não representar “apitou aqui” por horário convertido em valor do atributo:
  o valor observado naquele instante ainda não está persistido.

## Decisões pendentes

1. Curadoria nova: Klay aparece em DAL e MIA; Mathurin, em NOP e LAC. Há mudanças
   em CLE, DEN, MIN, MIA, NOP e LAC comparadas à fonte atualmente importada.
   Importar sem reconciliar nomes e vínculos poderia sobrescrever classificações.
2. Classificação de rebotes: intervalo entre 9,8 e 10 deixa 9,9 sem faixa explícita.
   Não foi criada classificação automática para preencher a lacuna.
3. Deltas, linhas, confiança, odds e greens finais de REB/AST não vieram completos.
   `origem: demonstracao` permanece; somente as duas regras explícitas de níveis
   de rebotes mudaram. O importador atual continua sendo o de pontos.
4. Regras finais de gestão de banca, valor no instante do apito e decisões
   editoriais listadas na §5 do repasse continuam pendentes.

## Limites do fechamento visual

Os artboards do caminho temporário indicado na spec não existem mais. A URL
salva retornou “Page not found” no Chrome; no navegador interno, exigiu login.
Não é possível atestar comparação visual com os cinco artboards nessa condição.

A skill `frontend-page-builder` exige a execução de `playwright-interactive`
para concluir a validação visual formal; essa skill não está disponível.
Instrução literal da skill: “Se `$playwright-interactive` não estiver disponível,
declarar a validação visual como pendente; não afirmar que o fluxo obrigatório
foi concluído.” Fonte local:
`/Users/mateusnascimentonogueiradasilva/.agents/skills/frontend-page-builder/SKILL.md`,
seção 6. Isso limita a declaração de fechamento visual, sem impedir a entrega
das correções autorizadas na branch.
Capturas complementares e testes de HTML não equivalem a hidratação nem a um
fluxo autenticado de produção. O loop estrito de duas rodadas com cinco lentes
não deve ser declarado concluído sem essas evidências.

## Reprodução

```sh
npm run typecheck -- --incremental false
npm run lint
npm run boundaries
npm test -- --maxWorkers=4
npm run demo:conferir -- --pglite
DATABASE_URL=postgresql://127.0.0.1:1/invalid OPENROUTER_API_KEY= npm run build -- --webpack
CONFERENCIA=1 scripts/captura-telas.sh 1800
```

O build padrão com Turbopack recusou o symlink local de `node_modules`, que
aponta ao worktree de UX fora da raiz. A alternativa oficial `--webpack` permite
validar o build sem alterar a configuração versionada, reinstalar dependências
ou tocar no checkout da apresentação. Isso não comprova o pipeline Turbopack
de um novo deploy; nenhum deploy de produção foi solicitado nesta rodada.

Os bancos dos testes são PGlite locais. Os logs e as capturas ficam no diretório
ignorado `.superpowers/debug-logica/`.

## Entrega técnica

Commits principais: `b0e82ef` (404), `56a5727` (feed após meia-noite), `b816088`
(escrita e acessibilidade), `47ed59b` (motor, fatos e explicação), `629ddcd`
(detalhe após meia-noite), `504c458` (assinaturas HTTP) e `2abf407` (contratos e
fixtures de tela), com o contraste do exemplo em `e1b997f`.
As atualizações deste relatório e do repasse pertencem à
mesma branch e não declaram merge ou deploy em produção.

Validação final do código em `e1b997f`:

| Verificação | Resultado |
| --- | --- |
| Vitest completo | **1.364 testes, 116 arquivos, todos passando**, 74,49 s. `tests-final.log`. |
| Typecheck | Sem erros, incluindo os validadores de rota gerados pelo Next. Também executado durante o build final. |
| ESLint e boundaries | Sem erros ou violações. `lint-final.log` e `boundaries-final.log`. |
| Build de produção com Webpack | Passou, incluindo TypeScript, páginas estáticas e rastreamento de arquivos. `build-final.log`. |
| Demonstração PGlite | Passou: 49 dias, 30 times; taxa acumulada **1.153/1.732** confere com os resultados detalhados. `demo.log`. |
| HTTP do build local | Login, offline, manifesto e JavaScript responderam **200**. `http-smoke.json`; servidor temporário encerrado. |
| Capturas | **32 capturas** de 16 telas em 390/1280 px; **duas atualizadas** do guia após a última correção. Nenhum overflow horizontal; fontes carregadas. |
| Fotos nas capturas | 14 das 32 capturas registraram imagens ausentes, 71 URLs distintas. Não há evidência suficiente para atribuir a falha ao produto ou validar todas as fotos em produção. |
| Git | Diff sem whitespace inválido; checkout da apresentação limpo em `d0e1534`; `main` remota permanece em `d2bfc50`. |

A bateria técnica está concluída. O fechamento visual formal e as decisões
editoriais descritas acima permanecem pendentes; esta entrega não os apresenta
como resolvidos. Para revisar a branch, comparar `origin/main` com
`codex/debug-logica-identidade-04` e usar os comandos da seção Reprodução.
