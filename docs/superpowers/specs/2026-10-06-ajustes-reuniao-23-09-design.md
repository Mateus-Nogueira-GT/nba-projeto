# Ajustes da reunião de 23/09 — Lista com rebotes e assistências, e dados de matchup

**Data:** 06/10/2026. **Origem:** ata do Gemini da reunião de 23/09 (CJ, Yago e equipe), repassada
pelo parceiro. Substitui o rascunho de perguntas
[2026-09-23-regras-cj-reuniao-23-09-design.md](2026-09-23-regras-cj-reuniao-23-09-design.md) nos pontos
que o parceiro decidiu.

## 1. Triagem da ata

| Item da ata | Dono | Situação |
| --- | --- | --- |
| Landing page de vendas | Yago | Já existe (`/conheca`). |
| Modo Turbo chamativo (raio e fogo) | Yago | Já existe (`SeloTurbo`). |
| Temas claro e escuro, azul claro como padrão | Yago | O parceiro: **"a parte de front não precisa mexer, já ajustamos"**. |
| Painel do jogador com confiança, médias e nível (ouro, prata, bronze) | Yago | Já existe. |
| Barras verde e vermelha contra a média | Yago | Já existe (`GraficoDesempenho`). |
| Filtros por posição, nível, time e quantidade (1–5, 10, 15, 20) | Yago | Já existe (`lista/Controles`). |
| Fonte mais chamativa no nível | Yago e Ana | Front. Fora daqui. |
| Rebotes "8 → 7 (7, 10, 3, 5, 7, 10)" | back | Ver §2.1. |
| Lista só com média ≥ 4 em AST e REB, fora do Fire Live | back | **Esta spec**, §2.2. |
| Dados de matchup | back | **Esta spec**, §3. |
| Testar compras pelos links de afiliado | grupo | Casas em stand-by (25/09). Fora. |
| Dados reais da temporada passada | back | Feito em 06/10 (spec `2026-10-06-dados-reais…`). |

## 2. Lista Secreta

### 2.1 Rebotes "8 → 7"

O parceiro lê os números como **faixas de nível do jogador**. No back, o All Star de rebotes já
começa em 7: `por_atributo.REBOTES.classificacao.ALL_STAR.min = 7`, documento do CJ de 21/09. O 8
que o CJ viu era um parâmetro provisório do front, de antes do dado real (o Yago explica isso na
ata). **Nada muda.** As faixas também não decidem apito: o nível do jogador vem da lista curada.
Os seis números (7, 10, 3, 5, 7, 10) não fecham com três faixas e continuam como pergunta para o CJ.

### 2.2 Ligar rebotes e assistências, com média mínima de 4

**Decisão do parceiro (06/10), ciente do custo:** ligar REB e AST na Lista **com as tabelas de
demonstração**. As tabelas de confiança e de odds de REB e AST não são do CJ. O assinante passa a
receber esses apitos com % e faixa de odd nossos, até o CJ mandar as dele.

- `niveis.atributos: [PONTOS, REBOTES, ASSISTENCIAS]`. Isso liga também o Fire Live de REB e AST,
  que já tem as regras do documento de 21/09: multiplicador 2,0 em rebotes e média mínima de 4 em
  assistências.
- **Regra nova, da reunião:** na **Lista Secreta**, por oscilação ou por OPD, só apita quem tem
  média ≥ 4 no atributo. Vale para REB e AST e para todos os níveis do jogador. A média é a mesma que
  o motor já usa (`media.janela`). Sem média, não apita. No Fire Live não muda nada.
- Fica no ruleset como `por_atributo.<ATRIBUTO>.lista_media_minima: 4`, e o motor lê a chave. Sem a
  chave, o comportamento continua igual ao de hoje. PONTOS não tem a chave.
- Os 103 nomes que a lista do CJ repete em REB e AST, com nível diferente, continuam fora: são
  dúvida de identidade, e nenhum deles entra.

## 3. Matchup: o dado, sem regra

O CJ define matchup como "enfrentar um time que cede muitos pontos ou erra muitas bolas de 3, o que
gera rebote e ponto extra". Ele não deu limites, então **não há apito de matchup**: o
`matchup.habilitado` continua `false`. O parceiro pediu para **mostrar o dado**.

No painel do apito, um bloco **Adversário** mostra o time real que o jogador enfrenta no jogo do
apito, com números da temporada daquele jogo, contando só os jogos anteriores à data:

- pontos cedidos por jogo, com a posição na liga (1º = o que mais cede);
- bolas de 3 erradas por jogo pelo adversário, com a posição;
- rebotes cedidos por jogo, com a posição.

É dado canônico (`estatisticas_time_jogo`), como a aba de estatísticas. Fica fora do motor e não
muda nenhum apito. Sem jogos anteriores, o bloco não aparece.

## 4. Fora do escopo

Front visual (temas, fontes, landing), afiliados (stand-by), a regra de matchup (falta o número do
CJ) e as tabelas de % e odds de REB e AST do CJ.

## 5. Riscos

- Apito de REB e AST com número de demonstração no celular de assinante pagante. Foi decisão
  explícita do parceiro e fica registrada no CLAUDE.md e no ruleset.
- O volume de apitos sobe: são três atributos. A Lista ganha linhas de REB e AST, e o retroativo de
  2025-26 é regravado com elas.
