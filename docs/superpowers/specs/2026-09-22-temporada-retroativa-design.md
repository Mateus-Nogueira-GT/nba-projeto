# Temporada retroativa — dado real antes de a bola subir

**Data:** 22/09/2026 · **Status:** spec escrita; as três decisões de produto foram
fechadas pelo parceiro no mesmo dia (seção 2). **Aprovada para execução.**

**Contexto:** o lançamento é por volta de **02/10/2026** e a NBA só volta por volta de
**03/11/2026** — cerca de **32 dias no ar sem uma bola quicando**. Hoje quem preenche
esse vazio é o seed de demonstração, que escreve fatos inventados (`docs/demonstracao.md`).
A decisão do parceiro é trocá-lo por **dado real da temporada 2025-26**, lido do
BALLDONTLIE, para que o assinante que pagar no primeiro dia não veja número inventado.

---

## 1 · Objetivo em uma frase

Durante o hiato o app mostra **estatísticas, classificação e resultados reais da
2025-26**, e quando a 2026-27 começar a virada acontece **sozinha** — sem deploy, sem
editar ruleset, sem alguém lembrar de apertar um botão numa terça-feira.

---

## 2 · As três decisões do parceiro (22/09/2026)

| Pergunta | Resposta | O que ela compra |
| --- | --- | --- |
| Telas de apito durante o hiato | **Só consulta, sem apito** | Lista Secreta e Ao Vivo não publicam nada. Não existe apito retroativo, então não existe a chance de o assinante ler um jogo de março como entrada sugerida de hoje. É a decisão que mais reduz risco e mais reduz trabalho. |
| Média na virada da temporada | **Só a temporada nova** — a P1 ao pé da letra | O motor e o ruleset **não mudam**. Nenhuma regra nova é inventada (regra 3). |
| 2025-26 depois da virada | **Fica em Estatísticas e Resultados** | O modelo de dados já indexa tudo por temporada; não precisa de migration nem de expurgo. |

A segunda decisão tem um custo que fica registrado aqui para não ser descoberto em
novembro: com a média saindo só da temporada corrente, **no primeiro dia de jogos a
média de um jogador é um jogo**. O `minimo_jogos: 10` do ruleset vale só para a sugestão
do assistente, não para os apitos — não há piso de amostra no motor. Isso é fiel à P1 e
foi escolhido de olhos abertos; vira pergunta ao CJ na seção 10, não bloqueio.

---

## 3 · O que o provedor entrega

Confirmado em `docs.balldontlie.io` em 22/09/2026, para o plano **GOAT** e
`season=2025` (a temporada 2025-26):

| Dado | Cobertura | Serve? |
| --- | --- | --- |
| Jogos | 1946 → hoje | sim |
| Box score por jogador (`/stats`) | GOAT | sim |
| Split por quarto (`period=1..4`) | **2023+** | sim — e `period` só é aceito em jogo **encerrado**, que é exatamente o caso |
| Classificação (`/standings`) | 1996+ | sim |
| Jogadores (`/players`) | ativos **e** inativos | sim — é a peça que falta hoje (5.1) |
| Jogadores (`/players/active`) | só quem está ativo HOJE | é o que o adapter usa, e é o defeito |
| Odds e player props | 2025+ | fora desta spec |

Rate limit do GOAT: 600 req/min. Uma temporada inteira são ~1.230 jogos × ~6 chamadas
(jogo + total + 4 quartos) ≈ 7.400 requisições — cerca de **13 minutos** de relógio no
limite do plano. O backfill não é uma operação cara; é uma operação frágil, e a seção 5
diz por quê.

---

## 4 · Fronteira e regras que governam

1. **Regra 1 (nenhum número mágico no código).** O único número novo desta spec — o piso
   de jogos que faz a temporada corrente virar a temporada exibida — vai para o ruleset,
   em bloco operacional, no precedente de `avisos.dado_parado` (T3 da spec 08).
2. **Regra 2 (motor puro).** `src/modules/motor/**` **não é tocado por esta spec.** Nem
   um arquivo.
3. **Regra 3 (não inventar regra).** A decisão sobre a média foi tomada pelo parceiro e é
   a regra que já existia. Nada de estratégia muda.
4. **A exceção da aba de estatísticas** (`CLAUDE.md`) é o que torna esta spec segura: o
   dado retroativo alimenta **consulta**, que por decisão já documentada usa
   `jogadores.time_id` — o time REAL do provedor — e não o elenco curado do CJ. Nenhum
   vínculo de curadoria é tocado, nenhum `niveis` é reescrito, e o motor não vê nada
   disto.
5. **ADR-0002.** O ruleset ativo continua no disco e no git.

---

## 5 · Os quatro problemas reais

### 5.1 O backfill morre no primeiro aposentado — e leva o jogo inteiro junto

`src/modules/ingestao/sincronizar/partida.ts:102-109`: se **qualquer** linha do box score
trouxer um `jogadorIdExterno` que não está em `identidades_jogador`, o snapshot é
rejeitado inteiro, com exceção.

```ts
if (desconhecidos.length > 0) {
  throw new Error(`snapshot rejeitado: ${desconhecidos.length} jogador(es) sem identidade em ${provedor}`)
}
```

Não é "pula a linha": é **descarta a partida**. E o cadastro de jogadores vem de
`/players/active` (`balldontlie.ts:533`), que traz só quem está na liga **hoje**. Na
temporada 2025-26 jogou gente que depois se aposentou ou saiu — cada partida com um
desses falha por completo. Rodar o backfill hoje é varrer uma temporada para colher erro.

A rejeição em si está **certa** e não deve ser afrouxada: ela é o que impede o box score
de gravar estatística órfã. O que precisa existir é o jogador.

### 5.2 As telas vão pedir uma temporada que estará vazia

`temporadaDe` (`dominio/temporada.ts`) resolve pelo calendário: com `mes_inicio: 10`,
**em 02/10/2026 a temporada já é "2026-27"** — que terá zero jogos por mais um mês.

Cinco lugares pedem a temporada assim:

| Arquivo | Linha |
| --- | --- |
| `src/app/(app)/estatisticas/page.tsx` | 461 |
| `src/app/(app)/estatisticas/time/[id]/page.tsx` | 284 |
| `src/app/(app)/estatisticas/jogador/[id]/page.tsx` | 461 |
| `src/app/(app)/lateral/montar.tsx` | 36 |
| `src/app/api/chat/route.ts` | 110 |

Ou seja: **o backfill pode funcionar perfeitamente e o assinante ver tela vazia mesmo
assim.** Este é o defeito mais provável desta entrega, porque não dá erro nenhum.

`/resultados` é a exceção feliz: já redireciona para `ultimaRodadaConferida`
(`resultados/page.tsx:39`), então encontra a última data com dado sozinho. Não muda.

### 5.3 A demonstração e o dado real não podem dividir o banco

O seed escreve jogadores com nomes reais e ids próprios; o backfill escreve os mesmos
nomes com identidade do provedor. O resultado seria **cada jogador duas vezes** na busca
da aba de estatísticas, e a metade inventada continuaria lá depois da virada.

`demo:limpar --confirmar` apaga só o domínio — contas, sessões, assinaturas e inscrições
de push permanecem, então ninguém perde acesso. E `DEMO_AUTOSSEMEADURA` precisa ir a
`false` **antes** do backfill, senão o cron diário de demonstração ressemeia por cima.

### 5.4 A lista do CJ passa a ter contra quem reconciliar

Não é problema — é o ganho colateral maior desta spec. Hoje o import da lista casa nomes
contra jogadores da demonstração. Depois do backfill, casa contra os ~500 jogadores reais
da liga, com identidade de provedor. **Isso não pertence ao hiato** (não há apito), mas é
pré-requisito da virada, e por isso está na seção 7.

---

## 6 · Arquitetura

### 6.1 Identidade sob demanda, na fronteira (L0)

Quando o box score traz um id externo desconhecido, o adapter busca **aquele** jogador em
`/players?player_ids[]=<id>` e o cadastra, marcando `jogadores.ativo` conforme o provedor.
A coluna já existe exatamente para isto:

> `ativo` — "Falso quando o provedor indica que o jogador saiu da liga. A tela de
> mapeamento precisa MOSTRAR esse estado — Schröder foi dispensado durante a elaboração
> da lista e continua aparecendo nela." (`schema/dominio.ts:37-40`)

Cirúrgico de propósito: baixar `/players` inteiro seria paginar a história da NBA desde
1946 para resolver alguns nomes por noite. A resolução é por lote, dentro da mesma
partida, antes da checagem de `desconhecidos` — que **continua existindo** e passa a
significar o que deveria: "o provedor não sabe quem é este id".

### 6.2 Temporada exibida — função pura no domínio (L1)

`temporadaDe` responde "a que temporada esta DATA pertence" e continua certa. O que falta
é outra pergunta: **"que temporada esta TELA deve mostrar?"**. Função pura, ao lado da
outra, em `src/modules/dominio/temporada.ts`:

```ts
export function temporadaExibida(
  doCalendario: string,
  comDados: { temporada: string; jogosEncerrados: number }[],
  minimoJogos: number,
): string
```

Regra: se a temporada do calendário já tem `minimoJogos` jogos encerrados, é ela. Senão,
a temporada mais recente que tenha. Se não houver nenhuma, devolve a do calendário — tela
vazia honesta em vez de tela errada.

O piso vai para o ruleset, junto do bloco que já existe:

```yaml
temporada:
  mes_inicio: 10
  formato: dois_anos
  # Quantos jogos encerrados a temporada do calendário precisa ter para as telas
  # de CONSULTA passarem a mostrá-la. 1 = vira no primeiro jogo encerrado, que é
  # o que mantém a aba de consulta alinhada com o motor (a média sai só da
  # temporada nova — decisão do parceiro, 22/09). Subir o número adia a virada da
  # consulta sem tocar em código.
  minimo_jogos_para_exibir: 1
```

**Por que 1:** o parceiro decidiu que a média vem só da temporada nova. Se a consulta
continuasse em 2025-26 enquanto o motor já apita sobre 2026-27, a mesma tela afirmaria
duas temporadas ao mesmo tempo. Com 1, as duas viram no mesmo instante.

### 6.3 Onde o motor entra

Em lugar nenhum. É a medida do acerto desta spec: a decisão "só consulta, sem apito"
mantém a entrega inteira em L0 (ingestão) e L3 (entrega), e o backtest ganha uma
temporada real de graça.

---

## 7 · O que a virada exige — e o que ela NÃO exige

**Não exige:** deploy, edição de ruleset, migration, intervenção manual. Quando o primeiro
jogo da 2026-27 encerrar, `temporadaExibida` passa a devolver "2026-27" e as cinco telas
seguem junto. Os dados de 2025-26 continuam no banco, indexados por temporada, alcançáveis
por `/resultados` e pelo backtest.

**Exige, e precisa acontecer antes de 03/11:**

1. **Reimportar a lista de níveis do CJ** contra os jogadores reais. Sem isso `niveis`
   aponta para jogadores da demonstração e o motor não apita ninguém. É INSERT, não
   migration — mas é bloqueante, e é trabalho de curadoria humana
   (`mapa_jogadores`, confirmação no `/admin/mapeamento`).
2. **Ligar os crons sub-diários**, o que exige o **plano Pro** da Vercel. Hoje o Hobby
   permite dois crons diários (`vercel.ts:63-91`), e o Fire Live precisa de
   `ao-vivo` a cada minuto.
3. **`NBA_INGESTAO_HABILITADA=true`** e a chave do GOAT em produção — hoje não existe
   nenhuma das duas.

---

## 8 · Riscos declarados

| Risco | Mitigação |
| --- | --- |
| Backfill roda 13 min e falha no jogo 400 | checkpoint por dia já existe (`checkpoints_ingestao`) e `--resume` retoma; `--dry-run` confere antes de gravar |
| Tela vazia sem erro nenhum (5.2) | é o risco principal. Teste de leitura que monta banco com **só** 2025-26 e afirma que a tela de estatísticas em 02/10/2026 mostra dado |
| Jogador criado sob demanda com nome divergente do da lista do CJ | não afeta o hiato (sem apito); a reconciliação da seção 7.1 é humana e já tem tela |
| `demo:limpar` rodar em produção por engano | exige `--confirmar`; e o passo fica no runbook, não num script automático |
| Dado de 2025-26 usado como prova de acerto da metodologia | **fora de escopo por decisão do parceiro** — não há apito retroativo. Se alguém quiser essa prova depois, é spec nova |

---

## 9 · Fora de escopo

- Apitos retroativos, Lista Secreta histórica, Fire Live de jogo encerrado — decisão 1.
- Média puxando da temporada anterior — decisão 2.
- Seletor de temporada na UI — decisão 3 (a consulta mostra uma temporada por vez).
- Odds retroativas: `/odds` e props da BDL cobrem 2025+, mas o card não existe no hiato.
- `boxScoreDoTime` e `escalacao`: a BDL não suporta, por decisão documentada no adapter.
  A **quebra por quarto do time** não vem no backfill; quem a cobre é a API-SPORTS.

---

## 10 · Perguntas que ficam para o CJ

Nenhuma delas bloqueia esta spec. Vão junto com as dez de 21/09 — de uma vez, não uma
por vez.

1. **Piso de amostra no início da temporada.** Com a média saindo só da temporada
   corrente (P1), no primeiro dia de jogos a média de um jogador é **um jogo**, e a
   oscilação vai comparar o jogo contra ele mesmo. Existe um número mínimo de jogos
   abaixo do qual o jogador não apita? Se existir, é uma linha no ruleset.
2. **A temporada passada tem algum valor de vitrine para ele?** A decisão de hoje é
   "só consulta". Se em algum momento ele quiser mostrar o que a metodologia teria
   apitado em 2025-26 — conferido contra o box score real —, o backtest já faz isso
   (`entrega/backtest/executar.ts`) e passaria a ter dado real para rodar.
