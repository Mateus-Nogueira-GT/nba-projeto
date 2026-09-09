# NIP — plano de identidade e operação de afiliados

**Spec:** [Decisões, contratos e aceite](../specs/2026-09-08-nip-identidade-e-afiliados-design.md).
**Estado:** implementação concluída na branch; validação final em andamento.
**Base:** `origin/main` em `cc6390a8`, 08/09/2026.
**Branch dos documentos:** `codex/spec-nip-afiliados`.

## 1. Estratégia

Executar por entregas verticais: marca → acesso/cadastro → links rastreados →
importação/atribuição comercial → comissões → controle de repasses → painéis completos.
Demonstrar cada etapa com dados sintéticos e preservar assinaturas/motor esportivo.
Nomes de arquivos/rotas novos abaixo são propostas; verificar padrões locais antes
de criar. O plano não autoriza integração, migração externa ou deploy por si só.

| Etapa | Dependência | Resultado revisável |
| --- | --- | --- |
| P0 | Aprovação da spec | Contratos mínimos, decisões técnicas e harness |
| P1 | P0 | Rebrand NIP em telas, metadados e PWA |
| P2 | P0 | Afiliado convidado acessa portal independente; admin configura parceria |
| P3 | P2 | Admin cria campanhas/links; afiliado copia |
| P4 | P3 | Dois percursos rastreados com atribuição de 30 dias |
| P5 | P4 | Planilha percorre prévia, validação e conciliação |
| P6 | P5 | Comissões calculadas por acordo versionado, sem duplicação |
| P7 | P6 | Controle auditável de recebimentos e repasses externos |
| P8 | P4–P7 | Painéis consolidados e individuais completos |
| P9 | P1–P8 | QA, documentação e entrega pronta para homologação |

## Resultado da execução

P1–P7 foram implementadas no MVP, incluindo marca NIP, convites, ofertas ativáveis,
links, primeiro toque, visita/saída, prévia de CSV, conciliação explícita, comissões,
ajustes, recebimentos e repasses manuais. P8 inclui painéis responsivos, isolamento do
parceiro, período, estados vazios e totais separados por moeda. P9 foi validada com
typecheck, lint, boundaries, testes, build Webpack e comparação visual documentada em
`design-qa.md`.

Continuam como gates de homologação: fornecedor/retenção do armazenamento privado,
IDs e arquivos reais das casas, filtros operacionais adicionais, paginação completa,
baseline de latência sob carga e fluxo autenticado em banco externo. Esses pontos não
autorizam migration, seed, integração ou publicação em produção.

Marca pode ser entregue antes de contratos comerciais. P2–P9 podem ser validadas com
fixtures; ativação de casas reais depende das condições do §12 da spec.

## P0. Inventário e contratos de implementação

**Ler:** `CLAUDE.md`, `docs/01-arquitetura.md`, `docs/02-motor-regras.md`,
`docs/adr/0004-odds-somente-leitura.md`, `docs/runbooks/deploy.md`,
`docs/runbooks/casas-de-aposta.md`, schemas e autenticação existentes.

- [ ] Revalidar `origin/main`, worktrees, migrações e scripts; preservar checkouts
      atuais e usar branch `codex/` própria da implementação.
- [ ] Registrar o mapa de superfícies de marca, permissões e fronteiras comerciais.
- [ ] Acrescentar ADR para links/relatórios comerciais, delimitando extensão ao
      ADR-0004 sem permitir apostas, credenciais de apostador ou transferências.
- [ ] Definir contrato CSV inicial, chave idempotente de evento e de período,
      decimal/moeda, limites de upload e tratamento de revisão de relatório.
- [ ] Fixar propostas técnicas: relógio UTC, período de painel em São Paulo com
      limites consistentes, janela de 30 dias e tratamento de conflitos de identidade.
- [ ] Definir armazenamento privado para relatórios/comprovantes e retenção técnica
      proposta, sem contratar fornecedor automaticamente. Revisar antes de dados reais.
- [ ] Preparar fixtures: dois parceiros, duas casas fictícias, campanhas NIP/direta,
      pessoa anônima/cadastrada, CSV individual/agregado, CPA/RevShare/híbrido,
      duplicidade, revisão, estorno, pagamento parcial e duas moedas.

**Aceite:** contratos testáveis, pendências comerciais rastreáveis, nenhuma
dependência de API não documentada. A revisão final da spec precede implementação.

## P1. Identidade NIP e continuidade esportiva

**Existentes:** `src/app/layout.tsx`, `src/app/manifest.ts`,
`src/app/(app)/`, `src/app/(admin)/admin/galeria/page.tsx`,
`src/design-system/`, `src/components/navegacao/`, `scripts/gerar-assets-pwa.ts`.

- [ ] Introduzir marca tipográfica e constantes de apresentação coesas.
- [ ] Atualizar metadados, ícones PWA, navegação e textos públicos de autoria.
- [ ] Manter nomes de funcionalidades e vocabulário homologados na spec.
- [ ] Atualizar documentação de produto vigente; preservar fontes históricas e IDs.
- [ ] Conservar motion/áudio esportivo e preferências; painéis têm comportamento sóbrio.
- [ ] Capturar estados de login, lista, Fire Live, Como funciona e PWA; conferir
      longos nomes oficiais e distinção entre elenco canônico/editorial.

**Validação:** A01–A02, testes existentes de PWA, navegação e motor; revisão visual
390/1280 px. Busca de referências pessoais públicas com triagem, sem replace global.

## P2. Fundação comercial, acesso e convites

**Existentes:** `src/modules/dominio/db/schema/{plataforma,odds,enums}.ts`,
`src/modules/plataforma/auth/`, `src/app/(admin)/admin/guarda.tsx`.
**Propostos:** schema `afiliados.ts`, módulo `plataforma/afiliados/`, portal próprio.

- [ ] Modelar parceiro/convite, oferta e acordo versionado associados a usuário/casa.
- [ ] Criar migration aditiva via scripts existentes; não presumir o próximo número.
- [ ] Implementar convites de uso único, expiração, vínculo seguro a conta existente,
      ativação/suspensão e guarda de parceiro independente do paywall.
- [ ] Admin cadastra casas/ofertas em rascunho, percentuais por parceiro e modalidade
      comercial; condições incompletas não ativam oferta real.
- [ ] Validar autorização em cada ação/API/consulta, inclusive downloads futuros.
- [ ] Não enviar convites reais durante QA; usar criação/cópia em ambiente de teste.

**Validação:** A03–A04 e A18, upgrade/rollback em PGlite, tentativa de acesso A→B,
usuário comum→portal e afiliado→admin. Assinatura existente segue seus próprios testes.

## P3. Campanhas e links administrados

**Propostos:** subáreas de campanhas/links no admin e Meus links no portal.

- [ ] Admin cria campanha para parceiro, canal, oferta e destino NIP/casa.
- [ ] Persistir código opaco único e configuração versionada; estado explícito.
- [ ] Validar HTTPS, host e parâmetros obrigatórios; separar UTMs de identificadores
      externos comerciais. Não permitir URL arbitrária na requisição de saída.
- [ ] Parceiro consulta/copia seus links e condições, sem controles de edição.
- [ ] Registrar alterações, pausa e autoria; preservar resolução histórica dos eventos.

**Validação:** A04/A07, isolamento por parceiro, manipulação de parâmetros/URL,
colisão de códigos e cópia do destino correto. Sem chamadas a casas reais.

## P4. Jornada pública e atribuição

**Propostos:** `src/app/r/[codigo]/route.ts`, `src/app/ir/[codigo]/route.ts`,
página pública NIP de oferta e serviço de atribuição/eventos.

- [ ] Implementar percurso via NIP e direto à casa, com registro no servidor.
- [ ] Persistir primeira atribuição por 30 dias e separar titular do link clicado.
- [ ] Fazer associação segura após autenticação, sem renovar prazo nem inferir
      identidade por IP/nome; conflitos têm estado de conciliação.
- [ ] Bloquear cache/prefetch indevido nas rotas de tracking; tratar HEAD/previews.
- [ ] Diferenciar clique, visita NIP e saída; não afirmar chegada externa.
- [ ] Mostrar estados para expirado/pausado/falha de registro, mantendo transparência.
- [ ] Medir tempo da rota crítica sob carga de teste, sem rede externa ou geração de
      comissão; fixar orçamento de latência após baseline e registrar resultado.

**Validação:** A05–A08, relógio controlado nos dias 0/10/30, concorrência entre
primeiros cliques, cookie removido, duas contas/dispositivos, URL manipulada,
falha de banco e tentativa repetida. Navegador usa destino de teste para observar
headers/parâmetros, nunca para simular conversão como fato comercial.

## P5. Importação e conciliação de resultados

**Propostos:** submódulo de importação, tela admin e template CSV NIP.

- [ ] Upload privado, parse limitado, mapeamento e prévia sem confirmação automática.
- [ ] Reconciliar casa/oferta/campanha e IDs externos inequívocos com cliques/saídas.
- [ ] Tratar granularidade individual/agregada e chaves por evento/período/versão.
- [ ] Duplicidade não altera saldos; revisões mostram diferença e referência original.
- [ ] Oferecer fila de pendências para identificador ausente, atribuição conflitante,
      condição desconhecida e formato inválido; preservar evidência do administrador.
- [ ] Registrar lotes/linhas e auditoria; publicação de resultados em transação.
- [ ] Ao exportar CSV, neutralizar fórmulas em células textuais sem alterar valores
      monetários tipados. Não executar conteúdo de arquivo durante importação.

**Validação:** A09–A11/A15, CSV sintético com duplicação, sobreposição, correção,
separador decimal, moeda/data ambíguas, campos ausentes, arquivo grande/truncado,
IDs conflitantes e versão de acordo ausente. Nenhum matching por semelhança de nome.

## P6. Livro de comissões e acordos

- [ ] Calcular parcela sobre comissão confirmada segundo versão explícita do acordo.
- [ ] Preservar base, percentual, modalidade, moeda, vigência e origem do lançamento.
- [ ] Separar CPA/RevShare/total híbrido para impedir dupla contagem.
- [ ] Implementar ajustes vinculados ao original, sem mutação destrutiva de histórico.
- [ ] Não automatizar marco de vigência, deduções ou compensações ainda indefinidos.
- [ ] Expor projeções distintas de receita NIP e parcela dos parceiros.

**Validação:** A11–A12/A14, valores fracionários, 0/100%, percentuais inválidos,
duas moedas, revisão de acordo e lançamento repetido/concorrente. Totais de tela
devem fechar com o livro, não com uma nova fórmula no componente.

## P7. Recebimentos e repasses manuais

- [ ] Registrar recebimento externo da casa, inclusive parcial, sem gerar transferência.
- [ ] Liberação de repasse exige ação administrativa identificada; não derivar
      automaticamente do recebimento/confirmação enquanto a decisão estiver pendente.
- [ ] Registrar pagamento externo com valor, data, referência/evidência e alocações.
- [ ] Garantir transação/unicidade para saldo liberado e impedir dupla liquidação.
- [ ] Guardar comprovantes privados e autorizar acesso ao administrador/titular apenas.
- [ ] Ajustes após pagamento entram como divergência explícita; sem desconto automático.

**Validação:** A13–A14, pagamento parcial, repetido, concorrente, acima do liberado,
arquivo de outro afiliado e correção posterior. Nenhum endpoint bancário/PIX envolvido.

## P8. Painéis completos e estados operacionais

- [ ] Montar dashboard consolidado e individual conforme §6 da spec, com componentes
      comuns e consultas paginadas filtradas por permissão no servidor.
- [ ] Adicionar Indicados, Ofertas, Meus links, Extrato e repasses no portal.
- [ ] Exibir origem/data de importação, métricas indisponíveis, zeros reais e pendências.
- [ ] Revisar rótulos CPA, RevShare, FTD/QFTD segundo contrato configurado; nenhum
      visitante anônimo deve ser mostrado como pessoa identificada.
- [ ] Usar máscara no servidor, não retornar PII excedente ao navegador.
- [ ] Filtros de período/casa/campanha/parceiro consistentes; não somar receitas em
      múltiplas moedas nem misturar período de evento com período de pagamento.
- [ ] Identidade NIP sóbria nos dois painéis, com teclado, foco, loading/error/empty
      e layout mobile. Não copiar cores/marca ou dados pessoais dos prints.

**Validação:** A15–A17, totais reconciliados com fixtures, isolamento de acesso,
limites de período e fluxo completo em 390/1280 px. Filtros sem resultado mantêm contexto.

## P9. Fechamento e homologação

- [ ] Rodar `npm run typecheck`, `npm run lint`, `npm run boundaries`, `npm test`,
      `npm run build`, Prettier dos arquivos alterados e `git diff --check`.
- [ ] Reutilizar harness existente para páginas e PGlite; complementar com navegador
      para jornada de tracking/convite/importação/repasse e autorização de downloads.
- [ ] Verificar todos os critérios A01–A18 e registrar limites do teste visual/runtime.
- [ ] Atualizar design system, arquitetura, instruções vigentes e criar runbook de
      afiliados com template/importação, conciliação, ajuste e controle de repasse.
- [ ] Entregar commits pequenos e diff revisável em branch própria; não executar
      seed/importação real nem colocar credenciais nos documentos.

### Condições para ativação real

1. Usuário aprova entendimento consolidado e implementação.
2. Casa/link comercial e parâmetros de atribuição documentados e homologados.
3. Relatório de exemplo permite provar a granularidade exibida; IDs conciliáveis.
4. Acordo/percentual/moeda aplicáveis registrados; sem valores fictícios em produção.
5. Acesso, retenção de dados individuais e armazenamento privado verificados.
6. Migration aditiva aplicada antes do código que depende dela, conforme runbook.
7. CI aprovado; após release autorizado, confirmar SHA, deploy, banco e fluxo
   autenticado. Merge, migração e produção pronta são verificações separadas.

O critério automático de liberação e integrações via API podem permanecer pendentes:
a versão manual deve mostrar esse limite e registrar cada decisão do administrador.
Não executar repasse, envio de aposta ou integração não contratada para “fechar” QA.
