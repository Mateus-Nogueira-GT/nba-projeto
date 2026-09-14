# Agente de suporte no app — design

**Status:** implementada em 14/09/2026.

Um assistente conversacional dentro do app, aberto por um ícone flutuante, que tira dúvida
sobre **a temporada da NBA** e sobre **o funcionamento da plataforma** — e recusa,
educadamente e sempre com a mesma frase, qualquer coisa fora desses dois assuntos.

## 1 · Ponto de partida: o que já existe

Este trabalho **não começa do zero**, e é importante que fique registrado por quê.

`src/modules/entrega/chat.ts` (341 linhas) e `src/app/api/chat/route.ts` já implementam um chat
de assinante completo: cota diária por usuário, limite por minuto, reserva transacional com
`SELECT … FOR UPDATE` contra corrida entre abas, validação da resposta, registro de tokens e
custo, e devolução de cota quando a falha é nossa. A tabela `chat_mensagens` existe e guarda a
conversa.

Duas coisas faltam: **nenhuma tela chama a rota** (o `grep` por `api/chat` em `src/app` e
`src/components` não devolve nada) e a feature está **desligada** — `CHAT_HABILITADO` não existe
no `.env.local`, e `configuracaoChat()` só liga com a string exata `'true'`.

Ou seja: o encanamento caro está pronto e apagado. Este design acende a luz, alarga o escopo do
assistente e lhe dá uma porta de entrada.

## 2 · Escopo

Entra:

- O assistente responde sobre **a temporada** (rodada de hoje, classificação, resultados) e
  sobre **a plataforma** (o que é apito, nível, Fire Live, curadoria NIP, assinatura, conta).
- **Guardrail de assunto:** qualquer outra coisa recebe uma recusa curta e fixa, que traz a
  pessoa de volta ao que o assistente faz.
- **Um assistente, duas caras:** quem tem direito ativo continua recebendo a lista do dia no
  contexto; quem não tem, não — e é convidado a assinar.
- **Qualquer usuário logado** pode abrir, assinante ou não.
- **Ícone flutuante** em todas as telas do app, abrindo um painel lateral de conversa.
- **Modelos:** o perfil `chat` passa a `deepseek/deepseek-v4-flash`, e os dois ids mortos das
  cadeias de `narrativa`, `resumo` e `chat` são substituídos por equivalentes vivos (§8).

Fica fora, por decisão de 14/09:

- **Visitante sem login.** A cota se ancora no usuário; sem conta não há em quem ancorar, e
  abrir chamada paga de LLM para a internet inteira exige freio por IP que ninguém pediu ainda.
- **Consulta ao banco por pergunta** (ferramentas / function calling). O contexto é fixo e
  montado pelo servidor. É o que mantém o agente simples e o custo previsível.
- **Histórico entre dias.** A conversa continua recortada pelo dia local, como hoje.

## 3 · Decisões

| # | Decisão | Por quê |
| --- | --- | --- |
| 1 | Um assistente só, não dois módulos | O encanamento caro (cota, reserva, validação, custo) já existe e funciona; um segundo seria um segundo lugar para errar |
| 2 | A recusa é trabalho do **prompt**, não de um classificador antes da chamada | Um classificador dobraria o custo por pergunta; um filtro de palavras barraria "como cancelo?" por engano — e errar recusando é o pior erro possível num suporte |
| 3 | A frase de recusa é **fixa e ditada no prompt** | Recusa improvisada varia de tom a cada vez; e a frase fixa não tem número nenhum, então nunca esbarra no validador |
| 4 | Quem não assina **entra**, mas sem a lista do dia no contexto | O guardrail vira uma linha (`acesso.permitido` decide se o feed entra) em vez de dois caminhos; e quem ainda não assina é justamente quem mais tem dúvida sobre a plataforma |
| 5 | O retrato da temporada usa o **time real do provedor**; a lista do dia usa a **curadoria NIP**, e o prompt diz isso | Sem o aviso, o agente afirma que o LeBron joga no Philadelphia (`CLAUDE.md`, armadilhas) |
| 6 | O botão é montado dentro da `Moldura` | 16 telas a usam e não há `layout.tsx` em `(app)`: uma mudança cobre o app inteiro |
| 7 | A eficácia do guardrail é medida por **script pago fora do CI**, não por teste de unidade | Teste com `LLMFake` prova o que é determinístico; ele não prova que o modelo recusa. Fingir que prova é pior que admitir o limite |

## 4 · Arquitetura

O `chat.ts` continua sendo o orquestrador e **encolhe**: a montagem de contexto sai dele.

```
src/modules/entrega/
  chat.ts               (modificado) orquestração: freios, reserva, chamada, validação, registro
  chat-contexto.ts      (novo)       monta o bloco de fatos E a lista de números permitidos
  chat-conhecimento.ts  (novo)       o texto de como a plataforma funciona (vizinho de metodologia.ts)
  metodologia.ts        (intocado)
src/components/chat/
  BotaoChat.tsx         (novo)       o ícone flutuante + estado de aberto/fechado
  PainelChat.tsx        (novo)       a gaveta: conversa, caixa de texto, estados de erro
  PainelChat.module.css (novo)
src/components/navegacao/
  Moldura.tsx           (modificado) monta o BotaoChat quando há barra de abas
src/app/api/chat/route.ts (modificado) deixa entrar sem direito ativo, passando a flag
src/modules/ingestao/llm/perfis.ts (modificado) modelos (§8)
scripts/chat-sondar.ts  (novo)       a sonda paga do guardrail, fora do CI
```

### 4.1 · `chat-contexto.ts`

Uma função, duas saídas que **nascem juntas de propósito** — o texto que o modelo lê e os
números que o validador vai aceitar. Separá-las seria criar duas fontes que divergem.

```ts
export type ContextoDoChat = { fatos: string; numeros: number[] }

export async function montarContexto(
  db: Db,
  opcoes: { dataReferencia: string; fuso: string; temporada: string; comDireito: boolean },
): Promise<ContextoDoChat>
```

O bloco `fatos` tem, nesta ordem: o conhecimento da plataforma (§4.2), a metodologia
(`METODOLOGIA`, já existente), o retrato da temporada e — **só se `comDireito`** — a lista do dia.

O retrato da temporada é lido pelas funções que já servem a aba de estatísticas, sem consulta
nova inventada: `telaJogosDoDia(db, dataReferencia, fuso)` para a rodada de hoje e
`telaDaClassificacao(db, temporada)` para a tabela. A classificação entra como as 30 linhas
(sigla, nome, conferência, posição, V-D, sequência) — com contexto de 1M tokens, recortar seria
economia sem efeito e responderia pior.

`numeros` reúne **todo número citado no bloco**: placares e horários da rodada, vitórias,
derrotas e posições da classificação, os números da lista do dia (via `numerosDoItem`, a mesma
função que a narrativa usa) e as constantes da plataforma que o agente tem direito de dizer —
a cota diária, o limite por minuto, o limite de caracteres da pergunta e o quarto do Fire Live.
Sem essa última parte, "você tem 20 perguntas por dia" seria recusado pelo validador como número
inventado.

### 4.2 · `chat-conhecimento.ts`

Texto em prosa, versionado no repositório, sobre **o que a plataforma é e como se usa**: as abas,
o que é um apito e seus níveis, o que é nível de jogador por atributo, que o Fire Live só existe
no 1º quarto, que o percentual é **nota de confiança e nunca probabilidade**, como funciona a
assinatura e onde se cancela, o que é a curadoria NIP e por que os elencos dela não são os times
reais.

Não é documentação nova inventada: sai do que `docs/01-arquitetura.md`, `docs/02-motor-regras.md`
e o `CLAUDE.md` já fixam. Regra 3 continua valendo — **nada que o cliente não tenha definido entra
aqui**. Onde a resposta honesta é "isso depende de uma decisão que ainda não foi tomada", o texto
manda o agente dizer que não sabe e mandar a pessoa falar com quem administra a conta dela.

**Corrigido em 14/09, durante a implementação:** a redação anterior dizia "indicar o suporte
humano". **Não existe canal de suporte no produto** — `grep` por "suporte" em `(app)/conta/` não
devolve nada. Mandar o agente apontar para um canal inexistente quebraria justamente a rede de
segurança das outras respostas. Pelo mesmo motivo o texto não afirma que as Estatísticas são
livres (há a guarda `exigirAcessoEstatisticasSeConfigurado`, ligada por env, com a decisão
comercial pendente) nem promete redefinição de senha por e-mail (não há provedor de e-mail: a
própria tela `/redefinir` manda pedir o link a quem administra a conta).

## 5 · O guardrail

Três camadas, da mais fraca para a mais forte.

**Camada 1 — o prompt.** O `SISTEMA` atual ganha o escopo e a recusa. Mantém tudo que já tem
(`regrasDoTexto`, a proibição de sugerir entrada fora da lista) e acrescenta:

- os dois assuntos permitidos, nomeados;
- a instrução de que **qualquer outro assunto** — receita, código, política, conselho médico,
  jurídico ou financeiro, tarefa genérica de escrita — recebe a recusa;
- **a frase exata da recusa**, para sair sempre igual:

  > "Só conte comigo para dúvidas sobre a temporada da NBA e sobre como a NIP funciona. Sobre
  > isso, pode perguntar à vontade."

- o aviso do vínculo de times (decisão 5);
- para quem não tem direito ativo: não falar de entradas do dia, e convidar a assinar.

**Camada 2 — o validador.** `validarTexto` já recusa qualquer número fora de `numeros` e as
palavras proibidas. Não muda uma linha: o que muda é que `numeros` passa a vir de
`montarContexto`, cobrindo tudo que o agente legitimamente pode citar. A frase de recusa não tem
número, então atravessa sempre.

**Camada 3 — a ausência.** O que não entra no contexto não pode vazar. Sem direito ativo, a lista
do dia simplesmente não está lá para ser contada.

## 6 · Escopo por direito

`route.ts` hoje devolve 403 sem direito ativo. Passa a:

```ts
const acesso = await avaliarAcesso(getDb(), sessao.usuarioId)
// Sem direito NÃO é barreira: o suporte sobre a plataforma serve principalmente a quem
// ainda está decidindo assinar. O direito decide o CONTEÚDO, não a porta.
const r = await responder(getDb(), portaLLMDoAmbiente(), {
  usuarioId: sessao.usuarioId,
  texto,
  dataReferencia: dataDeReferencia(agora, ruleset.rodada.fuso),
  fuso: ruleset.rodada.fuso,
  // A temporada é calculada AQUI porque é aqui que o ruleset existe: `responder` não o
  // recebe, e dar o ruleset a ele só para isto arrastaria o motor para dentro do chat.
  temporada: temporadaDe(
    intervaloDoDia(dataDeReferencia(agora, ruleset.rodada.fuso), ruleset.rodada.fuso).inicio,
    calendarioDoRuleset(ruleset),
  ),
  agora,
  comDireito: acesso.permitido,
})
```

A entrada de `responder` passa a ser
`{ usuarioId, texto, dataReferencia, fuso, temporada, agora, comDireito }` — os dois campos novos
seguem direto para `montarContexto`. A cota, o limite por minuto e a reserva não mudam: valem
igual para quem assina e para quem não assina.

## 7 · A UI

**O botão.** Fixo no canto inferior direito, montado pela `Moldura` quando `aba !== null` **e a
flag `CHAT_HABILITADO` está ligada** — com a flag desligada o botão não existe na tela, senão a
entrega poria em produção um botão que só sabe dizer "fora do ar". Nem toda tela de aba exige
sessão (STATS abre sem login enquanto `ESTATISTICAS_EXIGEM_DIREITO` estiver desligada): o
visitante anônimo que clicar ali recebe "Entre na sua conta para conversar comigo", sem custo e
sem vazamento, porque a rota devolve 401 antes de qualquer chamada paga. Sobe **acima** da barra: a `Moldura` já reserva
96px de `paddingBottom` para ela, e o botão fica acima disso mais a área segura do aparelho
(`env(safe-area-inset-bottom)`), senão tapa o polegar em cima das abas. Ícone geométrico em SVG,
como o resto da navegação (identidade 02: **sem emoji**), com `aria-label` e foco visível.

**O painel.** Gaveta à direita no desktop (largura fixa, o app continua atrás), folha de altura
inteira no celular. Dentro: a conversa do dia — carregada ao abrir por `GET /api/chat`, que
devolve as mensagens de hoje do usuário (`conversaDoDia`, teto de duas vezes a cota), porque uma
gaveta que abrisse vazia faria o assistente "lembrar" de perguntas que a tela não mostra —, a
caixa de texto com o contador de caracteres contra `LIMITE_PERGUNTA` (500), e o estado de envio.
O foco já chega na caixa. Fecha por botão, `Esc` e clique fora.

**Os erros falam a língua do usuário.** A rota já distingue os motivos; o painel os traduz:
`cota-esgotada` → "Você já fez as suas perguntas de hoje. Amanhã recomeça."; `limite-por-minuto`
→ "Calma, uma de cada vez — tente em alguns segundos."; `muito-longa` → o contador já avisa antes;
`desabilitado` e `indisponivel` → "O assistente está fora do ar agora." Nenhum deles é um erro
técnico na cara de quem perguntou.

**Só o painel carrega JavaScript.** `BotaoChat` e `PainelChat` são componentes de cliente; a
`Moldura` continua sendo de servidor, e as 16 telas não passam a embarcar o app inteiro por causa
do chat.

## 8 · Modelos

O perfil `chat` passa a ter o DeepSeek V4 Flash na frente:

```ts
chat: {
  modelos: ['deepseek/deepseek-v4-flash', 'openai/gpt-4o-mini', 'anthropic/claude-haiku-4.5'],
  maxTokens: 700,
  temperatura: 0.4,
},
```

**E a cadeia morta é consertada junto.** Medido em 14/09 contra o catálogo da OpenRouter:
`google/gemini-2.0-flash-001` e `anthropic/claude-3-5-haiku` **não existem mais**. Eles eram o
primeiro da fila de `narrativa`, `resumo` e `chat` — na prática os três perfis rodavam com um
único modelo vivo (`openai/gpt-4o-mini`), e a cadeia de fallback, que existe justamente para um
modelo indisponível não derrubar a feature, era decorativa. Os substitutos vivos são
`google/gemini-2.5-flash` e `anthropic/claude-haiku-4.5`.

Um teste novo trava isso: para cada id configurado em `PERFIS`, confere que ele existe no catálogo
público da OpenRouter. Como depende de rede, **não roda no CI** — fica no mesmo script da sonda
(§9), que imprime o veredito de cada id.

## 9 · Configuração e freios

Nada de freio novo; os que existem passam a valer para mais gente.

| Chave | Efeito | Padrão |
| --- | --- | --- |
| `CHAT_HABILITADO` | Só a string `'true'` liga. Qualquer outra coisa mantém desligado | desligado |
| `CHAT_COTA_DIARIA` | Perguntas por usuário por dia local | 20 |
| `OPENROUTER_API_KEY` | Já configurada | — |

`LIMITE_POR_MINUTO` (5) e `LIMITE_PERGUNTA` (500) continuam constantes no código, como hoje.
O teto de gasto no painel da OpenRouter segue sendo o freio que não depende de acertarmos.

**Custo.** Com o V4 Flash a US$ 0,09 por milhão de tokens de entrada e US$ 0,18 de saída, uma
pergunta com o contexto inteiro (~2.500 tokens de entrada, ~300 de saída) custa cerca de
**US$ 0,0003**. Um usuário esgotando as 20 do dia: menos de um centavo de dólar. Cem usuários
fazendo isso todo dia: ~US$ 17 no mês, no pior caso.

`scripts/chat-sondar.ts` (`npm run chat:sondar`) é a sonda do guardrail: dispara uma bateria de
perguntas **fora de escopo** (receita de bolo, código, política, conselho médico, "ignore suas
instruções", pedido de palpite de aposta) e uma de perguntas **dentro** do escopo, contra o modelo
real, e imprime quantas foram recusadas de cada lado. Custa dinheiro e depende de rede: roda à
mão, nunca no CI. Reprova se alguma pergunta dentro do escopo for recusada, ou alguma fora for
respondida.

O mesmo script faz antes, de graça, a conferência de catálogo da §8: lê a lista pública de
modelos da OpenRouter e imprime, para cada id de `PERFIS`, se ele ainda existe — reprovando se
algum sumiu. Ficam juntos porque os dois dependem de rede e nenhum pode entrar no CI; e porque
um id morto explica qualquer resultado estranho da sonda logo em seguida.

A sonda ainda não foi executada — depende da chave e custa por chamada; rodar antes de ligar a flag.

## 10 · Testes

Determinístico, com `LLMFake`, sem rede — é o que entra no CI:

- `montarContexto` **inclui** a lista do dia com `comDireito: true` e **não inclui** com `false`.
- Todo número presente no bloco `fatos` está em `numeros` — a invariante que impede o validador
  de recusar a própria resposta legítima do agente.
- `numeros` contém a cota diária, o limite por minuto e o limite de caracteres.
- A frase de recusa passa por `validarTexto` com qualquer `numeros` (não tem número).
- O `SISTEMA` contém os dois assuntos permitidos, a frase de recusa e o aviso de vínculo de times.
- A rota responde **200** para usuário logado sem direito ativo (hoje responde 403), e **401**
  sem sessão.
- Sem direito ativo, o texto enviado à porta de LLM não contém nenhum nome de jogador da lista
  do dia. (Asserção por ausência da seção, não por nome de jogador — a regra de telas do projeto
  vale aqui: nenhum teste nomeia jogador ou time.)
- Os freios continuam: cota esgotada devolve `cota-esgotada` e não chama a LLM; a sexta pergunta
  no mesmo minuto devolve `limite-por-minuto`.

Na tela, no molde dos testes de `telas-*`: a `Moldura` com aba renderiza o botão e sem aba não
renderiza; o painel fechado não está no documento; o `aria-label` do botão existe.

Fora do CI: `npm run chat:sondar` (§9).

## 11 · Pronto quando

- Com `CHAT_HABILITADO=true`, um usuário logado **sem assinatura** abre o painel, pergunta "como
  funciona o Fire Live?" e recebe resposta; pergunta "quais as entradas de hoje?" e é convidado a
  assinar, sem nenhum nome de jogador na resposta.
- Um usuário **com** direito ativo pergunta sobre a lista do dia e recebe resposta sobre ela.
- Perguntas fora de escopo recebem a frase de recusa, igual todas as vezes.
- A sonda (`npm run chat:sondar`) recusa 100% do lote fora de escopo e responde 100% do lote
  dentro dele.
- Nenhum id de modelo configurado está fora do catálogo da OpenRouter.
- O botão não cobre a barra de abas em tela de celular, e o painel abre e fecha por botão, `Esc`
  e clique fora.
- A bateria de sempre verde: `typecheck`, `lint`, `boundaries`, `test`, `build`.

## 12 · Riscos

- **O modelo escorregar e responder fora do escopo.** É o risco central de um guardrail por
  prompt, e é por isso que existe a sonda: ela mede em vez de supor. Se o V4 Flash escorregar, a
  troca para `deepseek-v4-pro` é uma linha em `perfis.ts` — a cadeia de fallback existe para isso.
- **O validador recusar resposta legítima.** Um número correto que ficou de fora de `numeros` vira
  "indisponível" para o usuário e uma chamada paga perdida. A invariante testada em §10 (todo
  número dos fatos está em `numeros`) é a defesa; ela cobre o bloco montado, não o que o modelo
  possa derivar por conta (somar duas vitórias, por exemplo), e esse resíduo é aceito.
- **Ligar a flag expõe custo real.** `CHAT_HABILITADO` fica **desligado** ao fim deste trabalho;
  ligar em produção é decisão à parte, depois de rodar a sonda e conferir o teto de gasto.
- **O painel é a primeira superfície de cliente pesada do app.** Se pesar, pesa em 16 telas.
  Mitigação: o código do painel só é carregado quando o botão é clicado (`next/dynamic`), não no
  primeiro render.
- **O histórico é, hoje, a única brecha aberta no paywall.** `ultimasMensagens` (`chat.ts`) não
  recebe `comDireito` e é concatenada ao prompt sem filtro nenhum. Nome de jogador não é número,
  então o validador (camada 2) não enxerga o que passa por ali. A brecha se abre quando o direito
  é revogado NO MEIO DO DIA: a pessoa pergunta a lista de manhã com assinatura ativa, perde o
  direito à tarde, e a MESMA resposta de manhã reaparece dentro do histórico da conversa — o
  modelo a devolve de novo, sem que a pergunta tenha sido refeita. Não atinge quem nunca assinou
  (não há resposta antiga para reaparecer) e a janela fecha sozinha na virada do dia local, quando
  `intervaloDoDia` deixa a conversa de ontem fora do recorte.
- **Resposta reprovada pelo validador devolve a cota E zera o limite por minuto, no mesmo golpe.**
  `mensagensUsadasHoje` e `mensagensNoUltimoMinuto` contam a MESMA linha que `apagarReserva` apaga
  quando o validador reprova o texto (`chat.ts`) — e a chamada à LLM já foi paga antes da
  reprovação acontecer. Quem topar, por acaso ou de propósito, com perguntas que derrubam o
  validador com regularidade roda sem teto diário nem de ritmo; o freio que sobra é o teto de
  gasto no painel do provedor, fora do código.
- **A camada 2 do guardrail ficou mais fraca do que a descrição da §5 sugere.** Em
  `chat-contexto.ts`, `numeros` é derivado do bloco INTEIRO de fatos (§4.1), e esse bloco carrega a
  classificação completa — posição, vitórias e derrotas dos 30 times — mais os placares e horários
  da rodada. Quase qualquer inteiro pequeno passa a ser um número "conhecido", o que estreita
  bastante o que a camada 2 de fato barra. Na demo (oito times) isso não aparece; em produção, com
  a liga inteira na classificação, aparece. É consequência aceita da decisão §4.1 — recortar a
  classificação seria economia sem efeito e responderia pior — registrada aqui para que a
  descrição de três camadas da §5 não seja lida como se a força de cada uma estivesse inalterada.
