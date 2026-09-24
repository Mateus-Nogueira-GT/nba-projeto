# Front v2 no projeto — integração com o back real

**Data:** 23/09/2026.
**Estado:** aprovada pelo parceiro em 23/09, com as seis decisões da §7 respondidas (todas na
forma proposta). Os pedidos do LEIA-ME do v2 vieram do próprio CJ e viram spec própria (§6).
**Gatilho:** o parceiro pediu, em 23/09, para trazer o front v2 do cliente
(`~/Downloads/nip-front-v2`, no ar em <https://nip-front.vercel.app>) para este projeto e ligá-lo
ao back.
**Base:** `main` em `deb6b19` (Ondas 1 e 2 mescladas localmente, sem push).
**Referências no repositório:**

- `referencias/nip-front-v2/` é a cópia exata da pasta, com 369 arquivos. Fica fora do typecheck
  e do lint.
- `referencias/nip-front-v2-prints/` tem os prints do site no ar: 32 rotas em desktop (1440 px) e
  em celular (390 px), além do painel do apito e dos três temas. O `indice.json` liga cada print
  à sua rota.

---

## 1. O que é o front v2

É uma reescrita do front feita pelo cliente a partir do pacote que entregamos em 22/09
(`~/nip-frontend.zip`). Mantém a marca e os dados, e muda layout, hierarquia, navegação e
densidade, na linha do painel do StatsHub. Pelo LEIA-ME e pelos prints:

- **Casca.** Menu lateral fixo no desktop (Entradas, Ao Vivo, Estatísticas, Gestão de banca,
  Resultados, Sixth Man AI, Metodologia, Perfil, Admin). No celular, barra inferior com
  Entradas, Ao Vivo, Stats, Gestão e Mais. No topo, busca global, tema e notificações. Uma
  coluna à direita traz jogos de hoje, a noite anterior, a temporada, os turbos e o campo do
  assistente.
- **Lista Secreta em tabela.** Uma linha por apito, com abas de mercado e contador, busca,
  agrupamento por jogo ou por nível, lentes (Últ. 5, Média, Odds, Hierarquia), filtro de
  "Seguidos" com estrela, e ordenação e filtros guardados na URL.
- **O detalhe do apito abre num painel lateral**, por rota interceptada (`@painel/(.)apito`). A
  página inteira continua existindo para o link direto. O detalhe tem recortes, forma, frequência
  por linha, tendências em frase e linha ajustável ±0,5.
- **Telas novas:** landing `/conheca`, placar público `/placar`, "Seu mês" na Gestão, filtro de
  jogo no Ao Vivo, barras contra a média nas estatísticas do jogador e temas Marinho (padrão),
  Aço e Claro, guardados no cookie `nip-tema`.
- **Técnica:** Next 16.3.6, CSS Modules com variáveis (`src/ui/tokens.css`), container queries,
  sem Tailwind e sem biblioteca de componentes, só TypeScript.

Estrutura:

```
src/ui/          peças compartilhadas (tokens, marcas, gráficos, controles, ícones)
src/features/    uma pasta por área (lista, apito, ao-vivo, estatisticas, gestao, resultados,
                 conta, metodologia, assinatura, publico, landing, admin, afiliados,
                 assistente, lateral, pwa, shell, construcao)
src/app/         rotas finas: leem de src/modules e montam as features
src/modules/     FACHADA de 22/09: os tipos são os reais e as funções devolvem dado congelado
src/dados-falsos/ a rodada congelada de 23/08/2026
```

## 2. O que medimos antes de desenhar

- **Contrato.** As telas do v2 importam 180 símbolos de `src/modules`. Todos existem no nosso
  back, exceto:
  - `PainelDoAfiliado` e `PainelAdministrativo`, apelidos de tipo do retorno de duas funções
    que existem;
  - o proxy `dominio/db/consulta-falsa`, que substitui o `drizzle-orm` em cinco telas.
- **Typecheck real.** Numa worktree descartável, com as telas do v2 no lugar das nossas,
  `src/app/api` nosso e `src/modules` nosso, o `tsc` dá **13 erros**, em quatro grupos:
  1. Os crons importam os wrappers de cache da Onda 2 (`app/(app)/feed-cacheado`,
     `app/(app)/lateral/leitura`), que o v2 não tem.
  2. As rotas `r/[codigo]` e `ir/[codigo]` e a tela `oferta/[codigo]`: o resolvedor de afiliado
     passou a devolver `{ destino, configuracao }` (Onda 2).
  3. O tipo das faixas de confiança: o `rotulo_curto` passou a ser opcional.
  4. Estados novos: `TEMPORADA_NAO_COMECOU` no Ao Vivo e `ConfigTemporada` nulo nas estatísticas
     do jogador (temporada retroativa).
- **Rotas.** As 32 páginas do v2 cobrem as nossas. O v2 acrescenta `/conheca`, `/placar` e o
  índice `/admin`. O nosso `/resultados` vira um route handler que redireciona para a última
  noite, e o v2 já tem esse handler.
- **Testes.** `src/app/__tests__` tem 42 arquivos presos às telas atuais. Parte deles trava
  invariantes que continuam valendo (portões de plano, paywall, cache, navegação, PWA). O resto é
  a marcação das telas antigas.

## 3. Decisão de arquitetura

**As telas do v2 entram, e o back continua o nosso.**

| Vem do v2 | Fica o nosso | Não entra |
|---|---|---|
| `src/ui`, `src/features`, as páginas e layouts de `src/app`, os assets novos de `public/` (`avatares`, `landing`, `marca`) | `src/modules` inteiro, `src/app/api/**`, `src/app/r` e `src/app/ir` (Ondas 1 e 2), `src/workflows`, `.well-known`, `config/`, `drizzle/`, `vercel.ts`, `next.config.ts` e `public/sw.js` | `src/modules` do v2 (fachada), `src/dados-falsos`, `consulta-falsa` e a sessão de admin fixa de `auth/cookies.ts` |

Consequências:

1. **`consulta-falsa` volta a ser `drizzle-orm`** nas cinco telas (mapeamento, mercados,
   metodologia/ações, conta/ações e conta/carregar).
2. **Os dois apelidos de tipo** entram em `plataforma/afiliados/servico.ts`:
   `Awaited<ReturnType<…>>`. É a única mudança em `modules` que vem do front.
3. **Os wrappers de cache da Onda 2 saem do caminho das telas antigas** para um lugar neutro,
   `src/app/_cache/` (feed, lateral, temporada, ranking), sem mudar comportamento. Os crons passam
   a importar dali. As `carregar.ts` do v2 usam os wrappers em vez de `lerFeed`/`lerLateral` crus.
4. **`src/components` e `src/design-system` são aposentados** quando nada mais os importar. Os
   tokens do v2 (`src/ui/tokens.css`) passam a ser o design system, e
   `docs/04-design-system.md` é atualizado.
5. **O admin sai do grupo `(admin)` e passa ao `(app)/admin`**, como no v2, sem perder o portão
   de papel ADMIN (ver §4).

## 4. Invariantes do app atual que as telas do v2 precisam manter

As telas do v2 foram escritas contra a fachada, que está sempre logada como ADMIN e não tem
cache. Cada linha abaixo vira critério de aceite e teste:

| # | Invariante | Onde está hoje |
|---|---|---|
| I1 | Portão de nível antes de qualquer leitura paga (`exigirNivel` + `atende`). Nenhum item do feed chega ao HTML do plano grátis. | `paywall.test.ts`, `planos-*.test.ts` |
| I2 | O feed é lido do cache (`lerFeedCacheado`) e só depois do portão. Página paga sem `'use cache'`. | Onda 2, `invalidacao-feed.test.ts` |
| I3 | Sem cookie, as estatísticas de jogador, time e jogo redirecionam antes do banco. | Onda 1, `guarda-cookie.test.ts` |
| I4 | Lateral, temporada e ranking lidos do cache, com a tag certa. | `cache-forma.test.ts`, `temporada-cacheada.test.ts` |
| I5 | O Ao Vivo só se atualiza com a aba visível, com variação de ±10 s. | Onda 2, `AtualizarAoVivo` |
| I6 | Push: ativar só com permissão; reenviar só se a inscrição mudou ou uma vez por dia, com `usuarioId`. | Onda 2, `push-cliente.ts` |
| I7 | A metodologia tem aceite obrigatório antes de usar, e o app abre no Ao Vivo quando há jogo. | "abertura e metodologia", 20/09 |
| I8 | Admin e afiliados exigem o papel certo no servidor, e não só escondem o menu. | `admin-trilha.test.ts` |
| I9 | Vocabulário: "confiança", nunca "probabilidade"; `nível do jogador` ≠ `nível do apito`; Fire Live só no 1º quarto. | CLAUDE.md |
| I10 | Faixa "dados simulados" quando `DEMO_AUTOSSEMEADURA` está ligada. | `faixa-demonstracao.test.ts` |
| I11 | Aviso "18+ · Aposta não é investimento" e somente leitura de odds, sem nada que pareça aposta. | CLAUDE.md regra 4 |
| I12 | O assistente conversa com o `/api/chat` real (limites da Onda 1) e o push com as rotas reais. | `chat-botao.test.ts`, `pwa.test.ts` |
| I13 | Nenhuma cor fora dos tokens (`src/ui/tokens.css`) em `src/ui` e `src/features`; nenhum texto abaixo de 12px; a palavra "probabilidade" não aparece em nada que vá para a tela. | teste de fonte novo (o antigo só varria `design-system`) |
| I14 | Os cabeçalhos de segurança, o service worker e o manifest continuam os nossos. A busca do topo (`features/shell/Topo.tsx`) é um formulário GET para `/estatisticas?q=`, que roda a busca real (`buscar()`), sem rota nova; a Lista tem filtro próprio no servidor, por `?busca=` (`features/lista/estado.ts`). | `cabecalhos-seguranca.test.ts`, `pwa.test.ts` |

## 5. Testes

- **Mantidos e reapontados** (travam invariantes): paywall, planos-\*, admin-trilha, carregamento,
  navegação, pwa, chat-botao, faixa-demonstracao, estatisticas-url-invalida,
  resultados-url-invalida, cabecalhos-seguranca, ir-origem, gestao-\* (ações e acesso real),
  conta-acoes, preferencias-acoes e apito-meia-noite.
- **Aposentados:** os testes que só conferem a marcação das telas antigas (`telas-04-*`,
  `telas-05-*`, `telas-06-*`, `telas-galeria`, `telas-metodologia`, `telas-abrir`,
  `escrita-identidade-04`, `controles-com-estado`, `lateral-montar`, `telas-demo`). Cada um é
  lido antes de sair, e qualquer invariante escondida nele migra para um teste mantido ou novo.
- **Novos:** um teste de fumaça por área com PGlite, no padrão atual. Ele renderiza a página com
  o back real, confere que responde sem erro e que o texto-chave aparece (ou não aparece, no plano
  grátis).
- **E2E visual:** o Playwright local abre as rotas com a semente de demonstração e compara com os
  prints de `referencias/nip-front-v2-prints`. A comparação é olhada por uma pessoa, não por pixel:
  o dado é outro.
- **E2E existente:** `e2e/gestao.spec.ts` e `e2e/entrar.setup.ts` (o runbook da Gestão, botão a
  botão, fora do CI) são reapontados para os seletores da Gestão nova e rodados uma vez.

## 6. Fora do escopo

- Qualquer regra do motor ou do ruleset. Os pedidos da reunião de 23/09 que o LEIA-ME lista
  (rebotes 8 → 7 com os parâmetros 7, 10, 3, 5, 7, 10; Lista só com média ≥ 4 em AST e REB fora
  do Fire Live; dados de matchup) **vieram do próprio CJ**, segundo o parceiro em 23/09. São
  regra do motor e do ruleset, e por isso ganham spec própria, com os 15 testes-âncora revistos
  onde a regra tocar. Antes dela, falta o CJ explicar o que cada parâmetro de rebote significa e
  como o matchup entra no apito.
- Os endpoints agregados que o LEIA-ME sugere ("Seu mês" em uma chamada, placar pronto). Entram
  só se o teste de fumaça mostrar lentidão.
- O deploy. Continua valendo a ordem da spec de prontidão: migração da Onda 1 antes do push.

## 7. Decisões — respondidas pelo parceiro em 23/09 (todas como proposto)

1. **A confiança volta à linha da Lista.** O v2 mostra "94%" em cada linha e no painel. Em 19/09
   (identidade 06) a confiança tinha saído do card. **Decidido:** seguir o v2. O `%` que estava
   pendente na página do apito é absorvido. O CJ desenhou assim, então não há o que avisar.
2. **Landing `/conheca`: o que um visitante sem conta pode ver?** O v2 mostra os 5 apitos mais
   fortes **de hoje** e o apito ao vivo. Com o back real isso ou sai vazio (ele pede a data `''`)
   ou entrega de graça o que é pago. **Decidido:** a landing usa a noite **conferida** de ontem
   (apitos que bateram, com placar) e só números agregados de hoje, sem nomes.
3. **Placar público `/placar`:** mostrar a taxa de acerto por faixa e por nível para quem não
   assinou. **Decidido:** sim, é argumento de venda e é dado passado. Com cache de 1 hora.
4. **Quantidade de itens 1–5, 10, 15 e 20.** O back aceita 1, 2 e 5, e o v2 lê o parâmetro por
   cima. **Decidido:** é preferência de tela; os valores do v2 valem.
5. **Três temas (Marinho, Aço, Claro).** O manual da marca só traz o escuro. **Decidido:** manter,
   com o Marinho como padrão.
6. **"Sixth Man AI"** é o nome do assistente em toda a interface. **Decidido:** sim.
7. **Os 17 MB de prints** ficam fora do git até o parceiro pedir o contrário; a pasta
   `referencias/nip-front-v2-prints/` é local.

## 8. Critérios de aceite

- Todas as rotas da §2 respondem, com o back real e a semente de demonstração, sem erro de
  runtime nem de hidratação, em desktop e em celular.
- `typecheck`, `lint` e `boundaries` limpos; a suíte inteira verde em lotes; o `next build` passa
  com o banco isolado.
- Cada invariante da §4 tem um teste que falha se ela quebrar.
- `src/components`, `src/design-system` e a fachada não existem mais no `src`.
- Os prints da semente, lado a lado com os de referência, não mostram diferença de layout que o
  dado não explique.

## 9. Registro da execução (24/09)

Executado por tarefas (T1–T14 do plano), com revisão a cada tarefa. Base: `main` @ `338e20b`.

### 9.1 Desvios do v2 como veio do cliente

Onde o v2 contrariava uma invariante da §4 ou uma regra do projeto, a regra venceu:

- **Layout raiz estático.** O v2 lia o cookie do tema no layout raiz, o que tornava todo o app
  dinâmico, inclusive `/offline` e a 404. O tema agora é aplicado por um script inline no `<head>`
  antes do paint, com o Marinho como padrão e `nip-tema` inválido caindo nele.
- **Casca sem portão.** `(app)/layout.tsx` não chama `exigirNivel`, porque envolve `/metodologia`
  e faria laço. O portão fica em cada `carregar.ts` e em cada slot `@painel/<área>`.
- **`avaliarAcesso` com `cache()` do React** (memo por requisição). É a única mudança em
  `src/modules` fora dos dois apelidos de tipo; a assinatura não muda.
- **`/entrar` e `/cadastrar`** foram para o grupo `(publico)`, fora da casca. As URLs não mudam.
- **`/oferta/<codigo>` pausado ou encerrado** vai a `/oferta-indisponivel` em vez de 404, como
  `/r/` e `/ir/` desde a Onda 1.
- **`caminhoInterno`** valida o "voltar" da `/assinar` já normalizado. **A `/assinar` da main e
  de produção tem o open redirect** (`/assinar?voltar=/.//evil.com`) até esta branch entrar.
- **Landing:** usa a última noite conferida até ontem, não estritamente ontem, para não ficar
  vazia no hiato (D2). O "94%" fixo do v2 virou "—" quando não há dado.
- **Paleta da landing** (`--l-*`) passou para `src/ui/tokens.css`, a fonte única de cor.
- **Cadastro:** senha com no mínimo 12 caracteres, como o back exige (o v2 pedia 10).
- **Odd do exemplo da metodologia** segue `odds.exibicao` do ruleset (no v2 era fixa).
- **Assistente** só para MVP+ e respeitando `CHAT_HABILITADO` e as cotas; o v2 o mostrava a todos.
- **Push:** o cliente do v2 ganhou o dedupe por usuário da Onda 2.
- **Resultados no plano Grátis só com jogo ENCERRADO** (decisão do parceiro, 24/09). A decisão 9
  de 15/09 ("Resultados é grátis, inteiro") assumia que o sinal vaza com um dia de atraso; em
  `/resultados/<hoje>` o card pré-jogo era o sinal em si, com nome, linha e odd (I1). O corte mora
  em `features/resultados/carregar.ts`: cards, item do feed, apito da noite, Fire Live e greens só
  de jogo `ENCERRADO` (em andamento não conta); os números da noite contam só o que está em tela;
  sem jogo encerrado, um vazio honesto ("Nenhum jogo encerrado ainda") em vez de cards "Pré-jogo".
  Os planos pagos seguem vendo tudo. Refina a decisão 9, não a revoga: a rodada que terminou
  continua inteira para todo nível.

- **Conferência contra a referência (24/09).** Uma sessão de debug comparou arquivo a arquivo e
  tela a tela com `referencias/nip-front-v2/` e o site no ar. Corrigido para ficar igual: as regras
  base do `globals.css` (fonte, margens, links, foco) voltaram a ser globais, porque tinham ficado
  presas às telas logadas desde a transição e as telas públicas saíam em fonte serifada; a 404 da
  referência entrou (`src/app/not-found.tsx`); os ícones da faixa da landing usam tokens fixos
  (`--l-icone-*`) para não escurecerem no tema Claro; o texto do card Fire Live da landing e a odd
  do exemplo da metodologia (só o valor, como na Lista) voltaram ao da referência. O site publicado é
  um build um pouco anterior à cópia em `referencias/`; o projeto segue a cópia.

### 9.2 Decisões tomadas durante a execução (para o parceiro confirmar)

1. O plano **Grátis vê a contagem** de apitos bloqueados (total e por jogo), sem nenhum item do
   feed. É tela do v2; os testes antigos tratavam a contagem como sinal pago. Reverter é trocar
   `features/lista/carregar.ts` para não expor a contagem.
2. A **classificação repete** na coluna do índice de Estatísticas, como no v2, contrariando a
   correção de UX de 19/09.
3. O **aproveitamento aparece em duas formas** (lateral inteira × tabela com uma casa), como no
   v2, contrariando a unificação de 19/09.
4. **Véus do tema Claro** seguem os tokens do próprio tema.
5. **`/admin/galeria`** passa pelo portão da Lista: um ADMIN sem aceite da metodologia vai a
   `/metodologia`.
6. **14 pares de contraste do v2 reprovam AA como texto** (todos passam como borda, 3:1): a placa
   do Suporte em todos os temas (3,60:1), `--modo-fire` sobre `--campo` no Aço (4,48), e no Claro
   `--apito-1/2/3`, `--modo-fire` e `--nivel-mvp` sobre `--superficie`/`--campo` (3,51 a 4,41).
   Nenhuma cor foi mudada; cada par é um `it.fails` nomeado, que vira vermelho quando corrigido.
7. O detalhe do apito em **página cheia** (`/apito/[id]` por link direto ou push) não tem "voltar"
   próprio, só a navegação da casca. Não construído.

### 9.3 Testes aposentados e para onde foi cada invariante

Cada teste aposentado foi lido antes de sair. O que ele travava foi para a fumaça da área
(`src/features/<área>/__tests__/fumaca.test.tsx`, com PGlite e o back real):

| Aposentado | Para onde |
|---|---|
| `telas-04-lista`, `telas-04-detalhe`, `apito-meia-noite` | fumaças da Lista e do apito |
| `telas-04-firelive` | fumaça do Ao Vivo |
| `telas-04-estatisticas`, `telas-06-temporada-exibida` | fumaça de Estatísticas, `temporada-exibida.test.tsx`, fumaça da Lista (hiato) |
| `telas-04-resultados`, `telas-05-gestao` | fumaças de Resultados e da Gestão |
| `telas-metodologia`, `telas-05-conta` (movido) | fumaças da Metodologia e da Conta |
| `telas-05-redefinir` | fumaça das telas públicas |
| `telas-galeria` | fumaça do admin, com a guarda real em vez de mock |
| `faixa-demonstracao`, `carregamento` | reescritos para a casca do v2 (mesmos casos) |
| `lateral-montar`, `telas-05-classificacao`, `controles-com-estado` e `src/design-system/__tests__/*` | só marcação das telas antigas; o que era regra (cor por token, nada < 12px, vocabulário, contraste AA) está em `src/ui/__tests__/marca-e-vocabulario.test.ts` e `graficos.test.tsx` |

Mantidos e reapontados, sem mudar o que afirmam: `paywall`, `planos-*`, `admin-trilha`,
`navegacao`, `pwa`, `chat-botao`, `estatisticas-url-invalida`, `resultados-url-invalida`,
`cabecalhos-seguranca`, `ir-origem`, `gestao-*`, `conta-acoes`, `preferencias-acoes`, `telas-abrir`,
`telas-demo` e `escrita-identidade-04` (os dois reduzidos ao que ainda vale para as telas do v2).

### 9.4 D1–D7

Todas respondidas em 23/09 (§7) e aplicadas como decidido. D7: os prints e a cópia
`referencias/nip-front-v2/` ficam fora do commit até o parceiro pedir o contrário.

### 9.5 O que ficou para depois

- **E2E com dado.** Não há Postgres local, então a varredura visual (`e2e/front-v2.spec.ts`) foi
  validada contra o site de referência, e a rodada com a semente fica para uma preview da Vercel
  com uma branch do Neon. `e2e/gestao.spec.ts` e `e2e/entrar.setup.ts` foram reapontados, mas não
  rodaram. PWA e push no celular: não testados. Roteiro em `e2e/LEIA-ME-front-v2.md`.
- **Fila da auditoria de 2k** (sem regressão sobre a main, mas sem cache): índice de Estatísticas
  lê jogos do dia e classificação por visita; `jogosDoDiaResumo` duas vezes por visita a `/`;
  30 leituras de realizadas por visita na Gestão; o refresh de ~30 s do Ao Vivo sem cache.
- **Back:** os endpoints agregados do LEIA-ME não foram necessários.
- **Regras do CJ de 23/09** (rebotes, AST/REB na Lista, matchup): spec própria, fora daqui.
