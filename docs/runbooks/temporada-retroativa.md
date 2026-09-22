# Runbook — puxar a temporada 2025-26 para o ar

**Para quem vai operar o lançamento.** A ordem abaixo é sequencial e não
negociável: cada passo protege o seguinte. Executar fora de ordem tem
consequência silenciosa — dado inventado escrito por cima de dado real, sem
erro nenhum na tela.

**Contexto:** o app entra no ar antes de a NBA voltar. Sem este procedimento,
quem assina no primeiro dia vê números gerados pelo seed de demonstração. Ver
[a spec de 22/09](../superpowers/specs/2026-09-22-temporada-retroativa-design.md).

---

## Antes de começar

| Pré-requisito | Como conferir |
| --- | --- |
| Chave BALLDONTLIE do plano **GOAT** | o split por quarto (`period=1..4`) e `/stats` exigem GOAT; um plano menor devolve 403 |
| Acesso ao banco de produção | `DATABASE_URL` |
| Janela de ~20 min | o backfill em si leva ~13 min (ver §4) |

---

## 1 · Desligar a autossemeadura ANTES de tudo

```bash
vercel env rm DEMO_AUTOSSEMEADURA production
# ou defina explicitamente como false
```

**Por que é o passo 1:** o cron diário de demonstração ressemeia o banco. Se ele
rodar depois do backfill, escreve jogadores e jogos inventados por cima do dado
real — e a única evidência é o assinante vendo dois LeBron na busca.

## 2 · Ligar a ingestão real

```bash
vercel env add BALLDONTLIE_API_KEY production
vercel env add NBA_INGESTAO_HABILITADA production   # true
```

Hoje nenhuma das duas existe em produção. Sem a segunda, os jobs saem sem fazer
nada e o backfill termina "com sucesso" sem gravar linha alguma.

## 3 · Conferir sem gravar

```bash
npm run ingestao:backfill -- --from=2025-10-21 --to=2026-04-12 --dry-run
```

O `--dry-run` percorre as datas e relata o que faria, sem tocar no banco. É aqui
que erro de chave, de plano ou de intervalo aparece — antes de qualquer
escrita.

**Comece menor.** Antes da temporada inteira, rode três dias de verdade e olhe o
resultado na tela:

```bash
npm run ingestao:backfill -- --from=2026-01-05 --to=2026-01-07
```

## 4 · Limpar a demonstração

```bash
npm run demo:limpar -- --confirmar
```

Apaga **somente o domínio** — jogos, jogadores, estatísticas, apitos. Contas,
sessões, assinaturas e inscrições de push **permanecem**: ninguém perde acesso e
ninguém precisa entrar de novo.

O `--confirmar` é obrigatório de propósito. Não existe versão automática deste
passo, e não deve existir.

## 5 · O backfill de verdade

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

## 6 · Conferir que funcionou

Três perguntas, nesta ordem:

1. **Os jogadores de temporada passada entraram?** O resumo do job traz
   `jogadores_criados`. Num backfill de temporada inteira ele **tem** que ser
   maior que zero: é o contador de quem jogou em 2025-26 e não está mais na
   liga. Zero significa que a resolução por id não rodou — e que partidas foram
   descartadas.
2. **Os jogos estão na temporada certa?**

   ```sql
   SELECT date_trunc('month', data_referencia) AS mes, count(*)
     FROM jogos WHERE status = 'ENCERRADO' GROUP BY 1 ORDER BY 1;
   ```

3. **Alguma partida foi rejeitada por nome coincidente?** Quando o provedor
   devolve um jogador cujo nome já existe no cadastro canônico, ele **não** é
   criado: vira uma linha em `conflitos_identidade_jogador` para curadoria
   humana — nome nunca autoriza unir identidades de provedores diferentes. A
   partida daquele jogador continua sendo rejeitada até alguém decidir.

   ```sql
   SELECT motivo, count(*) FROM conflitos_identidade_jogador GROUP BY 1;
   ```

   **Essa tabela não tem tela.** Se ela crescer no backfill, a consulta acima é
   o único lugar onde isso aparece — e é sinal de que o passo 4 (limpar a
   demonstração) não rodou, ou rodou depois.

4. **A tela mostra?** Abra `/estatisticas`. O rodapé diz **qual temporada está
   sendo exibida** — durante o hiato deve dizer `2025-26`, mesmo que o
   calendário já esteja em 2026-27. Se disser 2026-27 e a tela estiver vazia, o
   backfill não gravou.

---

## O que acontece sozinho depois

**A virada não precisa de ninguém.** Quando o primeiro jogo da 2026-27 encerrar,
`temporadaExibida` passa a devolver a temporada nova e as cinco telas de
consulta seguem junto. Sem deploy, sem editar ruleset, sem apertar botão.

O piso que governa isso é `temporada.minimo_jogos_para_exibir` no
`config/ruleset.v1.yaml` — hoje `1`. Subi-lo adia a virada da consulta sem tocar
em código.

**Os dados de 2025-26 ficam.** Continuam em Estatísticas e Resultados, indexados
por temporada, e passam a servir de base real para o backtest.

## Como desligar

Apagar `BALLDONTLIE_API_KEY` (ou pôr `NBA_INGESTAO_HABILITADA=false`) para a
ingestão. O que já foi gravado permanece — desligar não apaga nada.

---

## O que este runbook NÃO faz

Duas coisas precisam acontecer **antes de ~03/11**, e nenhuma delas está aqui:

1. **Reimportar a lista de níveis do CJ** contra os jogadores reais. Enquanto
   `niveis` apontar para jogadores da demonstração, o motor não apita ninguém.
   É curadoria humana, com confirmação em `/admin/mapeamento`.
2. **Plano Pro da Vercel.** O Hobby permite dois crons diários; o Fire Live
   precisa do job `ao-vivo` a cada minuto.

Durante o hiato nada disso é necessário: por decisão do parceiro não há apito
retroativo, e as telas de Lista e Ao Vivo explicam a espera.
