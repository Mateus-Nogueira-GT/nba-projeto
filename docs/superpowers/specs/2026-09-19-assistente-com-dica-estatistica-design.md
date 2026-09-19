# O assistente passa a dar dica estatística

**Data:** 19/09/2026 · **Status:** desenho aprovado pelo parceiro em conversa (três seções,
aprovadas uma a uma) e **IMPLEMENTADO** em 19/09. As divergências que a execução revelou
estão em §14, corrigidas aqui.
**Decisão de produto:** do dono da plataforma. Contradiz em parte a
[ADR-0009](../../adr/0009-llm-narra-nunca-decide.md) e exige ADR nova (§9).
**Irmã:** nenhuma. Esta passada é independente das correções de 19/09.

---

## 1 · Objetivo em uma frase

O assistente passa a responder "em quem eu aposto hoje?" com um ranking **calculado em
código, não pelo modelo** — quantas vezes cada jogador bateu a linha nos últimos 10 jogos
— apresentado ao lado da metodologia NIP e nunca confundido com ela.

## 2 · Problema

Hoje o assistente tem uma proibição literal no prompt:

> NÃO SUGIRA APOSTA: nada de palpite, de valor a apostar, de promessa de resultado ou de
> dizer se uma entrada vai bater.

E a ADR-0009 fechou a porta de propósito: *"A tentação óbvia — e o erro que este ADR fecha
— seria deixar a LLM opinar sobre QUEM apita."*

O parceiro quer a capacidade. O risco que a ADR-0009 protege continua real: um modelo a
quem se pede "avalie os melhores jogadores" **calcula**, e calcular é exatamente onde ele
inventa número. A carga de 07/09 mediu isso: das 276 chamadas, a última reprovação que
sobrou depois de todas as correções foi o modelo derivando uma média a partir dos fatos.

**"100% estatística" por prompt não é guardrail, é torcida.** Este desenho troca a
instrução por arquitetura.

## 3 · Princípios

1. **Quem ranqueia é o motor, não a IA.** Uma função pura, sobre parâmetros do ruleset,
   devolve a lista **já ordenada**. A IA recebe a ordem pronta e narra. A ADR-0009
   continua valendo na sua afirmação central — o que mudou é o produto passar a exibir uma
   segunda leitura, não a IA passar a decidir.
2. **Regra de estratégia mora no YAML** (regra 1 do projeto). Janela, critério, mínimo de
   jogos e tamanho do recorte são valores do ruleset, não literais no código.
3. **As duas vozes se separam no texto que o código monta**, não numa frase que o modelo
   precisa lembrar.
4. **Taxa de acerto não é previsão.** Vai como "8 de 10 jogos", jamais como "80%".
5. **Menos número permitido, validador mais fino.** Cada número injetado alarga a malha
   que impede estatística inventada; o recorte existe para isso.

## 4 · As decisões do parceiro

| # | Pergunta | Decisão |
| --- | --- | --- |
| 4.1 | De onde sai a dica? | **Da metodologia E da estatística pura**, as duas como base |
| 4.2 | E quando o motor não apitou ninguém do time? | **Ranqueia mesmo assim**, marcado como fora da lista |
| 4.3 | O que faz um jogador ser "melhor"? | **Quantas vezes bateu a linha** |
| 4.4 | Qual linha, para quem não foi apitado? | **A tabela estática do ruleset**, por nível |
| 4.5 | Um assistente novo ou o mesmo? | **O mesmo, com poderes novos** — vale em todas as telas |
| 4.6 | Sobre quantos jogos? | **Últimos 10** |
| 4.7 | Como o ranking chega ao modelo? | **Calculado sob demanda e cacheado** (opção A) |

**Consequência aceita de 4.5:** a capacidade existe também no Fire Live, durante o primeiro
quarto. É escolha do parceiro, registrada aqui para não parecer descuido.

**Consequência aceita de 4.2:** em algumas noites o produto vai sugerir alguém que o CJ não
sinalizou. Daí a separação estrutural da §7 ser o guardrail mais importante desta spec.

## 5 · O cálculo

### 5.1 · O bloco novo do ruleset

```yaml
sugestao_estatistica:
  criterio: taxa_na_linha   # o que "melhor" significa
  janela_jogos: 10          # sobre quantos jogos ENCERRADOS se conta
  minimo_jogos: 10          # abaixo disso o jogador não entra no ranking
  maximo_por_time: 8        # quantos jogadores por time vão para os fatos
  contexto:
    incluir_adversario: true # o jogo inteiro, não só o time perguntado
    todos_os_atributos: true # pontos, rebotes e assistências
    jogos_lembrados: 2       # partidas citadas antes continuam nos fatos
    topo_do_dia: 15          # POR ATRIBUTO, quando a pergunta não nomeia ninguém
```

`topo_do_dia` é **por atributo**: "em quem aposto hoje?" sem dizer em quê devolve três
listas curtas — pontos, rebotes e assistências —, não uma lista só dominada por pontos,
onde o atributo com os maiores números afogaria os outros dois.

`minimo_jogos` **é guardrail, não detalhe**: sem ele um jogador com duas partidas apareceria
com "bateu em 2 de 2" e lideraria o ranking.

`janela_jogos` conta partidas **encerradas**. O jogo em andamento tem box score parcial, e
incluí-lo faria o ranking dizer que o jogador está fraco porque ainda está no 1º quarto.
Isso é correção de dado, não de estilo.

### 5.2 · A função pura

`src/modules/motor/sugestao/taxa-na-linha.ts`. Recebe as linhas de box score já lidas, o
nível do jogador e o ruleset; devolve a lista **ordenada**. Sem I/O, sem LLM, sem banco —
testável sem mock, como o resto do motor.

As linhas contra as quais se conta saem de `linhasDoNivel`, que o motor já tinha (ver
§14.1 — o desenho dizia `odds.tabela_estatica`, e a função existente lê `confianca.base`,
com as mesmas chaves). Um ALL_STAR é medido em 15, 20 e 25; um RANDOLA em 5 e 10. Nenhuma
linha é inventada.

O ranking é **por atributo**: "melhor jogador" sem dizer em quê não significa nada.

Cada item carrega: nome, time, nível, e por linha do nível quantas vezes bateu em N jogos.
Mais um marcador **apitadoHoje**, que a §7 usa para separar as vozes.

`apitadoHoje` é por **(jogador, atributo)**, nunca por jogador. O ranking é por atributo e
um jogador pode estar apitado em pontos e não em rebotes; marcá-lo como apitado na lista
de rebotes seria exatamente a confusão entre as duas vozes que a §7 existe para impedir.

### 5.3 · A leitura e o cache

`src/modules/entrega/sugestao/leitura.ts` busca os box scores dos times que jogam hoje e
chama a função do motor. Ela **não** conhece `next/cache`: nenhum módulo do projeto importa
Next, e o `dependency-cruiser` cobra isso.

O cache mora na rota, como o da lateral: `src/app/api/chat/ranking.ts` embrulha a leitura em
`unstable_cache` com tag própria, invalidada pelo mesmo cron que fecha a rodada. A rota
passa o ranking pronto para `responder`, que continua livre de Next.

> Nota medida em 19/09: `revalidateTag(tag, 'max')` é *stale-while-revalidate* — a primeira
> leitura após invalidar serve o valor anterior. Para um ranking isso é aceitável.

## 6 · Como o ranking chega ao chat

### 6.1 · O recorte é determinístico, sem LLM

Numa noite cheia são até 13 jogos e 26 times; o ranking inteiro passa de mil números.
Injetar tudo em toda mensagem é caro e devolve o validador à malha larga.

**Os times são um conjunto fechado de 30.** Um matcher em código lê a pergunta e procura
sigla, nome e cidade (`LAL`, `Lakers`, `Los Angeles`); o mesmo para o atributo (`pontos`,
`rebotes`, `assistências`, `cestas`). É busca em lista conhecida — não é modelo, não erra
por criatividade e não custa chamada. Vive em
`src/modules/entrega/sugestao/recorte.ts`.

Com o time identificado, entram **os dois times da partida**, **os três atributos** e até
`maximo_por_time` jogadores de cada. Os jogos citados nas últimas mensagens continuam nos
fatos (`jogos_lembrados`) — é isso que faz "e o Davis?" funcionar depois de "e no Lakers?".

Sem time identificado, entra o `topo_do_dia`: os N melhores da rodada por taxa.

**Tamanho:** ~150 números no caso comum, até ~300 com dois jogos lembrados. Contra mais de
mil do dia inteiro.

### 6.2 · O bloco datado e ordenado

```
RANKING DA RODADA DE 19/09 — últimos 10 jogos ENCERRADOS de cada jogador.

APITADOS HOJE PELA METODOLOGIA NIP
  1. LeBron James · pontos 25+ · confiança 90

NÃO APITADOS — ranking só estatístico, a metodologia não sinalizou
  1. Anthony Davis (ALL STAR) · 20+ em 6 de 10 · 15+ em 9 de 10

Números citados em mensagens ANTERIORES desta conversa podem estar
desatualizados. Use somente os desta lista.
```

A ordem chega pronta do motor: o modelo não tem o que calcular.

O aviso final ataca um risco real que o desenho não elimina. O prompt carrega as 10 últimas
mensagens (`HISTORICO_MAXIMO`), e as respostas antigas do próprio assistente trazem números
que eram verdade naquela noite. O ranking se move a cada rodada.

### 6.3 · O validador continua funcionando sem alteração

`montarContexto` já deriva `numeros` **do próprio texto montado**, nunca de lista escrita à
mão. Acrescentar uma seção aos fatos acrescenta os números dela por construção.

Quando o modelo cita um número velho vindo do histórico, `validarTexto` o reprova como
`numero-inventado`: a cota volta ao assinante e o texto não chega à tela. **Falha seguro,
mas falha caro** — a chamada foi paga. É o custo conhecido da opção A, e o recorte da §6.1
existe para torná-lo raro.

## 7 · Os guardrails

**7.1 · A separação das vozes é estrutural.** Quem monta os fatos é o código, então é o
código que escreve os dois cabeçalhos da §6.2. O prompt dita uma marca fixa — ao citar
alguém do segundo grupo, a resposta precisa conter **"fora da lista de hoje"** — no mesmo
padrão da `RECUSA_FORA_DE_ESCOPO`, que já é frase ditada.

**7.2 · A marca é verificada em código, depois da resposta.** Se o texto nomeia um jogador
não-apitado e não traz a marca, é reprovado pelo mesmo caminho do `numero-inventado`: cota
devolvida, texto não exibido. Os nomes dos dois grupos estão nos fatos, então a checagem é
determinística. É o único jeito de a marcação não depender da memória do modelo.

**7.3 · Taxa vai como "8 de 10", nunca como "80%".** O produto tem regra dura — o % não é
probabilidade — e taxa de acerto é justamente o número que *parece* previsão. "8 de 10
jogos" afirma sobre o passado; "80%" convida a ler como chance de hoje. Acrescento
**"chance"** e **"vai bater"** às palavras proibidas, nos dois lados (prompt e validador
juntos, como `regras-do-texto.ts` exige — divergência entre eles já custou dinheiro).

**7.4 · Valor de aposta continua proibido.** A Gestão é a tela da banca, e a tentação de
"aposte 3% aqui" é máxima. A unidade de banca é do ruleset e do CJ.

**7.5 · O que sai do prompt.** A frase `NÃO SUGIRA APOSTA` é substituída por regras mais
finas: não sugerir **valor**, não prometer **resultado**, marcar o que está **fora da
lista**. O escopo de assunto (`RECUSA_FORA_DE_ESCOPO`) não muda.

## 8 · Arquitetura

```
config/ruleset.v1.yaml                        + bloco sugestao_estatistica
src/modules/motor/ruleset/schema.ts           + schema do bloco
src/modules/motor/sugestao/taxa-na-linha.ts   função PURA, ordena o ranking
src/modules/entrega/sugestao/leitura.ts       box scores → motor (sem Next)
src/modules/entrega/sugestao/recorte.ts       matcher determinístico time/atributo
src/modules/entrega/chat-contexto.ts          + seção de ranking nos fatos
src/modules/entrega/chat-prompt.ts            regras novas + marca ditada
src/modules/entrega/chat.ts                   + verificação da marca (7.2)
src/modules/ingestao/llm/regras-do-texto.ts   + "chance", "vai bater"
src/modules/ingestao/llm/validador.ts         idem, do lado que reprova
src/app/api/chat/ranking.ts                   unstable_cache + tag (só aqui mora Next)
src/app/api/chat/route.ts                     lê o ranking cacheado e passa a responder
docs/adr/0012-a-ia-sugere-o-que-o-motor-ranqueia.md   ADR nova (§9)
```

O motor não ganha I/O. Nenhuma tabela nova, nenhuma migração.

## 9 · A ADR nova

A ADR-0009 se chama *"A LLM narra; ela nunca decide"* e seu contexto diz que a tentação a
fechar era "deixar a LLM opinar sobre QUEM apita". Esta passada exibe uma sugestão de
jogador, então precisa de registro próprio.

O que a ADR-0012 vai afirmar: **a LLM continua não decidindo.** Quem ranqueia é função pura
do motor sobre parâmetros do ruleset; a IA recebe a ordem pronta e narra. O que mudou é o
produto passar a mostrar uma segunda leitura, estatística, ao lado da metodologia — e a
separação entre as duas ser obrigação verificada em código, não promessa de prompt.

Ela registra também as duas consequências aceitas da §4.

## 10 · Verificação

- Motor: testes sem mock para `taxa-na-linha` — ordenação, `minimo_jogos` barrando amostra
  curta, jogo em andamento fora da janela, linhas vindas do nível.
- Recorte: o matcher acha sigla, nome e cidade; não acha o que não existe; lembra os jogos
  das mensagens anteriores.
- Contexto: os dois cabeçalhos saem; os números permitidos crescem junto com o texto.
- Guardrail 7.2: resposta citando não-apitado sem a marca é reprovada; com a marca, passa.
- Guardrail 7.3: "80%" e "chance" reprovados; "8 de 10" passa. Teste de deriva conferindo
  que toda palavra nova do prompt é de fato reprovada pelo validador.
- Bateria: `npm run typecheck && npm run lint && npm run boundaries && npm test`.

## 11 · Fora de escopo

- Tabela materializada de ranking (opção C) — cabe depois, embrulhando a mesma função pura.
- Duas passadas de LLM (opção B).
- Qualquer envio de aposta, credencial de casa ou conta vinculada — ADR-0004 fica.
- Conselho de valor a apostar.
- Mudar o escopo de assunto do assistente.

## 12 · Ordem

1. Ruleset + schema + função pura do motor (testes primeiro).
2. Leitura e recorte determinístico.
3. Palavras novas no par prompt/validador.
4. Contexto do chat com o bloco datado e os dois cabeçalhos.
5. Verificação da marca em `chat.ts`.
6. Cache na rota.
7. ADR-0012, bateria, commit único.

## 13 · Riscos

- **A malha do validador afrouxa.** É consequência direta de injetar mais números, e o
  parceiro escolheu contexto rico para sustentar conversa longa (§6.1). Mitigado pelo
  recorte e pelo aviso de data; reversível pelo YAML — `jogos_lembrados: 0` e
  `maximo_por_time: 5` devolvem a malha fina sem tocar código.
- **Número velho do histórico.** Descrito em §6.2; falha seguro e caro.
- **Duas vozes no mesmo produto.** Em noites sem apito do time perguntado, a sugestão é só
  estatística. O guardrail 7.2 é o que impede isso de ser lido como metodologia.
- **O matcher pode não achar o time** (apelido, erro de digitação). Degrada para o
  `topo_do_dia`, nunca para resposta vazia.
- **Fire Live.** A capacidade existe durante o jogo; a janela exclui a partida em
  andamento, mas a sugestão em si é possível ali. Decisão registrada em §4.5.

## 14 · O que a execução revelou (19/09)

Três coisas divergiram do desenho. Nenhuma muda a decisão do parceiro; todas mudam o
código que a implementa.

### 14.1 · `linhasDoNivel` já existia, e lê outra tabela

A §5.2 dizia que as linhas viriam de `odds.tabela_estatica[nível]`. O motor **já tinha**
`linhasDoNivel`, lendo `confianca.base[nível]` — e as chaves são as mesmas para pontos
(MVP 20/25/30/35, RANDOLA 5/10), com as próprias para os outros atributos.

Reaproveitar a função existente em vez de abrir uma segunda fonte de linhas: duas fontes
divergem na primeira vez que alguém mexer numa delas.

### 14.2 · O ranking precisava de um critério de ORDEM que a spec não fixou

Cada nível tem linhas próprias. Comparar a taxa de um MVP em 20 com a de um RANDOLA em 5
é comparar coisas diferentes, e a §5.2 só dizia "devolve a lista ordenada".

Entrou `sugestao_estatistica.ordenacao: menor_linha` — ordena pela taxa da linha mais
baixa do nível, a aposta mais conservadora de cada jogador. **É definição de metodologia e
precisa do aval do CJ** (registrado também no fim da ADR-0012); trocar o valor no YAML
muda o ranking sem tocar código.

### 14.3 · "chance" e "vai bater" colidiram com o texto que já existia

A §7.3 mandou proibir as duas palavras. Ao fazê-lo, a invariante "os próprios fatos passam
pelo validador" quebrou: `chat-conhecimento.ts` e `metodologia.ts` usavam **"chance"
justamente porque "probabilidade" já era proibida** ("Não é chance de acerto"), e "vai
bater" aparecia na frase que proíbe prometer resultado.

As três frases foram reescritas preservando o sentido — "Não mede o que vai acontecer no
jogo", "não diga se uma entrada será verde". A lição vale além desta passada: **palavra
nova na lista de proibidas exige varrer a cópia do produto antes**, senão o validador
reprova os próprios fatos que o produto manda.

### 14.4 · Detalhes de correção que o desenho não previa

- **DNP não conta como jogo.** O ranking só considera partidas em que o jogador entrou em
  quadra (`entrouEmQuadra`): contar uma ausência como "não bateu a linha" diria que ele
  falhou numa noite em que nem jogou.
- **O par ruleset+ranking é atômico** (`sugestao?: { ruleset, ranking }`): ranking sem
  ruleset não sabe recortar, e ruleset sem ranking não tem o que dizer. Passá-los soltos
  quebraria todos os chamadores antigos sem ganho.
- **O matcher precisa de TODAS as palavras longas do nome**, não só a última: quem escreve
  "e no Miami?" usa a cidade e quem escreve "e no Heat?" usa o apelido. A primeira versão
  guardava só a última palavra e perdia metade das perguntas.
- **O teto de `jogos_lembrados` conta só os LEMBRADOS.** Misturá-lo com os jogos da
  pergunta fazia `jogos_lembrados: 0` ainda trazer um do histórico — o oposto de desligar
  a memória.
- **A reprovação da marca ganhou motivo próprio** (`sem-marca-fora-da-lista`). Reusar
  `numero-inventado` mentiria em `llm_chamadas`: "o ranking passou por apito" e "o modelo
  inventou um número" são investigações diferentes.
