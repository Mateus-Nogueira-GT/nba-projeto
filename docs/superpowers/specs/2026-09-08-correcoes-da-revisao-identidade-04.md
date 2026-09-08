# Correções da revisão adversarial · Identidade 04

**Data:** 08/09/2026 · **Status:** rascunho para decisão do parceiro — nada daqui está mesclado;
os fluxos estão pausados a pedido dele
**Complementa:** [`Identidade 04 · Varredura e análise`](2026-09-07-ux-varredura-e-analise-design.md)
(spec) e o [plano](../plans/2026-09-07-ux-varredura-e-analise.md)
**Fontes:** os relatórios das duas rodadas de revisão adversarial (26 achados e 5 dúvidas), os
commits de correção já aplicados e o trabalho interrompido nos worktrees B e C

---

## 1 · O que esta spec é

A Identidade 04 foi implementada em três frentes paralelas, cada tarefa passando por
implementação com teste primeiro, **duas revisões adversariais independentes** e correção. As
revisões funcionaram: acharam defeitos reais que a suíte não pega. Mas os corretores automáticos
foram interrompidos duas vezes pelo limite de sessão, e o que sobrou é este inventário — o que
já foi corrigido, o que está pendente, e **o que não é defeito, é decisão**.

A regra que organiza tudo aqui é a regra 3 do `CLAUDE.md`: *nunca inventar regra que o cliente
não definiu*. Vários achados parecem defeitos e são, na verdade, perguntas sem dono. Estes vão
para a seção 5 e **param** até o parceiro responder. O resto vira correção com teste.

## 2 · Onde cada coisa está

| Frente | Commitado e revisado | Interrompido no meio (sem commit) |
| --- | --- | --- |
| A · Lista e Fire Live | Lista por jogo · barra com marcos · correções da barra | nada — worktree limpo; falta a **tela** do Fire Live (task 2.2) |
| B · Detalhe e Resultados | detalhe do apito · Resultados por rodada | correções dos Resultados (9 arquivos) |
| C · Estatísticas | tela do jogador · primeira rodada de correções | segunda rodada de correções (11 arquivos, inclui a hierarquia do time pela metade); faltam **time** (5.2) e **índice e partida** (5.3) |

O trabalho interrompido **não está verificado**. A lição de 07/09 vale: commit existir não é commit
verde. Nada dele entra sem passar pela bateria (`typecheck`, `lint`, `boundaries`, suíte inteira).

A árvore da apresentação (`nba-projeto`, branch `temporada-simulada`) e o banco do Neon não
foram tocados por nada disto.

## 3 · O que já foi corrigido

### 3.1 · Lista Secreta (aplicado à mão, commit `8903ee8` na frente A)

- **A odd voltou a obedecer o ruleset.** A tarefa tinha passado o card a escrever sempre a faixa,
  com `media` virando só rótulo — revertendo no código a decisão homologada do parceiro
  (`odds.exibicao: media`, 25/08) e quebrando o teste que a protege. A materialização é que aplica
  a chave (suprime `media` do item quando `exibicao: faixa`) e o card só desenha o que recebe; com a
  tela escolhendo a forma, virar a chave no YAML deixaria de mudar o produto. O teste de tela deixou
  de exigir uma das duas formas e passou a exigir o que importa: **nenhuma odd aparece sem dizer o
  que é**.
- **Apito não some mais em silêncio.** As abas de atributo eram montadas só com os atributos que já
  têm linha; um jogador com um apito com linha e outro sem perdia o segundo da tela inteira. Todos
  entram; a aba sem linha escreve só "REB" — nunca "REB 0+".
- **A aba ativa veste a cor do nível do apito daquele card.** Era verde fixo (o artboard a desenha
  num card N3), o que fazia um card N1 exibir o sinal de N3: um quarto canal de cor contradizendo o
  anel. Entraram as tintas a 12% dos outros níveis, no molde do `verdeVeu12`.

### 3.2 · Barra do Fire Live (commit `112fd34`, frente A)

Brilho quente só no **modo fire** (era em todo card quente — o brilho deixava de sinalizar); todo
número da barra em pt-BR pela mesma `decimalPtBr` do resto do card; o guard "ainda sem apito"
deixou de ser um zero disfarçado.

### 3.3 · Tela do jogador (commit `e49e2fc`, frente C)

Estado do apito com três valores (conferido · não jogou · aguardando dado oficial) em vez de um
booleano; a tabela cortada em 25 partidas passou a **dizer** que está cortada; o "mando único"
entrou — mas escolheu a fonte errada, e por isso está reaberto na seção 4.3.

## 4 · Correções pendentes

Cada item traz o defeito, a causa, a correção proposta e o teste que a trava. Onde a correção
depende de uma resposta do parceiro, o item aponta para a seção 5 e **não anda sem ela**.

### 4.1 · Fire Live

**4.1.1 · A tela ainda não existe.** A task 2.2 (por jogo com placar do 1º Q, os três estados
NO 1º Q AGORA · AGUARDANDO · 1º Q ENCERRADO, carimbo "atualizado há N s") não foi iniciada. É a
maior pendência da passada.

**4.1.2 · O valor no instante do apito não existe como dado.** `ItemFireLive.apitadoEm` é o
*horário* do apito, não o *valor* do jogador no atributo naquele instante. Sem esse valor, o ponto
"apitou aqui" da barra (artboard e spec §4.2) não tem o que marcar. Correção proposta: o ponto só
aparece quando o dado existe; hoje, nunca — e a materialização do Fire Live passa a gravar o valor
observado no instante do apito. **Não é regra de estratégia**, é registro de fato; mas é mudança de
dado e vai para a seção 5 (item 7) como decisão de fechamento.

**4.1.3 · Errata dos artboards.** `FireLive.dc.html` desenha o marco do modo fire a 62% num alvo em
que a conta dá 72,7%, e tira o brilho do terceiro card. O código segue a conta e a regra "brilho =
modo fire". Registrar a errata no canvas para a próxima leitura não reabrir a discussão.

**4.1.4 · Um symlink de `node_modules` entrou no histórico** da frente A pelo commit da Lista
(`8903ee8`); a correção da barra tirou-o do índice e fechou a fresta no `.gitignore` (`node_modules/`
só casava diretório). O blob continua no histórico da branch. Correção: no fechamento, antes do
pull request, reescrever o commit da Lista sem o link (`rebase` da frente A). Não é defeito de
tela; é higiene de histórico que não pode ir para a `main`.

### 4.2 · Resultados (frente B; a maior parte já está codificada no trabalho interrompido)

| # | Defeito | Correção proposta | Depende de |
| --- | --- | --- | --- |
| 1 | `/resultados` cai na rodada de **hoje** e escreve "APITOS 0 · BATERAM 0 · NA NOITE —" sobre 29 cards pré-live logo abaixo | `/resultados` sem data leva à **última rodada com conferência** (o "recap da noite" é a noite que terminou); a rodada em curso, quando aberta pela data, escreve o número de apitos **publicados** e "aguardando o fim da noite" no lugar da taxa | §5 · item 3 |
| 2 | A faixa da temporada conta uma rodada que ainda não contribuiu ("20 rodadas · 274 de 400", os mesmos 274 de 400 de ontem sob "19 rodadas") | `rodadas` conta só rodadas com pelo menos um conferido | — |
| 3 | O apito da noite ignora o turbo: a spec §4.4 diz "maior valor sobre a linha **ou** o turbo que bateu", e `JogadorConferido` nem carrega `turbo` | `JogadorConferido.turbo` sai da entrega; o desempate segue a spec | — |
| 4 | Mando e adversário deduzidos pelo **time real do provedor**; com elenco projetado (Giannis no Miami) o confronto some do card ou inverte, e a sigla diverge da que a Lista mostra para o mesmo apito | o card lê o time da **lista do CJ**, como a Lista Secreta já faz — mesma regra da seção 6 | seção 6 |
| 5 | As seções de jogo saem na ordem do heap do Postgres (mudam entre dois carregamentos) | `orderBy(dataHoraUtc)`, a mesma gramática da Lista | — |
| 6 | O carimbo de "aguardando dado oficial" é o `atualizado_em` **mais recente da rodada**, impresso sob o jogo que está esperando — frescor que ele não tem | carimbo por **jogo** | — |
| 7 | A inversão das barrinhas foi posta **dentro do `CardEntrada`** e virou a fileira em três telas que não são desta task (Lista, /como-funciona, galeria) | quem monta a fileira decide a ordem (`Barrinhas.destacarUltima`, como a task pedia); o card volta a não inverter | — |
| 8 | Greens do Fire Live escrevem "Pontos 25", que nesta tela lê-se como **linha** | "25 pontos no 1º quarto" | — |
| 9 | O teste de escrita só verifica "sem decimal no %" numa página em que não há % | repetir a asserção na rodada em curso, onde o % existe | — |
| 10 | Um revisor pediu que o teste voltasse a exigir a faixa da odd | **rejeitado**: o ruleset decide (§3.1); registrado aqui para não voltar | §5 · item 4 |
| 11 | DNP conta como ✗ na taxa (`conferirRodadas`) enquanto o perfil o trata como neutro | seguir a spec (§4.4 e §5.1: DNP é neutro, fora do numerador e do denominador) **muda o número da taxa** | §5 · item 1 |

### 4.3 · Tela do jogador (frente C; parte já codificada no trabalho interrompido)

**4.3.1 · O mando único escolheu a fonte errada — bloqueia.** A primeira correção fez a seção
de apitos ler o mando pelo `jogadores.time_id` (time real). Mas o apito **nasce** grudado no jogo do
time da **lista do CJ** (`montarFatos` monta o elenco por `niveis.time_id`). No elenco projetado, que
o `CLAUDE.md` descreve como a norma, o time real não está em nenhum dos dois lados daquele jogo: a
seção de apitos passou a imprimir "—" no lugar do adversário. E o detalhe do apito responde a mesma
pergunta pela regra oposta. Correção: a regra única da seção 6.

**4.3.2 · O rótulo "temporada 2025-26" cobre uma tabela que a consulta nunca filtrou por
temporada.** Quando o jogador tem 25 partidas ou menos, o aviso de corte some e a seção volta a
nomear uma temporada que pode não ser a das linhas. Correção: ou o histórico filtra por temporada
(como `medias` já faz), ou o auxiliar diz o que é ("últimos N jogos").

**4.3.3 · Dois links iguais no hero.** Quando time atual e time da lista coincidem, o apoio traz
duas âncoras laranja com o mesmo destino, lado a lado. Correção: uma só; a outra vira texto.

**4.3.4 · Minutos nulos.** Box com `minutos: NULL` e linha zerada agora cai em "aguardando dado
oficial" no perfil, mas `conferirRodadas` conta "fez 0 ✗" nos Resultados para a mesma
(jogo, jogador, atributo). É o mesmo caso do item 11 de 4.2, com o sinal invertido — depende da
mesma resposta (§5 · item 1).

**4.3.5 · Telas que faltam.** Time com a hierarquia do CJ por atributo e o desfalque em prefixo
(5.2 — o componente `HierarquiaDoTime` já existe no trabalho interrompido, com 11 testes verdes)
e índice com classificação em tabela, jogos do dia em lista e o 1º quarto em destaque na partida
(5.3).

### 4.4 · Transversal

- **Relatório × commit.** Duas vezes o relatório do agente listou menos arquivos do que o commit
  tocou. Não é defeito de produto; é defeito de processo, e o loop da §10 da spec exige que o
  relatório seja a prova. Regra para a retomada: o relatório lista `git show --stat HEAD`, sem
  exceção.
- **Restilização global da `Tabela`** (feita na tela do jogador) chega ao índice, ao time e à
  partida antes de as tasks deles rodarem. Verificar nas três que legenda e ordem de leitura
  continuam corretas.

## 5 · Decisões do parceiro — o que não vai virar código sozinho

Nenhum destes itens é defeito. São perguntas que a spec, o ruleset ou o `CLAUDE.md` não respondem
por completo, e a regra é parar e perguntar.

1. **Quem não jogou conta como erro?** A spec (§4.4 e §5.1) diz que DNP é neutro: nem ✓ nem ✗.
   Mas `conferirRodadas` — que alimenta a taxa da noite e a **taxa da temporada, o argumento de
   venda** — conta DNP como ✗ hoje. Seguir a spec **muda o número**: hoje o gate mostra 181 de 268;
   com DNP fora do denominador, os dois números caem e a taxa sobe. Há ainda o caso vizinho, criado
   pela correção da tela do jogador: box com minutos nulos e linha zerada. **Proposta:** seguir a
   spec nos dois casos (neutro, fora do numerador e do denominador), registrar a mudança de número
   no commit e no PR. Precisa do seu "sim".
2. **O rodapé do card conferido mostra a odd?** A spec (§4.4) escreve `PONTOS 24+ · ODD 1,30–1,70`
   recebendo `fez 27 ✓`; o artboard desenha só `Pontos 15+` e `fez 25`. O código seguiu o artboard
   (o veredito ocupa o lado direito; os dois não cabem a 390 px). **Proposta:** artboard manda; a
   spec ganha a errata.
3. **O que `/resultados` mostra durante a noite?** A tela padrão do assinante caía na rodada de
   hoje com zeros. **Proposta** (já codificada no trabalho interrompido): sem data, a última rodada
   conferida; a rodada em curso, quando aberta, diz "N apitos publicados · aguardando o fim da
   noite" — nunca uma taxa inventada de parcial.
4. **Odd média ou faixa.** O ruleset diz `media` (sua decisão de 25/08, reaberta com o CJ); o
   `docs/04-design-system.md` ainda diz "sempre faixa". O código obedece o ruleset. **Proposta:** o
   ruleset governa; o `docs/04` recebe a errata dizendo que a forma é chave de ruleset e que a
   regra de escrita é "nenhuma odd sem dizer o que é". Quando o CJ responder, muda-se a chave, não o
   código.
5. **"MÉDIA" duas vezes no rodapé** — `MÉDIA 3,4 · ODD MÉDIA 1,55`, dois sentidos na mesma linha
   de 12 px. É anterior a esta passada e é redação, não código. **Proposta:** `MÉD. 3,4 · ODD MÉDIA
   1,55` ou `3,4 NA TEMP. · ODD MÉDIA 1,55`; precisa de você porque o vocabulário é do CJ.
6. **Erratas nos artboards** (Fire Live: marco a 62% onde a conta dá 72,7%; brilho retirado do
   terceiro card; Resultados: rodapé conferido sem odd). Para registrar no canvas — quem edita o
   canvas é você ou eu com seu OK.
7. **Gravar o valor no instante do apito** (4.1.2). Mudança de dado na materialização do Fire
   Live, sem regra de estratégia. Sem ela, o ponto "apitou aqui" do artboard não existe.
   **Proposta:** fazer no fechamento, com migration própria.

## 6 · A regra única de mando e adversário

O defeito mais repetido das três frentes é o mesmo: **de que time é o jogador naquele jogo?** Há
dois vínculos, e eles divergem de propósito (`CLAUDE.md`): `jogadores.time_id` é o elenco real do
provedor; `niveis.time_id` é a curadoria projetada do CJ, que é o que a estratégia enxerga.

A regra que serve a todas as telas sem apagar dado, já rascunhada no trabalho interrompido da
frente C:

> **O lado do jogador é derivado do jogo.** Dado o jogo em questão, o time do jogador é aquele,
> entre os dois vínculos, que está naquela partida. Para o **apito** (Lista, Fire Live, Resultados,
> detalhe, seção de apitos do perfil) o jogo é o do time da lista — por construção do apito, ele
> sempre está. Para o **box score** (tabela jogo a jogo, tela de partida) o jogo é o real — o time
> real sempre está. Um jogador nunca fica sem lado; duas telas nunca discordam sobre a mesma
> partida.

Isto não é regra de estratégia: é leitura consistente de um fato que o sistema já grava. O teste
que a trava semeia um jogador cujo time da lista difere do real e afirma que as cinco telas
nomeiam o mesmo adversário para o mesmo apito.

## 7 · Ordem proposta na retomada

1. Frente B: fechar as correções dos Resultados com as respostas de §5 (itens 1 e 3) — o código
   está quase todo no worktree.
2. Frente C: reescrever o mando pela regra da §6, fechar 4.3.2–4.3.4, terminar time (5.2) e
   índice e partida (5.3).
3. Frente A: a tela do Fire Live (2.2), com o ponto "apitou aqui" condicionado ao dado (§5 · 7).
4. Rebase da frente A sem o symlink; integração das três na `ux-sofascore`; bateria inteira.
5. Fase 6 (galeria, `demo:conferir`, docs com as erratas de §5, capturas).
6. Loop de depuração da §10 até duas rodadas em silêncio; migration no Neon; pull request;
   merge — só se o loop não encontrar erro, que foi a condição do parceiro.

## 8 · O que continua proibido

Inventar resposta para qualquer item da §5; tocar o motor ou o ruleset; mudar a anatomia do card ou
a posição das abas (congeladas); silenciar teste; rodar qualquer coisa contra o Neon antes do
passo 6; deixar trabalho interrompido entrar sem a bateria.
