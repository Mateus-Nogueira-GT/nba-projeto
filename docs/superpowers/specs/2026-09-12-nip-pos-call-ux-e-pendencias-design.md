# NIP · o que falta depois da call de 08/09 — UX e pendências nossas

**Data:** 12/09/2026 · **Status:** rascunho para decisão do parceiro
**Origem:** a call de 08/09/2026 às 11h (anotações do Gemini) e três capturas do app em
produção enviadas em 12/09 (Estatísticas, Perfil, Gestão de banca)
**Prazo citado na call:** a versão final é para **o dia 13** — amanhã.

---

## 1 · Como ler esta spec

A call decidiu seis coisas e distribuiu onze tarefas. Parte já está no ar; parte não existe;
e um ponto contradizia uma regra documentada do projeto — esse foi resolvido em 12/09 e já
está no ar (§7). Esta spec separa exatamente isso:

- **§3** o que a call pediu e **já está pronto** — para ninguém trabalhar duas vezes;
- **§4** os **ajustes de UX** dos três prints, que é o que você pediu agora;
- **§5** o que **falta e depende de nós**;
- **§6** o que **depende de terceiros** e nos bloqueia;
- **§7** a **redação da confiança**, já decidida — e o acoplamento que a troca revelou;
- **§9** o que **ainda depende de você**.

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

**Pronto quando:**

- a moldura aceita a largura como parâmetro e cada tela declara a sua; nenhuma tela fica com
  largura solta no meio do arquivo;
- em 1280 px e em 1440 px, a Estatísticas, os Resultados, a Gestão e o Perfil ocupam a
  largura de dados, e a Lista e o Fire Live seguem na de leitura;
- em 390 px **nenhuma tela rola na horizontal** e o respiro lateral é o de hoje;
- a barra de abas inferior continua ancorada e sem sobrepor o último card em qualquer
  largura;
- a captura das telas a 390 e a 1280 px entra no fechamento, lado a lado com o antes.

**Arquivos:** `src/components/navegacao/Moldura.tsx`, `Esqueleto.tsx` (que repete o 640 e
precisa acompanhar, senão o esqueleto de carregamento salta quando a tela chega) e a
declaração de largura em cada `page.tsx`.

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
  existe; falta popular `times.logo_url` e ligá-lo (§5.2). **A logo vale em toda tela**
  (§4.4), não só aqui: tela de time, tela de partida, cabeçalho de jogo e jogos do dia
  entram junto — é uma passada só, e deixar metade do app com logo e metade sem seria pior
  do que nenhuma.
- **A tabela ganha o que a largura nova permite:** nome do time por extenso ao lado da
  sigla, jogos atrás do líder, e aproveitamento em casa e fora. Em celular essas colunas
  saem e fica o que já está no print.
- **Leitura por varredura:** as duas conferências lado a lado no desktop, empilhadas no
  celular, com a linha de corte do play-in desenhada entre a 10ª e a 11ª posição.

**Pronto quando:**

- há **duas tabelas**, Leste e Oeste, cada uma com 15 times, e a posição reinicia em 1º em
  cada uma;
- o trilho marca playoff da 1ª à 6ª e play-in da 7ª à 10ª **dentro da conferência**, com a
  linha de corte visível entre a 10ª e a 11ª;
- **os 30 times têm logo**, e o time cuja imagem falhar cai na sigla em Anton sem buraco na
  linha — a mesma regra dos rostos;
- a logo tem texto alternativo com o nome do time e não é o único canal: a sigla continua
  escrita ao lado;
- em 390 px a tabela mostra posição, logo, sigla, vitórias e derrotas, aproveitamento e
  últimos 5, e as colunas novas somem — **sem rolagem horizontal da página** (se a tabela
  precisar rolar, ela rola dentro do próprio contêiner);
- nenhum dado inventado: time sem conferência no banco não vira "Leste" por padrão — cai num
  grupo rotulado e visível, para a falta de dado aparecer em vez de mentir.

**Arquivos:** `src/app/(app)/estatisticas/page.tsx`, `src/design-system/componentes/LogoTime.tsx`
(existe e nunca foi ligado), `Tabela.tsx`, e a carga de dados da §5.2.

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

**Os estados que a tela precisa cobrir**, porque é onde telas de conta costumam quebrar:
sem nome (cai nas iniciais do e-mail), sem foto (monograma), sem plano (a chamada acima),
plano vencendo (contagem regressiva), plano vencido, e-mail novo aguardando confirmação
(o antigo continua valendo até confirmar), e um só dispositivo (não faz sentido oferecer
"encerrar sessão" no aparelho em uso sem dizer que é ele).

**Pronto quando:**

- o topo mostra foto ou monograma, nome e e-mail, e a etiqueta do plano;
- **nome, e-mail, senha e foto são editáveis pelo próprio usuário**, cada um com o retorno
  do que aconteceu — sucesso, erro e o que fazer;
- trocar e-mail **não derruba o acesso**: o endereço novo só vale depois de confirmado;
- trocar senha exige a senha atual;
- existe caminho para **senha esquecida** a partir da tela de entrar (ver §5.3 para a
  dependência);
- cada dispositivo pode encerrar a própria sessão, e o aparelho em uso está marcado como tal;
- em 390 px os blocos empilham na ordem Conta · Assinatura · Alertas · Dispositivos; no
  desktop, dois por linha;
- nenhuma ação destrutiva sem confirmação, e nenhuma senha ou token aparece em log.

**Arquivos:** `src/app/(app)/conta/page.tsx` e ações novas ao lado dela,
`src/modules/plataforma/auth/**`, migration para `usuarios.foto_url`, e o `Avatar` do design
system (já resolve foto e monograma — reaproveitar, não recriar).

### 4.4 · Os pontos de UX que vieram da call, não dos prints

Ficam registrados aqui para não se perderem entre as pendências funcionais:

- **Logo entra em tudo.** Decidido pelo parceiro em 12/09. A call registrou a restrição a
  "versão de navegador" por causa de direitos de nome; como o produto **é** a versão de
  navegador, a logo vale em toda tela — classificação, tela de time, tela de partida,
  cabeçalho de jogo, jogos do dia. A restrição volta à mesa **se e quando** existir app
  nativo, e aí é decisão nova, não herança desta.
- **Quadra de basquete ao fundo e fotos de perfil dos jogadores.** O componente da quadra já
  existe e os rostos já estão nos cards; falta decidir onde a quadra aparece e com que peso,
  para não competir com a leitura do card.
- **Classificação parecida com o Sofascore.** É o que a §4.2 entrega: tabela densa, logo,
  sequência e últimos 5. O que **não** entra é o que a Identidade 04 já tinha descartado —
  nada de probabilidade de vitória, nada de mapa de calor.

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

## 7 · A redação da confiança — decidido em 12/09

A call registrou como alinhado trocar "confiança máxima" por "probabilidade muito alta".
Isso colidia com uma regra do `CLAUDE.md` travada por quatorze arquivos de teste, e tinha um
problema de mérito: o motivo alegado era reduzir risco jurídico, mas chamar de
"probabilidade" um número que **não é** probabilidade cria exatamente a expectativa que a
regra existe para impedir — que 91 signifique 91% de chance de acerto.

**O parceiro decidiu pela terceira saída:** o incômodo estava no superlativo, não na palavra
"confiança". O rótulo do grau 5 passou de `CONFIANÇA MÁXIMA` para **`SINAL MAIS FORTE`**. O
nome do número continua sendo nota de confiança, a regra continua valendo e os quatorze
testes ficaram intocados. **Feito e no ar** — era uma linha de ruleset.

### 7.1 · O que a troca revelou

Uma linha de YAML quebrou quatro testes, e o motivo é instrutivo: **código e teste dependiam
do texto do ruleset**, que é o oposto da regra 1.

A tela do detalhe cortava o prefixo "CONFIANÇA " com uma expressão regular, para o rótulo
caber na coluna de 96 px do hero. Quando o grau 5 deixou de começar com essa palavra, o
corte virou nada e o rótulo inteiro voltou para a coluna estreita. E quatro testes fixavam
os rótulos como literais, de modo que mudar um valor no YAML obrigava a mudar teste.

Os dois foram corrigidos: a forma curta virou um campo do ruleset (`rotulo_curto`) e os
testes passaram a ler do ruleset ativo — travam as bordas das faixas e a presença das cinco,
não o texto. **Vale como alerta para o resto:** onde mais o código lê texto de ruleset
esperando um formato? É o tipo de acoplamento que só aparece quando o valor muda.

## 8 · O que não está nesta spec, de propósito

As sete decisões comerciais e editoriais da
[spec das correções da Identidade 04](2026-09-08-correcoes-da-revisao-identidade-04.md)
continuam abertas e independem da call — entre elas se quem não jogou conta na taxa e a
escolha entre odd média e faixa com o CJ. Elas não foram mencionadas na reunião e o
comportamento atual segue preservado.

## 9 · O que ainda depende de você

Fechadas até aqui: a redação da confiança (§7) e a logo em toda tela (§4.4). Restam:

| # | Decisão | O que muda |
| --- | --- | --- |
| 1 | **Recuperação de senha**: provedor de e-mail de verdade, ou link emitido pelo admin | o provedor é meia hora de configuração e resolve o usuário final; o link do admin resolve você e a equipe hoje e não resolve o usuário |
| 2 | **Foto de perfil**: armazenamento de arquivo, ou um conjunto de avatares para escolher | o armazenamento permite foto própria; os avatares entregam personalização sem dependência nova |
| 3 | **Por onde eu começo** | a ordem da §5.1 começa por senha e conta de teste, porque são as que travam você e a equipe |

E seguem abertas, independentes desta call, as sete decisões da
[spec das correções da Identidade 04](2026-09-08-correcoes-da-revisao-identidade-04.md) —
entre elas se quem não jogou conta na taxa e a escolha entre odd média e faixa com o CJ.
