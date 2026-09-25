# Runbook — puxar a temporada 2025-26 para o ar

**Para quem vai operar o lançamento.** A ordem abaixo é sequencial e não
negociável: cada passo protege o seguinte. Executar fora de ordem tem
consequência silenciosa — dado inventado escrito por cima de dado real, sem
erro nenhum na tela.

**Contexto:** o app entra no ar antes de a NBA voltar. Sem este procedimento,
quem assina no primeiro dia vê números gerados pelo seed de demonstração.
Além de estatísticas e resultados reais, o motor NIP agora também roda sobre
2025-26 inteira: Resultados, Lista Secreta e Estatísticas ganham um seletor de
temporada. Ver [a spec de 22/09](../superpowers/specs/2026-09-22-temporada-retroativa-design.md)
e [a spec de 25/09](../superpowers/specs/2026-09-25-motor-temporada-anterior-design.md)
(que revoga a decisão 1 daquela: agora HÁ apito retroativo).

---

## Antes de começar

| Pré-requisito | Como conferir |
| --- | --- |
| Chave BALLDONTLIE do plano **GOAT** | o split por quarto (`period=1..4`) e `/stats` exigem GOAT; um plano menor devolve 403 |
| Acesso ao banco de produção | `DATABASE_URL` |
| Backup da lista do CJ fora do repo | além do arquivo de `lista-cj:backup`, guarde uma cópia fora do banco/servidor (a fonte também está em `data/fontes/introducao-ia-nba.md`) |
| Janela de ~30 min | o backfill em si leva ~13 min (§6); o motor retroativo é mais rápido que isso |

---

## 1 · GOAT ativo — retestar antes de tudo

```bash
curl -s "https://api.balldontlie.io/v1/stats?period=1&game_ids[]=<id>" -H "Authorization: $BALLDONTLIE_API_KEY"
```

Confirme que `/stats?period=1` responde (não 403) antes de gastar tempo nos
passos seguintes. Sem GOAT nada abaixo funciona.

## 2 · Guardar a lista do CJ (backup)

```bash
npm run lista-cj:backup
```

Exporta todas as versões de `niveis_versao`, `niveis` e `mapa_jogadores` para
um arquivo. **Guarde uma cópia fora do repositório também** (fora do disco do
servidor) — é o único jeito de reconstruir a lista se o passo 4 (limpeza) sair
errado. `niveis.jogador_id` aponta para os jogadores inventados da
demonstração: quando eles saem, as linhas de `niveis` saem junto, e o backup é
a única fonte para trazê-las de volta ligadas aos jogadores reais.

## 3 · Desligar a autossemeadura ANTES do backfill

```bash
vercel env rm DEMO_AUTOSSEMEADURA production
# ou defina explicitamente como false
```

**Por que vem antes:** o cron diário de demonstração ressemeia o banco. Se ele
rodar depois do backfill, escreve jogadores e jogos inventados por cima do
dado real — e a única evidência é o assinante vendo dois LeBron na busca.

## 4 · Ligar a ingestão real

```bash
vercel env add BALLDONTLIE_API_KEY production
vercel env add NBA_INGESTAO_HABILITADA production   # true
```

Hoje nenhuma das duas existe em produção. Sem a segunda, os jobs saem sem fazer
nada e o backfill termina "com sucesso" sem gravar linha alguma.

## 5 · Migrações 0033–0034, ANTES do deploy

```bash
npm run db:migrate
```

- **0033** — `estatisticas_jogo.time_id`: o time real do jogador naquele jogo
  (dado canônico, não estratégia). Migração aditiva; linhas antigas ficam
  nulas.
- **0034** — as tabelas retroativas (`apitos_retroativos`, `greens_retroativos`,
  `feed_retroativo`).

Rode isto antes de colocar o novo código no ar: o deploy espera as colunas e
tabelas já existirem.

## 6 · Conferir sem gravar, depois três dias de verdade

```bash
npm run ingestao:backfill -- --from=2025-10-21 --to=2026-04-12 --dry-run
```

O `--dry-run` percorre as datas e relata o que faria, sem tocar no banco. É
aqui que erro de chave, de plano ou de intervalo aparece — antes de qualquer
escrita.

**Comece menor.** Antes da temporada inteira, rode três dias de verdade e olhe
o resultado na tela:

```bash
npm run ingestao:backfill -- --from=2026-01-05 --to=2026-01-07
```

## 7 · Limpar a demonstração

```bash
npm run demo:limpar -- --confirmar
```

Apaga **somente o domínio** — jogos, jogadores, estatísticas, apitos. Contas,
sessões, assinaturas e inscrições de push **permanecem**: ninguém perde acesso
e ninguém precisa entrar de novo.

O `--confirmar` é obrigatório de propósito. Não existe versão automática deste
passo, e não deve existir.

## 8 · O backfill de verdade

```bash
npm run ingestao:backfill -- --from=2025-10-21 --to=2026-04-12
```

**Volume:** ~1.230 jogos × ~6 chamadas (jogo + total + 4 quartos) ≈ **7.400
requisições**. No limite de 600 req/min do GOAT, cerca de **13 minutos**.

**Se cair no meio:** o checkpoint por dia já existe (`checkpoints_ingestao`).

```bash
npm run ingestao:backfill -- --from=2025-10-21 --to=2026-04-12 --resume
```

Retoma do último dia concluído em vez de recomeçar do zero.

## 9 · Restaurar a lista do CJ contra os jogadores reais

```bash
npm run lista-cj:restaurar -- --arquivo=backups/lista-cj-<data>.json
```

**Isto não liga tudo sozinho.** Nome exatamente igual vira **sugestão**, nunca
vínculo automático — "nome nunca autoriza vínculo sozinho". O script imprime
quantas linhas de níveis já foram ligadas (só por vínculo confirmado antes) e
lista os nomes pendentes.

1. Abra **`/admin/mapeamento`**: cada nome pendente aparece lá, com a sugestão
   de nome exato quando existir. **O parceiro confirma um a um** (um clique
   por nome).
2. Depois das confirmações, **rode o comando de novo**:

   ```bash
   npm run lista-cj:restaurar -- --arquivo=backups/lista-cj-<data>.json
   ```

   Reexecutar **substitui os vínculos** e reconstrói, numa transação por
   versão, os níveis de cada versão restaurada — só os nomes confirmados até
   aquele momento geram `niveis`. Repita confirmação → restauração até não
   sobrar pendente relevante.

Sem isso a hierarquia de 2025-26 fica vazia e o motor retroativo não apita
ninguém.

## 10 · Rodar o motor sobre 2025-26

Primeiro a seco:

```bash
npx dotenv -e .env.local -- npm run motor:retroativo -- --de=2025-10-21 --ate=2026-04-12 --dry-run
```

**O que o `--dry-run` faz aqui é diferente do `--dry-run` do backfill (§6):**
ele só CONTA — quantas datas do intervalo têm jogo e quantos desses jogos
estão `ENCERRADO` — sem montar fatos nem simular apito nenhum. É uma conferência
de que o intervalo tem dado para processar, não uma prévia dos apitos que o
motor daria; o único jeito de ver os apitos é rodar de verdade (abaixo).

Depois de verdade:

```bash
npx dotenv -e .env.local -- npm run motor:retroativo -- --de=2025-10-21 --ate=2026-04-12
```

- O script **recusa a temporada do calendário** — só roda sobre uma temporada
  já encerrada. É proteção contra publicar por cima do que o job diário já
  publicou ao vivo.
- As datas são **validadas de verdade** (round-trip, não `Date.parse`): uma
  data inexistente como `2025-02-30` é rejeitada, não rolada para o mês
  seguinte.
- É **reexecutável**: rodar de novo não duplica (chave única
  `jogo_id, jogador_id, atributo, estrategia, linha`); se a lista do CJ mudar
  (passo 9 rodou de novo), rode o motor de novo para regravar a temporada com
  a versão nova.
- O intervalo inteiro tem de ser **uma temporada só**, e anterior à do
  calendário: `--de` e `--ate` em temporadas diferentes são recusados, com a
  mensagem dizendo quais são.

### 10.1 · Quando as telas mostram o que o script gravou

As telas leem as **datas** de 2025-26 e a **Lista** de cada dia por um cache
de servidor (`src/app/_cache/retroativo.ts`, constante
`REVALIDAR_RETROATIVO`), renovado a cada **60 minutos**. O script roda fora
do app e nenhuma rota sabe da temporada anterior, então **não há comando
para forçar a renovação** — e não se cria rota nova para isso.

Na prática:

- **Depois de rodar (ou rodar de novo) o `motor:retroativo`, espere até 60
  minutos** antes de conferir o passo 11 nas telas. Antes disso, uma tela que
  já tinha sido aberta pode mostrar as datas e a Lista de antes da rodada (ou
  nenhuma, se foi aberta antes da primeira).
- As consultas SQL do passo 11 leem o banco direto e já valem na hora.
- Os vereditos de Resultados (recap, greens e Fire Live) não passam por esse
  cache: aparecem na hora para as datas que o seletor já oferece.

## 11 · Conferir que funcionou

1. **Os jogadores de temporada passada entraram?** O resumo do backfill traz
   `jogadores_criados` — tem que ser maior que zero (quem jogou em 2025-26 e
   não está mais na liga).
2. **Os jogos estão na temporada certa?**

   ```sql
   SELECT date_trunc('month', data_referencia) AS mes, count(*)
     FROM jogos WHERE status = 'ENCERRADO' GROUP BY 1 ORDER BY 1;
   ```

3. **Alguma partida foi rejeitada por nome coincidente?**

   ```sql
   SELECT motivo, count(*) FROM conflitos_identidade_jogador GROUP BY 1;
   ```

   **Essa tabela não tem tela.** Se ela crescer no backfill, esta consulta é o
   único lugar onde isso aparece — e é sinal de que o passo 7 (limpar a
   demonstração) não rodou, ou rodou depois.

4. **O motor retroativo gravou?**

   ```sql
   SELECT date_trunc('month', data_referencia) AS mes, count(*)
     FROM apitos_retroativos GROUP BY 1 ORDER BY 1;
   ```

5. **Confira um dia em Resultados:** abra `/resultados?temporada=2025-26` numa
   data com jogos e veja os apitos com veredito e o bloco de greens do Fire
   Live.

6. **Confira um jogador conhecido em Estatísticas:** abra a página dele em
   2025-26 e veja "Apitos da estratégia" e a Hierarquia NIP do time dele
   naquela temporada.

---

## O que acontece sozinho depois

**A virada de consulta não precisa de ninguém.** Quando o primeiro jogo da
2026-27 encerrar, `temporadaExibida` passa a devolver a temporada nova e
Estatísticas (que seguem o padrão "exibida") acompanham. **Lista Secreta e
Resultados são diferentes**: fora do hiato eles abrem a temporada do
calendário direto (para não atrasar a abertura da Lista paga até o fim do
1º jogo); dentro do hiato, abrem 2025-26 por padrão. Em qualquer um dos casos,
o seletor de temporada na tela permite escolher a outra manualmente a
qualquer momento.

O piso que governa a virada de Estatísticas é
`temporada.minimo_jogos_para_exibir` no `config/ruleset.v1.yaml` — hoje `1`.
Subi-lo adia a virada sem tocar em código.

**Os dados de 2025-26 ficam.** Continuam em Estatísticas, Resultados e Lista
Secreta, indexados por temporada, e passam a servir de base real para o
backtest.

## Como desligar

Apagar `BALLDONTLIE_API_KEY` (ou pôr `NBA_INGESTAO_HABILITADA=false`) para a
ingestão. O que já foi gravado permanece — desligar não apaga nada. O motor
retroativo é um script de operação (não um cron): não desliga sozinho porque
nunca liga sozinho.

---

## O que este runbook NÃO faz

1. **Plano Pro da Vercel.** O Hobby permite dois crons diários; o Fire Live ao
   vivo (temporada corrente) precisa do job `ao-vivo` a cada minuto. O motor
   retroativo (2025-26) não depende disso — roda por comando, uma vez.
2. **Regras novas do CJ da reunião de 23/09** (rebotes 8 → 7, AST/REB ≥ 4,
   matchup) — spec própria, fora deste runbook.
3. **Odds retroativas** — o motor não usa odd para decidir apito; a falta
   delas não muda quem apita, só tira a pílula de odd do card em 2025-26.
