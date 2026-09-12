# NIP · o que falta depois da call de 08/09 — UX e pendências nossas

**Data:** 12/09/2026 · **Status:** rascunho para decisão do parceiro
**Origem:** a call de 08/09/2026 às 11h (anotações do Gemini) e três capturas do app em
produção enviadas em 12/09 (Estatísticas, Perfil, Gestão de banca)
**Prazo citado na call:** a versão final é para **o dia 13** — amanhã.

---

## 1 · Como ler esta spec

A call decidiu seis coisas e distribuiu onze tarefas. Parte já está no ar; parte não existe;
e há **um ponto que contradiz uma regra documentada do projeto** e não pode ser implementado
sem você decidir. Esta spec separa exatamente isso:

- **§3** o que a call pediu e **já está pronto** — para ninguém trabalhar duas vezes;
- **§4** os **ajustes de UX** dos três prints, que é o que você pediu agora;
- **§5** o que **falta e depende de nós**;
- **§6** o que **depende de terceiros** e nos bloqueia;
- **§7** a **contradição** que precisa da sua palavra.

O que **não** entra: nada de regra de estratégia, nada no motor, nada no ruleset. As regras
invioláveis do `CLAUDE.md` continuam valendo integralmente.

## 2 · O estado hoje

Produção está no ar como **NIP**, com a Identidade 04 publicada e a operação de afiliados
funcionando. A base é boa; o que falta é acabamento de experiência e as funcionalidades
comerciais que a call desenhou.

## 3 · Já está pronto — não virar tarefa

| Item da call | Situação |
| --- | --- |
| Nome **NIP** | aplicado, inclusive no título das telas |
| **Rastreamento de afiliados por UTM** (sua tarefa) | pronto: rotas de redirecionamento, painel, parâmetros por link e vínculo do cadastro à origem |
| Remover a imagem de Carlos dos métodos | o texto já fala em "metodologia NIP"; falta só uma varredura de sobras |
| Classificação dividida por conferência | **o código já agrupa** — falta o dado (ver §5.2) |
| Componente de logo de time | **existe** (`LogoTime`) — nunca é renderizado e não há dado (ver §4.2) |
| Quadra ao vivo no fundo | componente `QuadraAoVivo` existe |

## 4 · Ajustes de UX — o que você pediu nos prints

### 4.1 · As faixas vazias nas laterais

**O que acontece.** Toda tela do app passa por uma moldura com `maxWidth: 640`, centrada.
Foi a escolha certa para um PWA de celular. Num monitor de 1280 px isso deixa mais de 300 px
vazios de cada lado — e a conta piora quanto maior a tela.

**O erro não é a largura, é ela ser única.** Uma lista de cards a 640 px se lê bem: linha
curta é o que permite varrer. Uma tabela de classificação com 15 times, ou um box score, a
640 px fica espremida **enquanto a página está vazia em volta**. As duas coisas coexistem
hoje com a mesma régua.

**Proposta.** A moldura passa a ter duas larguras, escolhidas por tela:

- **leitura (640 px)** — Lista Secreta, Fire Live, detalhe do apito. São superfícies de
  varredura: a linha curta é uma decisão de legibilidade, não uma limitação.
- **dados (até 1120 px)** — Estatísticas (índice, time, jogador, partida), Resultados,
  Gestão de banca, Perfil. Aqui a largura vira informação: mais colunas visíveis, tabela
  respirando, e em telas grandes duas colunas lado a lado em vez de uma pilha.

No celular nada muda — as duas caem para a largura da tela com o mesmo respiro lateral de
hoje. É só o desktop que deixa de desperdiçar espaço.

### 4.2 · A tabela de classificação

**Três problemas no print, e o terceiro é um erro factual.**

1. Sai como tabela única, misturando as duas conferências.
2. Não tem logo.
3. **O trilho está errado.** A coluna "TRILHO" marca playoff nas seis primeiras posições e
   play-in da sétima à décima — mas faz isso sobre a **liga inteira**. Na NBA o corte é
   **por conferência**: seis vagas diretas e quatro de play-in **em cada lado**. Do jeito
   que está, a tabela afirma uma classificação que não existe.

**Proposta.**

- **Dividir por conferência**, Leste e Oeste, como na NBA. O código já faz isso; falta o
  dado (§5.2). Com a divisão, o trilho passa a estar correto sem nenhuma outra mudança.
- **Logo de todas as franquias** na coluna do time, ao lado da sigla em Anton. A fonte
  natural é o CDN da NBA, o mesmo de onde já vêm os rostos dos jogadores. O componente já
  existe; falta popular `times.logo_url` e ligá-lo (§5.2).
- **A tabela ganha o que a largura nova permite:** nome do time por extenso ao lado da
  sigla, jogos atrás do líder, e aproveitamento em casa e fora. Em celular essas colunas
  saem e fica o que já está no print.
- **Leitura por varredura:** as duas conferências lado a lado no desktop, empilhadas no
  celular, com a linha de corte do play-in desenhada entre a 10ª e a 11ª posição.

### 4.3 · A aba de acesso do usuário (Perfil)

**O que o print mostra.** Uma pilha de rótulos e valores: o e-mail solto embaixo do título,
"Explorar" com dois links, "Assinatura e acesso" com cinco linhas quase todas vazias
("Sem plano", "—", "—"), cinco dispositivos em texto corrido e um bloco de alertas. Não há
nome, não há foto, e **não há nada que o usuário possa fazer** além de ativar alertas.

**Proposta — a tela vira a conta da pessoa, não um relatório sobre ela.**

**Identidade, no topo.** Foto de perfil (ou as iniciais, como já fazemos nos jogadores sem
foto), nome, e-mail, e a etiqueta do plano ao lado do nome. É o que dá cara de produto à
aba e o que a call pediu.

**O que o usuário passa a poder fazer** — hoje, nada disso existe:

- **trocar a foto de perfil** (enviar imagem, recortar em quadrado, remover);
- **trocar o nome** (a coluna `nome` já existe na tabela e nunca foi usada);
- **trocar o e-mail**, com confirmação no endereço novo antes de valer;
- **trocar a senha**, informando a atual;
- **recuperar a senha esquecida** — ver §5.3, porque isso tem uma dependência de verdade.

**Organização.** Quatro blocos com peso visual diferente, em vez de cinco listas iguais:
**Conta** (identidade e as ações acima), **Assinatura** (plano, validade, contagem
regressiva para a próxima cobrança, botão de assinar quando não há plano), **Alertas**
(push e, quando existir, Telegram), **Dispositivos** (com "encerrar sessão" por
dispositivo, que hoje só é possível pelo admin). No desktop, dois blocos por linha.

**Assinatura sem plano não pode parecer erro.** Hoje escreve "Sem plano · Não contratado ·
— · —", quatro traços que parecem falha. Vira uma chamada: o que o plano dá e o botão de
assinar.

## 5 · Falta e depende de nós

### 5.1 · Ordenado por risco para o dia 13

| # | O que | Por que agora |
| --- | --- | --- |
| 1 | **Recuperação de senha** | não existe; foi o que te impediu de entrar na própria conta na manhã da apresentação |
| 2 | **Conta de teste para a equipe** (sua tarefa da call) | a equipe não consegue testar sem isso |
| 3 | **Dados de conferência e logo** | desbloqueia §4.2 inteiro com uma carga, sem código de tela |
| 4 | **Larguras da moldura** | §4.1 — mexe em toda tela, então quanto antes melhor |
| 5 | **Perfil** | §4.3 |
| 6 | **Saída do apito para a casa** | é o fluxo que monetiza; hoje só existe na página de oferta |
| 7 | **Filtro da gestão de banca** | decisão "Alinhada" da call |
| 8 | **Planos Star e MVP** | bloqueado por terceiros (§6) |
| 9 | **Telegram** | bloqueado por decisão de escopo (§6) |

### 5.2 · Os dados que faltam (itens 3)

Duas colunas existem no banco e estão **vazias nos 30 times**: `conferencia` (em `times` e
em `classificacao`) e `logo_url`. Não é bug de tela — é carga.

O mapa de conferências é fixo e conhecido. Os logos vêm do CDN da NBA, com verificação na
gravação como já fazemos com os rostos: **nenhuma imagem quebrada pode chegar à tela**, e
time sem logo cai na sigla em Anton, que é o que a tela já faz hoje.

### 5.3 · Recuperação de senha e foto de perfil precisam de infraestrutura nova

Estes dois são os únicos itens da lista que **não se resolvem só com código nosso**:

- **Recuperar senha exige enviar e-mail**, e o projeto não tem nenhum provedor de e-mail.
  Duas saídas: contratar um provedor pelo marketplace da Vercel (meia hora de configuração,
  e é o caminho certo a médio prazo), ou, para amanhã, um **link de redefinição emitido pelo
  admin** — resolve a equipe e o cliente, não resolve o usuário final.
- **Foto de perfil exige armazenamento de arquivo**, que também não existe. O Blob da Vercel
  é o caminho natural. Alternativa sem dependência: um conjunto de avatares prontos para
  escolher, o que entrega a sensação de personalização sem upload.

**Decida qual das duas saídas você quer em cada caso** — as duas são defensáveis e a escolha
muda o tamanho do trabalho.

### 5.4 · Saída do apito para a casa de apostas (item 6)

A call descreveu o fluxo: o usuário toca numa sugestão de alto grau e vai para a casa
parceira, com a comissão rastreada. O rastreamento está pronto; **falta a porta**. Hoje o
redirecionamento só existe numa página de oferta isolada, e nem o card nem o detalhe do
apito levam a ela.

A regra 4 do projeto continua valendo e não muda: **somente leitura**. Nenhuma aposta é
enviada, nenhuma credencial de casa é guardada, nenhum valor se move. O que entra é um link
de saída rastreado, com o aviso de que a odd na casa pode ser outra — o mesmo texto que o
detalhe já usa.

### 5.5 · Filtro da gestão de banca (item 7)

O print mostra "Entradas sugeridas para hoje" e nada mais. A call alinhou separar **o que a
NIP sugeriu** do **que o usuário realmente fez**. Isso é uma tabela nova (as entradas do
usuário) e um filtro na tela.

Vale dizer o que isso implica: registrar aposta feita aproxima o produto de um caderno de
apostas. Continua sendo somente leitura — o usuário digita o que já fez em outro lugar —,
mas a fronteira merece uma linha explícita na tela.

## 6 · Depende de terceiros — nos bloqueia

| Quem | O quê | O que trava |
| --- | --- | --- |
| Ana Furtado | definir os níveis dos planos Star e MVP com Carlos | §5.1 item 8: sem saber o que cada plano dá, não dá para implementar |
| Ana Furtado | negociações e documentação das casas | §5.4: quais casas entram na saída rastreada |
| Ana Furtado | print da gestão de banca como referência | §5.5: a forma da tela |
| lucas vena | painel de afiliados de exemplo e prints do dashboard | comparação com o painel que já temos |
| lucas vena | investigar a restrição de comunicação | §7 — é o ponto mais importante |
| Carlos | materiais pendentes | — |

**Sobre o Telegram (§5.1 item 9):** tecnicamente é simples e eu confirmei isso na call. Mas
ele só faz sentido depois que os planos existirem, porque a decisão foi que o alerta é
benefício de plano superior. Fazer antes é construir uma porta sem casa.

## 7 · A contradição que precisa da sua palavra

A call registrou como **alinhado**: trocar "confiança máxima" por **"probabilidade muito
alta"**, para evitar problemas de comunicação com os usuários.

**Isso contradiz frontalmente uma regra documentada e testada deste projeto.** O
`CLAUDE.md` diz: *"O % não é probabilidade, é score de confiança. Nunca escreva
'probabilidade' na UI."* Quatorze arquivos de teste travam essa proibição, e a tela de
detalhe do apito escreve hoje, em texto: *"O número é a nota de confiança da análise NIP,
não uma probabilidade."*

**E há um problema de mérito, não só de processo.** O motivo dado na call foi reduzir risco
jurídico e de expectativa. Chamar de "probabilidade" um número que **não é** uma
probabilidade tende a fazer o oposto: cria a expectativa de que 91 significa 91% de chance
de acerto, que é exatamente a leitura que a regra atual existe para impedir. Trocar
"confiança" por "probabilidade" é mais arriscado, não menos.

**O que eu proponho, e é uma terceira saída.** O incômodo da Ana provavelmente não está na
palavra "confiança" — está no superlativo **"máxima"**, que soa como garantia. Dá para
resolver a comunicação sem afirmar o que o número não é: manter "nota de confiança" como o
nome do número e trocar só o rótulo do topo da escala, de "confiança máxima" para algo como
**"sinal mais forte"** ou **"confiança muito alta"**.

**Não vou mexer nisso sem você.** É vocabulário do produto e tem implicação jurídica; a
regra 3 do projeto manda parar e perguntar. Três caminhos:

1. **Manter a regra** e trocar só o superlativo (minha recomendação).
2. **Adotar "probabilidade"** como a call registrou — então a regra do `CLAUDE.md`, o
   `docs/04-design-system.md` e os quatorze testes mudam junto, e isso precisa estar
   escrito como decisão consciente, não como efeito colateral.
3. **Esperar** o lucas vena voltar da investigação de comunicação que ele assumiu na call.

## 8 · O que não está nesta spec, de propósito

As sete decisões comerciais e editoriais da
[spec das correções da Identidade 04](2026-09-08-correcoes-da-revisao-identidade-04.md)
continuam abertas e independem da call — entre elas se quem não jogou conta na taxa e a
escolha entre odd média e faixa com o CJ. Elas não foram mencionadas na reunião e o
comportamento atual segue preservado.
