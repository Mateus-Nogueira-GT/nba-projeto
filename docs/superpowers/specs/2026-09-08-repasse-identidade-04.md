# Repasse da Identidade 04 — estado em 08/09/2026, 10h

## Atualização de publicação — 08/09/2026

O parceiro pediu o commit e a publicação imediata na `main` para apresentar o
produto, substituindo a espera pelo fechamento do loop. O histórico abaixo
registra o ponto de partida; não representa mais o estado da implementação.

**Implementado e integrado:** Fire Live por jogo e por estado (`8512128`),
índice e partida de Estatísticas (`7b3d346`), coerência da participação entre
perfil, recap e taxa da temporada (`f21f507`), galeria, documentação e harness
de conferência com PGlite e capturas mobile/desktop.

**Validação integrada antes da publicação:** 1.294 testes em 105 arquivos,
typecheck, lint, boundaries, `git diff --check` e build de produção passaram.
`demo:conferir -- --pglite` passou com 49 dias simulados, 30 times e conferência
da taxa acumulada contra os resultados detalhados. Não houve mudança em
`config/` nem em `src/modules/motor/` na implementação da Identidade 04.

**Limites da conferência:** foram geradas 32 capturas de 16 telas em 390 e
1280 px, sem conteúdo excedendo a largura do viewport. O Chrome de captura
falhou ao carregar fotos diretamente do CDN (`ERR_HTTP2_PROTOCOL_ERROR`),
embora a URL verificada por HTTP respondesse 200. A verificação offline de
fotos comprova a presença de URLs; não comprova a disponibilidade de todas
as imagens. O harness renderiza HTML real, mas não comprova hidratação ou
o fluxo autenticado do deploy. A skill `playwright-interactive` citada pelo
workflow de frontend não estava instalada; a captura usou Chrome via CDP.

**Loop de revisão ainda incompleto:** a primeira bateria fixa passou e três
lentes iniciaram a leitura; não se concluíram as cinco lentes nem duas
rodadas consecutivas sem achados. Permanecem para reprodução adversarial os
candidatos sobre UUID inválido nas rotas de Estatísticas e continuidade do
Fire Live após a virada real de meia-noite. Eles não foram corrigidos nem
declarados refutados nesta publicação. As decisões comerciais/editoriais
da seção 5 continuam pendentes, com o comportamento existente preservado.

**Publicação:** aplicar somente a migração aditiva `0017`, confirmar o schema,
mesclar o PR #12 e publicar a integração de UX. Preservar o checkout da
apresentação e os dados já semeados. A confirmação do deploy deve ser feita
separadamente da confirmação do merge.

---

**Para:** quem assumir daqui (Codex ou outro agente) · **De:** a sessão que implementou as
fases 0 a 5 · **Motivo:** limite de sessão próximo

**Leia antes de tocar em qualquer coisa:** `CLAUDE.md` (raiz), a
[spec da Identidade 04](2026-09-07-ux-varredura-e-analise-design.md) (§3 princípios, §4 por
tela, §5 transversal, **§10 loop de depuração**) e a
[spec das correções](2026-09-08-correcoes-da-revisao-identidade-04.md) (o inventário dos
achados e, sobretudo, a **§5, decisões do parceiro**, e a **§6, regra de mando**).

---

## 1 · O mapa em uma tela

```
nba-projeto            temporada-simulada  d0e1534   ← ÁRVORE DA APRESENTAÇÃO. NÃO TOCAR.
nba-projeto-ux         ux-sofascore        1e20abf   ← A BRANCH BOA. Tudo integrado e VERDE.
nba-projeto-ux-a       ux-04-a             1e20abf   + Fire Live (2.2) sem commit, VERDE
nba-projeto-ux-c       ux-04-c             1e20abf   + índice/partida (5.3) sem commit, 3 testes VERMELHOS
nba-projeto-ux-b       ux-04-b             eee3d49   já integrado — pode remover
nba-projeto-ux-cap     (detached)          dd9248d   descartável (protótipo de captura) — pode remover
```

**Estado da branch integrada `ux-sofascore` (commit `1e20abf`):** `typecheck`, `lint`,
`boundaries` limpos e **1252 testes em 102 arquivos, todos passando**. Nada foi enviado ao
GitHub: as branches de UX são **só locais**.

## 2 · O que já está pronto

Fases 0 a 5, menos duas telas. Na branch integrada estão: a Lista Secreta por jogo (cabeçalho
do jogo como única fronteira, filtros no botão, lentes, um card por jogador com abas de
atributo), a barra do Fire Live com os dois marcos e o ponto "apitou aqui", o detalhe do apito
com esqueleto fixo e a forma nos últimos 10, os Resultados por rodada com recap e contador da
temporada, a tela do jogador e a tela do time com a hierarquia do CJ.

Também estão lá as duas specs (a da identidade e a das correções) e o mapa completo dos 230
rostos.

## 3 · O que falta, em ordem

### 3.1 · Fire Live, tela (task 2.2) — **pronto, falta revisar e commitar**

O trabalho está **sem commit** em `nba-projeto-ux-a`, seis arquivos modificados.
`npm run typecheck` limpo e **55 testes passando** (`telas-04-firelive.test.ts` e
`fire-live.test.ts`). Foi interrompido antes da revisão adversarial e do commit.

O que fazer: ler o diff, rodar a bateria completa, submeter às duas lentes de revisão
(fidelidade ao artboard `FireLive.dc.html` e código/regressão), corrigir o que aparecer,
commitar.

**Dado que não existe:** `ItemFireLive.apitadoEm` é o *horário* do apito, não o *valor* do
jogador no atributo naquele instante. Sem ele o ponto "apitou aqui" não tem o que marcar.
A regra vigente: o ponto só aparece quando o dado existir; hoje, nunca. Gravar esse valor é
o item 7 da §5 da spec das correções — **decisão do parceiro, não invente**.

### 3.2 · Estatísticas · índice e partida (task 5.3) — **três testes vermelhos**

Sem commit em `nba-projeto-ux-c`, seis arquivos. `typecheck` limpo. O índice
(classificação em tabela, jogos do dia em lista) passa; a **tela de partida** está pela
metade — os testes foram escritos primeiro e a implementação parou no meio. Falham:

| Teste | O que falta |
| --- | --- |
| `a célula do 1º Q veste o quente, e a tela diz uma vez o que o Fire Live observa` | a coluna do 1º quarto no placar por quarto não recebeu o destaque quente nem o rótulo |
| `cada linha do box score traz o rosto, e nenhum deles veste anel de apito` | o `Avatar` de 26 px não foi posto nas linhas do box score |
| `o desfalque que está na lista do CJ sai com a posição e o nível dela` | os desfalques não trazem `nº N` nem o nível da lista |

Os testes descrevem o alvo com precisão; siga-os.

### 3.3 · Fase 6 · fechamento — **não começou**

- **Galeria** (`src/app/(admin)/admin/galeria/page.tsx`): acrescentar `FormaNoAtributo`,
  `BarraAlvo` com marcos e congelada, `HierarquiaDoTime` com prefixo desfalcado,
  `CabecalhoJogo` encerrado com placar e quartos, o card em cada lente e no estado
  `AGUARDANDO_OFICIAL`, `Barrinhas` com `destacarUltima`.
- **`scripts/demo-conferir.ts`**: itens novos — lista agrupada por jogo, um card por jogador,
  recap com apito da noite, taxa da temporada, histórico de apitos no perfil, fotos ≥ 90%.
  (Um ajuste pequeno já entrou; o resto não.)
- **`docs/04-design-system.md`**: seção "Identidade 04" com tokens e componentes novos, os
  estados do ciclo do card, a regra de escrita "taxa contra nota de confiança" e a política de
  congelamento (anatomia do card e posição das abas não mudam durante a temporada). E as
  **erratas** da §5 da spec das correções, quando o parceiro responder.
- **Capturas**: `scripts/captura-telas.sh 1800` já existe e funciona. Ele roda o arnês com
  `CONFERENCIA=1`, que grava o HTML de cada tela, e fotografa a 390 px com o Chrome headless.
  Só as telas cujo teste chama `gravarConferencia` são capturadas — extrair esse helper de
  `telas-demo.test.ts` para um módulo e chamá-lo nos testes novos é parte da tarefa.

### 3.4 · Loop de depuração (§10 da spec da identidade) — **não começou**

O contrato está escrito na §10. O script pronto está em
`scratchpad/ux04/wf-loop.js` (fora do repositório; veja a §6 abaixo). Roda a bateria fixa,
cinco lentes independentes, verificação adversarial de cada achado e correção com teste
primeiro, até **duas rodadas seguidas sem achado novo**.

### 3.5 · Publicação

Nesta ordem, e só depois do loop fechar em silêncio:

1. `npm run db:migrate` contra o Neon. **Há uma migration pendente**, a `0017` (tabela
   `preferencias_usuario`). O runbook é explícito: o deploy da Vercel **não** roda migração, e
   sem ela toda rota que lê preferências responde 500.
2. Mesclar o **PR 12** (`temporada-simulada` → `main`), que está aberto, `MERGEABLE`, com CI
   verde. A branch de UX depende dele.
3. Enviar `ux-sofascore`, abrir o PR e mesclar.

**O parceiro autorizou o merge e o deploy explicitamente**, inclusive sabendo que dispara
deploy. A condição que ele pôs: **só se o loop de depuração não encontrar erro**. Se
encontrar algo que não caiba nos limites da §10.5, pare e mostre a ele.

## 4 · Decisões já tomadas — não reabra

Cada uma custou uma rodada de revisão. Estão fundamentadas na spec das correções.

- **A odd obedece o ruleset.** `odds.exibicao: media` é decisão homologada do parceiro
  (25/08). A materialização aplica a chave e suprime `media` do item quando é `faixa`; o card
  só desenha o que recebe. Um agente já tentou "consertar" isso escrevendo sempre a faixa no
  código: quebrou o teste que protege a decisão e violou a regra 1 do `CLAUDE.md`. **A regra de
  escrita é "nenhuma odd aparece sem dizer o que é"**, não "sempre faixa".
- **A nota de confiança é número puro, sem "%".** É o que os cinco artboards desenham. O "%"
  ficou só para **taxa** (cabeçalho da noite, faixa da temporada).
- **Mando e adversário** (§6 da spec das correções): o lado do jogador é **derivado do jogo**.
  Para o **apito**, o time da **lista do CJ**, porque é o jogo em que o apito nasce. Para o
  **box score**, o time **real**. Escolher uma fonte fixa quebra metade da tela.
- **"Não jogou" é a linha ZERADA.** Produção vence minuto zero: não se marca ponto sem jogar, e
  o provedor que arredonda para baixo quem entrou nos segundos finais manda 0 minuto com pontos.
  A regra é a mesma em `resultados.ts` (`entrouEmQuadra`) e em `estatisticas/jogador.ts` — se
  divergirem de novo, as duas telas voltam a discordar sobre a mesma partida.
- **A aba de atributo do card veste a cor do nível do apito daquele card**; verde fixo faria um
  card N1 exibir o sinal de N3. O seletor de atributo da **tela do time** não pertence a apito
  nenhum e usa o par neutro (`abaAtributo.ativaNeutra`).
- **O brilho quente é do modo fire**, não de todo card quente ("três brilhos, três donos").

## 5 · Decisões que ainda são do parceiro — não invente

Estão detalhadas na §5 da spec das correções. Em resumo: se quem não jogou conta na taxa (a
implementação atual segue a spec e o trata como neutro, o que **muda o número** da taxa da
temporada); se o rodapé do card conferido mostra a odd; a redação do "MÉDIA" duplicado no
rodapé; as erratas dos artboards; e gravar o valor no instante do apito.

## 6 · Armadilhas que já morderam esta sessão

1. **`node_modules` é symlink nos worktrees.** Um `git add -A` versionou o link, ele entrou em
   dois commits, apontava para o próprio worktree e, ao ser restaurado num merge, **apagou as
   dependências dos quatro worktrees**. O `.gitignore` foi corrigido (`node_modules` sem barra:
   com barra ele casa só com diretório) e o histórico reescrito. **Confira `git status` antes de
   `git add -A`.**
2. **Rodar três suítes ao mesmo tempo dá falha fantasma.** Dois testes falharam com os três
   worktrees rodando junto e passaram sozinhos. Antes de investigar uma falha, rode-a isolada.
3. **Commit existir não é commit verde.** Um workflow interrompido deixou a branch vermelha com
   commit feito. Rode a bateria sempre que retomar trabalho de outro agente.
4. **Nunca rode nada contra o Neon** fora do passo 3.5.1. A árvore da apresentação e o banco
   estão no estado que o cliente viu hoje às 11h.
5. **`gravarConferencia`** ainda mora dentro de `telas-demo.test.ts`; os testes novos não o
   chamam, então o script de captura não fotografa as telas novas.

## 7 · Comandos

```bash
# a branch boa
cd /Users/mateusnascimentonogueiradasilva/nba-projeto-ux

# bateria completa (a mesma do CI)
npm run typecheck && npm run lint && npm run boundaries && npm test

# capturas a 390 px, sem servidor nem banco externo
scripts/captura-telas.sh 1800     # → .superpowers/capturas/*.png

# banco: só no passo de publicação
npx dotenv -e .env.local -- npm run db:status
npx dotenv -e .env.local -- npm run db:migrate
```

Os arquivos de trabalho desta sessão (briefing dos agentes, scripts de workflow, artboards,
capturas) estão em
`/private/tmp/claude-501/-Users-mateusnascimentonogueiradasilva-nba-projeto/07550cef-2348-48be-8639-a9e943add6b5/scratchpad/`
— fora do repositório e **efêmeros**. Os artboards aprovados estão em `scratchpad/design-04/`;
se sumirem, o canvas publicado é a fonte:
https://claude.ai/code/artifact/1729850b-6767-4920-b583-f225fdbb7d69

## 8 · Primeira coisa a fazer

```bash
cd /Users/mateusnascimentonogueiradasilva/nba-projeto-ux && git log --oneline -12
cd /Users/mateusnascimentonogueiradasilva/nba-projeto-ux-a && git status && git diff --stat
cd /Users/mateusnascimentonogueiradasilva/nba-projeto-ux-c && git status && git diff --stat
```

Depois: fechar 3.1 (revisar e commitar o Fire Live), fechar 3.2 (três testes vermelhos),
integrar os dois na `ux-sofascore`, rodar a bateria, fase 6, loop da §10, publicação.
