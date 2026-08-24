# Demo viva + telas do documento do CJ — Design

**Data:** 2026-08-23 · **Estado:** aprovado em brainstorm (4 seções, uma a uma)
**Fonte de regras:** `data/fontes/introducao-ia-nba.md` (documento do CJ) + `config/ruleset.v1.yaml` (homologado 18/08)
**Decisões do parceiro:** escopo A+B+C+D (sem construtor de aposta, sem aba Gestão) · seed no banco de PRODUÇÃO (Neon), reversível · aba teórica exige sessão, não exige assinatura

## Problema

O app está em produção com todas as fundações (Specs 00–05 + partes de 06/07), mas
sem dados: toda tela mostra estado vazio. E três superfícies que o documento do CJ
define com precisão ainda não existem: o detalhe de linhas/percentuais do apito, a
página de introdução das estratégias (local definido pelo doc para o aviso de
blowout — resolve o gate G7 da Spec 08) e a filtragem completa da Lista Secreta.

Princípio central (abordagem escolhida): **semear fatos, nunca resultados**. O seed
escreve matéria-prima nas tabelas de domínio e o pipeline REAL (`publicarListaSecreta`,
`executarCiclo`) calcula os apitos. A demo é uma prova viva do motor: os cenários do
seed são os exemplos numéricos do próprio documento, então teoria e telas contam a
mesma história.

## Peça A · Seed de demonstração

**Arquivos:** `scripts/demo-seed.ts`, `scripts/demo-limpar.ts` (padrão vite-node do
bootstrap-admin) + scripts npm `demo:seed` e `demo:limpar` (com flag `--confirmar`).
Rodam via `dotenv -e .env.local` contra o Neon.

Cinco atos, todos idempotentes (upsert por chave natural):

1. **Elencos** — `lerListaDeNiveis()` sobre o md do CJ → 30 times (siglas via
   `ingestao/niveis/times.ts`), ~230 jogadores canônicos, `niveis_versao` `demo`
   ativa com hierarquia e níveis do documento. Posições (G/F/C) atribuídas
   deterministicamente (hash do nome) — `jogadores.posicao` já existe no schema.
2. **Médias** (`medias_jogador`, temporada corrente, janela TEMPORADA) — números do
   doc quando dados (Shai 31 ppg, KAT 20, Jokic 12.9 rpg, Gordon 16, LeBron 25.7,
   Fontecchio 8.5, Murray 7 apg...); demais por faixa de nível (MVP 27–31,
   ALL_STAR 18–23, SUPORTE 11–16, RANDOLA 5–9), determinísticos por jogador.
3. **Histórico** — 6 jogos passados por time da rodada com `estatisticas_jogo`
   moldados para os exemplos canônicos: LeBron média 25,7 + jogo de 16 → oscilação
   nível 1; um All-Star com 2 jogos ≤ limiar → nível 2; Curry com 3 → nível 3 +
   turbo azul. Povoa também a aba de estatísticas (vitórias, médias, histórico).
4. **Rodada de hoje** — 4 jogos: LAL×PHI com Luka `FORA` em `lesoes_escalacao` →
   OPD 3/2/1 em Reaves/Grimes/Kessler (exemplo literal do doc); OKC×DEN `AO_VIVO`
   `quartoAtual=1` com `estatisticas_quarto`: Shai cruza o alvo 12 e chega a 24
   (75% da média → modo fire; green no marco 20); mais 2 jogos AGENDADOS para os
   estados da tela Fire Live.
5. **Motor** — `publicarListaSecreta({ignorarAntecedencia:true})` e, para cada jogo
   ao vivo, `executarCiclo()` (com `fireLiveExecucoes` semeada) → apitos, greens e
   snapshots materializados pelo caminho de produção. Nenhum resultado escrito à mão.

**`demo:limpar --confirmar`** trunca SOMENTE domínio: feed_snapshot, greens, apitos,
fire_live_execucoes, estatisticas_quarto, estatisticas_jogo, lesoes_escalacao,
medias_jogador, niveis, niveis_versao, identidades, mapa_jogadores, jogos,
jogadores, times. Preserva plataforma (usuarios, sessões, direitos, push, eventos
de pagamento). Imprime contagens do que apagou.

**Testes:** helpers puros do seed (geração determinística de médias/posições;
montagem dos cenários de oscilação) com unit tests; um teste PGlite roda o seed
completo num banco vazio e afirma: Reaves com `opdOrigemNivel=3`, LeBron apito
nível 1, Curry turbo, snapshot FIRE_LIVE do OKC×DEN com modo fire de Shai e green 20.

## Peça B · Detalhe do apito — `/apito/[jogadorId]`

Server component `force-dynamic`, guarda idêntica ao feed (sessão + direito). Lê o
snapshot do dia via helper novo `linhasDoJogador(db, dataReferencia, jogadorId)`
em `entrega/lista-secreta.ts` (agrupa os itens por jogador — cada item do feed já É
uma linha com confiança calculada pelo motor, bônus incluído).

Layout: `CardEntrada` do jogador no topo → grade de "quadradinhos", um por linha
(`25 PTS · 92%`) com a faixa de odds da linha vinda de
`ruleset.odds.tabela_estatica[nivel][linha]` (rotulada "tabela de referência"
enquanto não há casas — G4) → rodapé P12 obrigatório ("% é nota de confiança da
análise, não probabilidade") + última atualização. Jogador sem apito hoje → estado
vazio explicado, nunca erro.

Navegação: o card na home ganha o link "linhas e confiança →" para esta rota; o
nome do jogador CONTINUA levando às estatísticas (os dois caminhos da visão).

**Testes:** `linhasDoJogador` no PGlite (agrupamento, ordenação de linhas, jogador
ausente); teste de guarda por leitura de fonte (padrão dos painéis admin).

## Peça C · Aba teórica — `/como-funciona`

Guarda: `sessaoAtual()` obrigatória; `avaliarAcesso` NÃO exigido (vitrine para o
logado sem assinatura). Links "Como funciona →" no cabeçalho da home e do Fire Live.

Duas peças:

1. **`entrega/teoria/conteudo.ts`** — view-model 100% derivado do ruleset: deltas
   de oscilação (com a exceção nominal `luka-doncic: 7`), `nivel_minimo_apito`,
   mapa OPD, turbos (oscilação e OPD), tabela de confiança base + bônus, tabela
   estática de odds, multiplicadores/travas/75% do Fire Live, `times_isentos` do
   bloco de topo, marcos de green por nível, blowout (quarto, diferença, aplica_a)
   e nota do matchup (`liberar_apos_dias_de_competicao`). **Teste:** view-model
   comparado campo a campo contra `carregarRuleset(yaml)` — trocar o YAML muda a
   página sem tocar código (regra 1 verificável).
2. **`page.tsx`** — prosa adaptada do documento (sem instruções internas),
   ilustrada com componentes reais: 4 selos de nível nas cores oficiais
   (dourado/prateado/bronze/preto), círculos amarelo/laranja/verde e turbo azul
   via `Anel`, um `CardEntrada` de exemplo por conceito usando os exemplos do doc.
   Ordem: níveis → oscilação → OPD → turbo → confiança & linhas (ressalva P12 em
   destaque) → odds ("aproximação, nunca odd fixa") → Fire Live → greens & push →
   **box do aviso de blowout** (RESOLVE G7: o doc define este local) → matchup.

## Peça D · Filtros completos da Lista Secreta + um card por jogador

Query-string na home: `metodo` (todos/oscilação/OPD/turbo), `nivel` (4 níveis,
chips nas cores dos selos), `time` (siglas com apito no dia), `posicao` (G/F/C),
combinando com o `quantidade` atual.

Mudanças de dado: `ItemFeed` ganha `metodo` e `posicao` (o `enriquecer()` passa a
carregá-los; snapshot antigo sem os campos → `null`, sem quebra; re-seed regenera).
Sem migration — `jogadores.posicao` já existe.

Acerto da home: hoje cada linha vira um card e o jogador se repete. Passa a ser
**um card por jogador** (linha de maior confiança como resumo) com "linhas e
confiança →" para o detalhe — a "barra do jogador + quadradinhos" do documento.
Helper puro `filtrarItens(itens, filtro)` + `agruparPorJogador(itens)` em
`entrega/lista-secreta.ts`.

**Testes:** combinações de filtros, valor desconhecido → vazio explicado (não
erro), snapshot legado sem `metodo/posicao`, agrupamento escolhe a maior confiança.

## Fora de escopo (decisão explícita)

Construtor de aposta (E) e aba Gestão (F — o "modelo completo" do CJ não está no
repo; construí-la violaria a regra 3). Matchup segue `habilitado: false` — só a
nota na teórica. Fotos de jogadores e escudos: placeholders tipográficos do design
system (sem assets licenciados).

## Ordem de implementação e verificação

D (dados no ItemFeed) → A (seed usa o formato novo) → B → C. Cada peça: teste
primeiro, `typecheck + lint + boundaries + vitest` limpos, commit. Ao final:
`demo:seed` contra produção + smoke manual nas 4 superfícies + deploy.
