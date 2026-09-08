# UX de transmissão e identidade oficial — plano de implementação

**Spec:** [Decisões e critérios de aceite](../specs/2026-09-08-ux-transmissao-e-identidade-oficial-design.md).
**Estado:** P1–P8 implementados em 08/09/2026; P9 aguarda homologação comercial;
P10 concluiu automação e capturas, com a matriz interativa ainda pendente.
**Base inspecionada:** `c49c96d`, `codex/ux-ao-vivo-identidade`, worktree
`nba-projeto-debug`. Revalidar Git e migrações ao iniciar a implementação.

## 1. Estratégia

Entregar por incrementos revisáveis: identidade → preferências mínimas → Ao Vivo →
interações/áudio → Entradas/Stats/Perfil/Resultados → Gestão → integração.
Reutilizar a identidade visual e os componentes existentes. O plano descreve nomes
**propostos** de novos módulos; conferir os padrões locais antes de criá-los.

Somente este documento e a spec são entregues agora. Não executar as tarefas abaixo,
instalar dependências, alterar dados ou publicar como consequência de criar o plano.

### Registro de execução de 08/09/2026

| Etapa | Estado | Evidência principal |
| --- | --- | --- |
| P1 | concluída com uma pendência explícita | catálogo oficial por `personId`, projeção em lote e `npm run identidades:relatorio`; Wiggins permanece sem vínculo inferido |
| P2 | concluída | migration aditiva `0018`, APIs autenticadas e testes de upgrade/rollback em PGlite |
| P3–P5 | concluídas | um jogo selecionado, painel sticky, quadra, cartões por alvo, motion, áudio coordenado e acompanhamento otimista |
| P6 | concluída | URL e consultas unificadas para últimos 5, últimos 10 e temporada |
| P7 | concluída | painel de experiência, acompanhados e filtros aplicados ao fan-out |
| P8 | concluída | resumo e filtros por estratégia, atributo e time com linha prevista versus observado |
| P9 | bloqueada pela spec | falta homologar comprometimento/liberação, DNP/cancelamento, encerramento e significado de disponível |
| P10 | parcial | 1.447 testes, lint, typecheck, boundaries, build Webpack e capturas 390/1280 verdes; áudio real, duas abas e toda a matriz interativa ainda exigem navegador autenticado |

O registro acima substitui a instrução histórica de “somente plano” para esta execução,
explicitamente autorizada pelo usuário. Nenhuma migration foi aplicada em ambiente externo.

### Regras de execução

- Ler `CLAUDE.md`, `docs/01-arquitetura.md`, `docs/02-motor-regras.md` e a spec.
- Preservar o checkout `nba-projeto` da apresentação. Trabalhar no worktree de
  desenvolvimento; se for preciso outro, usar branch com prefixo `codex/`.
- Comparar a base com `origin/main` e com a branch de UX antes de reaplicar mudanças
  que já existam. Não assumir que preview, main e produção têm o mesmo SHA.
- Não tocar em `src/modules/motor/**` ou regras de estratégia para obter efeito visual.
- Não converter nomes em chaves de entidade nem trocar elenco editorial por canônico.
- Não alterar a cardinalidade da Lista/Resultados ao manter cartão por alvo no Ao Vivo.
- Mudanças de banco devem ser aditivas quando possível, com migration e reversão.
  Reconciliação destrutiva/ambígua exige relatório e resolução antes da escrita.
- Campos de preferência e fontes de eventos são contratos versionados; não inventar
  endpoints de fornecedor, thresholds esportivos ou fórmulas de gestão.
- Testar comportamentos e regressões, evitando testes que só copiem CSS/implementação.
- Um commit coeso por tarefa concluída, com arquivos explícitos e revisão do staged
  diff. Não usar autoria fictícia nem herdar regras de branch de planos históricos.

## 2. Dependências

| Etapa | Depende de | Entrega |
| --- | --- | --- |
| P0 | — | Inventário, fixtures e contratos mínimos |
| P1 | P0 | Identidade oficial e aliases seguros |
| P2 | P0, P1 para reconciliação | Preferências e acompanhamento por conta |
| P3 | P1, P2 | Ao Vivo com um jogo e painel persistente |
| P4 | P3, P2 | Motion e áudio deduplicados |
| P5 | P1, P2 | Entradas com acompanhamento |
| P6 | P1 | Stats com 10/5/temporada |
| P7 | P2, P4 | Perfil e elegibilidade de alertas |
| P8 | P1 | Resultados e filtros coerentes |
| P9 | P0 + decisões de Gestão | Estados persistentes e desfazer |
| P10 | P1–P9 | Integração e validação da jornada |

P5, P6 e P8 podem ocorrer em paralelo após estabilizar contratos compartilhados;
P9 não deve bloquear P1–P8. Se usar subagentes, atribuir ownership separado e
revisar os resultados na raiz. Não editar simultaneamente schemas, barrel exports
ou componentes compartilhados sem coordenação.

## P0. Inventário, contratos e cenários

**Ler:** `src/modules/dominio/db/schema/{dominio,editorial,plataforma,motor,fire-live}.ts`,
`src/modules/ingestao/demo/{cadastro,dados,fotos}.ts`,
`src/modules/ingestao/sincronizar/identidade.ts`,
`src/modules/entrega/{lista-secreta,lista-por-jogo,gestao,resultados}.ts`,
`src/modules/entrega/fire-live/leitura.ts`, `src/components/AtualizarAoVivo.tsx`.

- [ ] Conferir diff/base, scripts, migrações atuais e ambiente de teste isolado.
- [ ] Mapear todos os leitores/escritores de nome e as referências por UUID, incluindo
      snapshots, narrativas, push, curadoria e chamadas ao seed.
- [ ] Registrar contratos propostos para identidade, preferência, seleção de jogo,
      evento apresentado e registro de Gestão. Campos novos não são existentes hoje.
- [ ] Definir fixtures PGlite com duas pessoas de mesmo sobrenome, dois jogos em Q1,
      vários alvos do mesmo jogador, sem foto, nome longo, jogo agendado/encerrado,
      DNP, atraso, correção de placar e virada de rodada.
- [ ] Preparar harness de sequência de snapshots com relógio controlado e porta de
      áudio substituível nos testes; o navegador deverá usar áudio real.

**Saída:** mapa de impacto e contrato de cada fronteira. **Aceite:** nenhuma chamada
externa ou escrita em produção necessária para reproduzir os cenários.

## P1. Nomes oficiais, aliases e reconciliação

**Existentes:** `src/modules/dominio/db/schema/dominio.ts`,
`src/modules/ingestao/demo/{cadastro,dados,fotos}.ts`,
`src/modules/ingestao/niveis/{importar,parser}.ts`,
`src/modules/ingestao/sincronizar/identidade.ts`,
`src/modules/dominio/fatos-editoriais.ts`,
`src/app/(admin)/admin/mapeamento/page.tsx` e
`src/app/(admin)/admin/mapeamento/acoes.ts`.
**Propostos:** catálogo curado de identidades/aliases, resolução de nomes de
apresentação em lote e comando de reconciliação com modo somente relatório.

- [ ] Verificar nomes esportivos e IDs nas fontes oficiais. Guardar fonte e evidência;
      não converter comentários do mapa de fotos em autoridade sem conferência.
- [ ] Criar testes que exponham duplicação ao renomear/reexecutar seed e colisão de
      sobrenome; preservar aliases usados em regras/editorial.
- [ ] Resolver por identidade externa/vínculo confirmado. Preservar UUID quando a
      pessoa já está corretamente representada. Definir projeção/coluna de nome
      oficial conforme o inventário, sem N+1 nem import de ingestão no frontend.
- [ ] Adaptar seed, import e aplicação de fotos para não dependerem da grafia exibida.
- [ ] Wiggins: produzir relatório de referências e evidência de atribuição; tratar
      conflito da UNIQUE nome/provedor antes de inserir o segundo vínculo. Criar
      fixture do split e ensaiar rollback. Não copiar histórico para duas pessoas.
- [ ] Migrar somente identidades resolvidas; manter pendências explícitas para casos
      sem evidência. Prever leitura compatível durante implantação gradual.
- [ ] Aplicar nome oficial na entrega, busca, perfil, detalhe, Gestão, Resultados,
      lista de acompanhados e montagem de novos pushes. Narrativas antigas com alias
      devem ser revisadas pela apresentação, sem regeneração geral de LLM por padrão.
- [ ] Verificar renomear → ler feed antigo → reexecutar seed/import → ler novamente:
      UUIDs, contagens de fatos, atribuições e chaves de apito permanecem corretos.

**Testes existentes:** `src/modules/ingestao/__tests__/demo-fotos.test.ts`,
`src/modules/ingestao/__tests__/demo.test.ts`, testes de sincronização/identidade,
`src/modules/entrega/__tests__/lista-secreta.test.ts` e suites de telas.
**Saída:** AC01; relatório de pendências separado de falhas técnicas.

## P2. Preferências e acompanhamento

**Existentes:** `src/modules/plataforma/preferencias.ts`,
`src/modules/plataforma/jogadores-ocultos.ts`,
`src/modules/dominio/db/schema/plataforma.ts`,
`src/app/(app)/preferencias/acoes.ts`, `src/app/(app)/fire-live/acoes.ts`.
**Propostos:** relações de jogadores/times acompanhados, preferências de motion/áudio
por conta e serviço de acompanhamento autenticado. Schema final definido em P0.

- [ ] Testar defaults e precedência: URL de navegação > preferência; movimento do
      sistema reduzido > intensidade; mute salvo > default de som ligado.
- [ ] Estender preferências preservando ordem/lente existentes; ausência de linha
      continua válida. Persistir som, volume e intensidade com validação finita/range.
- [ ] Criar acompanhamento positivo idempotente por usuário/jogador. Times seguidos
      não expandem automaticamente para todo o elenco.
- [ ] Preservar `jogadores_ocultos`: não os converter em favoritos nem em opt-out de
      push. Acompanhar explicitamente reexibe o jogador; deixar de seguir não oculta.
- [ ] Autorizar todas as escritas pela sessão; testar usuário A não alterando B,
      IDs inválidos, retries, falha de rede e rollback de atualização otimista.
- [ ] Gerar/revisar migrações e executar upgrade/rollback em banco isolado; sem
      aplicar no banco publicado durante desenvolvimento ou testes.

**Testes existentes:** `src/modules/plataforma/__tests__/{preferencias,jogadores-ocultos}.test.ts`,
`src/app/__tests__/preferencias-acoes.test.ts`.
**Saída:** AC06/AC09, contrato pronto para telas e fan-out.

## P3. Ao Vivo: seletor, estado e painel sempre visível

**Existentes:** `src/app/(app)/fire-live/page.tsx`,
`src/modules/entrega/fire-live/leitura.ts`,
`src/design-system/componentes/{CabecalhoJogo,QuadraAoVivo,CardEntrada}.tsx`,
`src/components/navegacao/{Moldura,BarraInferior,FaixaDemonstracao}.tsx`,
`src/components/AtualizarAoVivo.tsx`.
**Propostos:** seletor de jogos, painel de jogo e controlador client de sessão ao vivo.

- [ ] Escrever testes da seleção/fallback definidos na spec, incluindo jogo inválido,
      filtros vazios, horário empatado, fim de Q1, meia-noite e voltar/avançar.
- [ ] Preservar leitura/autorização no servidor; passar DTO mínimo ao controlador
      client. Usar a query `jogo` existente e manter filtros válidos.
- [ ] Renderizar um jogo ativo. Seleção manual sobrevive ao refresh e ao fim de Q1.
      Apito de outro jogo só atualiza indicador, sem navegação automática.
- [ ] Integrar painel sticky com nomes/logos, placar Q1 e quadra existente. Compactar
      para celular/paisagem e reservar espaço para safe areas e barra inferior.
- [ ] Preservar um cartão por alvo; acrescentar destaque/filtro de acompanhados.
- [ ] Implementar vazios, sem placar, erro/atraso/offline e foco de teclado.
      Usar estado de atualização real; não criar cronômetro ou posse fictícios.
- [ ] Montar o refresh existente em fronteira estável; não introduzir timers por
      jogador e não trocar intervalo para simular tempo real.

**Testes existentes:** `src/app/__tests__/telas-04-firelive.test.ts`,
`src/modules/entrega/__tests__/fire-live-meia-noite.test.ts` e suites de Fire Live.
**Saída:** AC02/AC03/AC04, conferência de rolagem com painel sempre presente.

## P4. Movimento e áudio por evento

**Existentes:** `src/app/globals.css`, `src/design-system/tokens/{componente,semantico}.ts`,
`src/design-system/componentes/{CardEntrada,BarraAlvo,QuadraAoVivo}.tsx`,
`src/components/AtualizarAoVivo.tsx`, `src/components/pwa/push-cliente.ts`, `public/sw.js`.
**Propostos:** comparador de snapshots/eventos de apresentação, controlador de áudio
em foreground, asset curto de apito com origem/licença documentada.

- [ ] Testar sequências: baseline, aumento, repetição, evento simultâneo, troca de
      jogo, correção para baixo, timestamp antigo, reconexão e encerramento do Q1.
- [ ] Gerar eventos visuais a partir de identidades e flags existentes; nunca
      recalcular limiar de Modo Fire no componente. Se faltar timestamp, rotular
      detecção na atualização, sem horário esportivo inventado.
- [ ] Deduplicar evento e som por conta/rodada, com memória limitada e limpeza no
      logout. Coordenar múltiplas abas; prever fallback para API não suportada.
- [ ] Implementar transições finitas de placar/progresso, efeito forte no alvo,
      ativação Fire e hover/foco. Corrigir valores para baixo de forma neutra.
- [ ] Aplicar intensidade e preferência do dispositivo; foco e texto permanecem
      úteis sem animação. Medir que não há timers/loops por cartão.
- [ ] Som default ligado, volume/mute/teste, desbloqueio por gesto e tratamento de
      rejeição do navegador. Um lote de apitos produz um som curto, sem sobreposição.
- [ ] Separar foreground de push/OS: não prometer áudio customizado em background,
      não tocar backlog ao voltar e não pedir permissão de push para tocar áudio local.
- [ ] Cobrir a matriz da spec §6.4: exclusão de jogador/atributo/canal vale no som
      e no push, mas mute de áudio não desliga push e ausência de inscrição não
      impede áudio local. Cartões continuam visíveis.
- [ ] Testar no navegador áudio real bloqueado/liberado, volume, mute, duas abas e
      reduced-motion. Não aceitar apenas spy de função ou HTML renderizado no servidor.

**Saída:** AC05/AC10. Evidência de que eventos repetidos não repetem som/efeito.

## P5. Entradas com acompanhamento

**Existentes:** `src/app/(app)/page.tsx`, `src/design-system/componentes/CardEntrada.tsx`,
`src/components/navegacao/FolhaDeFiltros.tsx` e ações/serviços de P2.

- [ ] Integrar nome oficial e acompanhar jogador com estado otimista e reversão.
- [ ] Preservar agrupamento atual por jogador/atributos, links e lentes.
- [ ] Aplicar entrada/selo apenas a novos apitos identificados, preservando rolagem.
- [ ] Testar filtros, nomes longos, acompanhamento de jogador com múltiplos alvos,
      retorno do perfil e falha de gravação.

**Teste:** `src/app/__tests__/telas-04-lista.test.ts`. **Saída:** AC01/AC06.

## P6. Stats e períodos

**Existentes:** `src/app/(app)/estatisticas/page.tsx`,
`src/app/(app)/estatisticas/jogador/[id]/page.tsx`,
`src/modules/entrega/estatisticas/{jogador,rotas}.ts` e componentes estatísticos atuais.

- [ ] Definir recorte na URL e default 10 independente da lente ULT5 da Lista.
- [ ] Adaptar consulta para 5/10/temporada, sem truncar temporada no limite atual
      do histórico e sem afirmar média de temporada com amostra parcial.
- [ ] Unificar recorte de gráfico/resumo; explicitar quantidade disponível, DNP,
      pendente, zero real e paginação/limite quando necessário.
- [ ] Integrar busca por aliases e links de partida com retorno ao contexto anterior.
- [ ] Mostrar linha contextual somente com período/atributo compatíveis e fonte
      identificada; não reutilizar alvo Q1 num gráfico de jogo inteiro.
- [ ] Testar recortes, jogador com menos de 5 jogos, nomes oficiais, navegação e
      correção dos totais. Não acrescentar comparação de jogadores nesta rodada.

**Teste:** `src/app/__tests__/telas-04-estatisticas.test.ts`. **Saída:** AC07.

## P7. Perfil e preferências de notificações

**Existentes:** `src/app/(app)/conta/{page.tsx,acoes.ts}`,
`src/app/api/push/preferencias/route.ts`,
`src/modules/entrega/push/{contrato,fanout}.ts`,
`src/modules/plataforma/push/inscricoes.ts`.

- [ ] Montar controles de acompanhamento, animação, som, volume e teste, conservando
      assinatura, dispositivos e preferências atuais de notificação.
- [ ] Definir filtros de alerta explicitamente na UI. Acompanhar sozinho não muda
      o fan-out atual; mostrar o alcance de “apenas acompanhados”.
- [ ] Preservar canais existentes e contrato do payload. Apito/green têm jogador;
      Lista Secreta hoje tem dados vazios: não aplicar filtro de jogador como se
      houvesse esse campo. Nesta rodada, filtros jogador/atributo valem para canais
      identificáveis; aviso geral da Lista permanece no controle do seu canal.
- [ ] Aplicar elegibilidade no fan-out e revalidar antes da entrega para mudanças
      de preferência durante filas/retries. Preservar acesso, opt-out e deduplicação.
- [ ] Testar conta sem preferências, dispositivo sem suporte/permissão, mute salvo,
      usuário silenciado entre enfileiramento e envio e ausência de acompanhados.

**Testes:** suites `src/modules/entrega/push/__tests__/`,
`src/app/api/push/__tests__/routes.test.ts` e testes de preferências.
**Saída:** AC09/AC10 e opt-out funcionando de ponta a ponta.

## P8. Resultados

**Existentes:** `src/app/(app)/resultados/{page.tsx,[data]/page.tsx}`,
`src/modules/entrega/resultados.ts`, componentes atuais de recap e `CardEntrada`.

- [ ] Reutilizar resumo/destaque/histórico e atualizar identidade de apresentação.
- [ ] Acrescentar filtros de estratégia, atributo e time preservando a data na URL.
- [ ] Garantir denominador explícito do resumo filtrado ou da rodada inteira.
- [ ] Exibir linha prevista e realizado do mesmo período; preservar DNP, dado
      pendente, correção oficial e distinção entre alvo Q1 e linha de jogo.
- [ ] Aplicar transição discreta sem som ou replay de celebrações históricas.

**Teste:** `src/app/__tests__/telas-04-resultados.test.ts`. **Saída:** AC11.

## P9. Gestão: contrato antes da persistência

**Existentes:** `src/modules/entrega/gestao.ts`, `src/app/(app)/gestao/page.tsx`,
`src/modules/motor/gestao/banca.ts` (somente leitura/reuso), schema e preferências.
**Propostos:** registros de planejamento por conta, transições/revisões e ações
validadas, após fechar os significados abaixo.

- [ ] Homologar momento de comprometimento/liberação, encerramento manual/oficial,
      DNP/cancelamento, campos de registro, alcance de desfazer e definição de
      disponível. Registrar decisão na spec antes de codificar fórmulas/transições.
- [ ] Preservar o modelo atual do ruleset e aviso de demonstração; não implementar
      apostas, custódia, movimentação financeira ou cálculo de lucro presumido.
- [ ] Modelar Planejada/Registrada/Encerrada com origem, dono, chave/revisão, valores
      e histórico suficientes para reconciliação e desfazer. Evitar dupla contagem.
- [ ] Criar migration aditiva e teste de upgrade/rollback; preservar planos legados.
- [ ] Implementar mutações autenticadas/idempotentes, precisão de valores e controle
      de concorrência. Resposta devolve estado e totais coerentes do servidor.
- [ ] Implementar desfazer compensatório, recusando conflito de revisão com mensagem
      recuperável; editar/fechar em outra aba não pode ser sobrescrito em silêncio.
- [ ] Integrar resumo e abas com loading, vazio, erro e total recalculado. Testar
      persistência após reload, conta isolada, dupla submissão e falha no salvamento.

**Saída:** AC08. Se o contrato comercial continuar aberto, registrar P9 pendente;
não preencher cards com contas inventadas nem declarar Gestão concluída.

## P10. Integração, documentação e entrega

- [ ] Validar AC01–AC11 numa matriz de cenários rastreada, apontando pendências reais.
- [ ] Atualizar `docs/04-design-system.md` e galeria em
      `src/app/(admin)/admin/galeria/page.tsx` apenas com componentes/estados entregues.
- [ ] Atualizar documentação de preferências, áudio e scripts de reconciliação.
- [ ] Executar lint, typecheck, boundaries, suites relevantes e build. Quando passar,
      rodar suíte completa uma vez; repetir somente o que mudanças/falhas justificarem.
- [ ] Conferir páginas autenticadas em 320×568, 390×844, 768×1024, 1280×900 e 844×390,
      com rolagem, teclado, touch, zoom200%, reduced-motion e imagens quebradas.
- [ ] Executar jornada: buscar alias → acompanhar → selecionar jogo → receber
      snapshot novo → ouvir uma vez → silenciar → consultar Stats → Resultados.
      Exercitar Gestão separadamente com o contrato homologado.
- [ ] Registrar console/rede, seleção estável, erros recuperáveis, ausência de replay,
      duas abas, offline/reconexão e diferenças de suporte ao áudio móvel.
- [ ] Revisar staged diff e obter preview da branch quando a implementação estiver
      autorizada para publicação. Não confundir CI, merge, migração e deploy pronto.
- [ ] Liberar código e migrações na ordem de compatibilidade definida; conferir SHA,
      assets e jornada no ambiente destino. Preservar rollback de preferências e
      identidades; não desfazer uma reconciliação por exclusão cega de dados.

### Comandos disponíveis

Executar na raiz do worktree de desenvolvimento; testes e simulações usam banco
isolado. A lista abaixo não é autorização para executar mutações no banco publicado.

```bash
npm run typecheck
npm run lint
npm run boundaries
npm test -- --maxWorkers=4
npm run build
npm run demo:conferir -- --pglite
```

No ambiente local atual, `node_modules` é um symlink compartilhado. Se o Turbopack
reproduzir a restrição de raiz, usar `npm run build -- --webpack` e registrar que é
uma alternativa local; validar o build normal no ambiente de deploy. Se alterar
tokens, executar `npm run tokens` e conferir paridade. Migrações devem ser geradas
pelo `npm run db:generate`, revisadas e aplicadas primeiro no banco de teste.

Harness de conferência já existente:

```bash
CONFERENCIA=1 CONFERENCIA_DIR=.superpowers/ux-transmissao/html npm test -- src/app/__tests__/telas-04 --maxWorkers=1
CAPTURA_REUTILIZAR_HTML=1 CONFERENCIA_DIR=.superpowers/ux-transmissao/html CAPTURA_DIR=.superpowers/ux-transmissao/capturas bash scripts/captura-telas.sh 1400
```

Esse harness gera HTML real de fixtures e capturas; não prova hidratação, autoplay,
push ou ações autenticadas. Usar também navegador interativo/harness de componentes
reais. Conferir disponibilidade das skills aplicáveis na execução; se um workflow
exigir ferramenta ausente, declarar a limitação e registrar evidência complementar.
Não copiar uma declaração de sucesso de uma release anterior.

## 3. Definição de conclusão

Todos os aceites da spec implementados e verificados, decisões de Gestão registradas,
identidades ambíguas resolvidas ou explicitamente pendentes por caso, evidências
reproduzíveis e documentação atualizada. Uma entrega parcial deve listar as etapas
concluídas e abertas; não marcar o plano inteiro concluído pelo término de P4.
