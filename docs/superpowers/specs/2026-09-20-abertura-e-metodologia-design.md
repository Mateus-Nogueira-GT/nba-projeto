# A abertura do app e o aceite da metodologia

**Data:** 20/09/2026 · **Status:** spec escrita a partir de três pedidos do parceiro, com as
quatro ambiguidades resolvidas por ele no mesmo dia. **Aprovada para execução direta.**
**Contexto:** até aqui o app abria na Lista e a metodologia vivia numa tela que só o Perfil
alcançava. Os três pedidos atacam a mesma coisa por ângulos diferentes: **quem chega não
sabe o que está vendo, e quem volta não cai onde a ação está.**

---

## 1 · Objetivo em uma frase

O app passa a abrir onde a ação está, a metodologia passa a ser alcançável de dentro da
Lista, e ninguém usa o produto sem ter lido o método uma vez — com o aceite gravado.

## 2 · Problema

Três defeitos, um por pedido:

1. **O app abre na Lista, sempre.** Quando há jogo no 1º quarto — a janela em que o Fire
   Live existe e a única em que o produto tem urgência — a pessoa precisa de um toque para
   chegar lá, e pode nem perceber que há algo acontecendo.
2. **A metodologia está escondida.** `/como-funciona` existe e explica tudo (as duas
   estratégias, os níveis, oscilação, OPD, as faixas de confiança), mas só o Perfil leva até
   ela. Quem está olhando um card com "SUPORTE · N2 · ODD MÉDIA 1,58" não tem de onde
   perguntar o que isso quer dizer.
3. **Ninguém precisa ter lido nada.** Uma conta nova cai direto em `/assinar`. A pessoa
   decide sobre preço antes de saber o que o método é, e não há registro de que ela viu.

## 3 · As quatro decisões do parceiro (20/09)

| Dúvida | Resposta |
| --- | --- |
| O Fire Live só existe no 1º quarto; abrir nele significa tela vazia na maior parte do dia. | **Ao Vivo quando há jogo no 1º quarto; senão, a Lista.** Ninguém encontra tela vazia. |
| O cadastro hoje cai em `/assinar`. Onde entra a metodologia? | **Cadastro → metodologia → planos → Ao Vivo.** O funil de venda fica. |
| Quem já tem conta nunca aceitou. | **Todo mundo vê uma vez no próximo login**, com a data gravada. |
| Já existe `/como-funciona`. | **O botão leva para ela.** Um texto só, num lugar só. |

## 4 · As três correções

### 4.1 · O app abre onde a ação está

**Correção.** Uma rota nova, `/abrir`, que não desenha nada: lê os jogos do dia, pergunta se
algum está no 1º quarto e redireciona para `/fire-live` ou para `/`.

```
/abrir → estadoDoCiclo(jogo, false, ruleset.fire_live.quarto) === 'Q1' em ALGUM jogo?
           sim → /fire-live
           não → /            (a Lista)
```

**Por que uma rota separada, e não a decisão dentro de `/`.** Se `/` redirecionasse, clicar
em ENTRADAS durante um jogo jogaria a pessoa de volta no Ao Vivo, e a Lista ficaria
inalcançável enquanto houvesse bola rolando. A decisão precisa de um endereço que só é
visitado na ABERTURA.

**Quem aponta para ela:** o `start_url` do manifesto do PWA (hoje `/`) e o destino PADRÃO do
login. O `destino` que o login já carrega quando alguém é barrado numa tela protegida
continua mandando — só o padrão muda.

**`/abrir` não checa sessão.** Ela redireciona para telas que já têm portão; duplicar a
checagem só criaria um segundo lugar para errar.

**Aceite.** Teste com um jogo no 1º quarto → redireciona para `/fire-live`; sem nenhum →
para `/`. `manifest.ts` e o teste do PWA passam a dizer `/abrir`.

### 4.2 · O botão da metodologia, ao lado de "LISTA DO DIA"

**Correção.** Um link "COMO FUNCIONA" junto do H1 da Lista, levando para `/como-funciona`.

**Um slot novo no `CabecalhoTela`.** O slot `acoes` que existe hoje fica à direita do
SELETOR, e na Lista ele já é ocupado pela fileira de filtros. O pedido é ao lado do título,
então o cabeçalho ganha `aoLadoDoTitulo` — um slot que só a Lista usa por enquanto.

**Só na Lista.** O Fire Live não recebe: o pedido foi na aba de Entradas, e um segundo
botão idêntico noutra aba é decisão que ninguém tomou.

**Aceite.** `telas-04-lista`: existe um link para `/como-funciona` dentro do cabeçalho, e
ele não está na fileira de filtros.

### 4.3 · A metodologia com aceite, no cadastro e para a base atual

**O dado.** Uma coluna em `usuarios`:

```
metodologia_aceita_em  timestamp with time zone  NULL
```

Nulo = nunca aceitou. **Timestamp e não booleano** porque "concordo" é registro: a data
importa, e custa o mesmo. NÃO guardamos qual versão do texto foi aceita — hoje não existe
versão de metodologia para comparar, e inventar uma agora é resolver problema que não há.

**A tela.** `/metodologia`: o mesmo conteúdo da `/como-funciona` e, ao fim, um botão
**OK, CONCORDO** que grava a data e segue.

**O conteúdo, num lugar só.** O corpo da `/como-funciona` (467 linhas hoje, mais os
auxiliares `Secao`, `Caixa` e `n`) vira um componente que as DUAS telas renderizam. É o que
faz "mudar a explicação depois" ser mudar um arquivo. Ele lê o ruleset por conta própria —
as duas telas são componentes de servidor, e passar a teoria por prop só espalharia a
leitura.

**O portão.** Dentro de `exigirNivel`, entre a checagem de acesso e a de nível:

```
sem sessão                  → /entrar         (como hoje)
acesso nulo                 → /entrar ou /conta (como hoje)
metodologia_aceita_em NULL  → /metodologia?destino=<a tela pedida>     ← novo
nível insuficiente          → /assinar        (como hoje)
```

O portão vem ANTES do de nível de propósito: é o que faz o cadastro ver a metodologia antes
dos planos, que é a ordem que o parceiro escolheu.

**O custo dessa escolha, declarado.** `exigirNivel` é o guarda de NÍVEL DE ASSINATURA, e
consentimento é outro assunto — juntar os dois mistura responsabilidades. A alternativa é
repetir uma chamada em doze telas e esquecer dela na décima terceira. Escolhemos o guarda
único; um teste de fonte cobra que toda tela sob `(app)` chame `exigirNivel` ou esteja numa
lista curta de exceções nomeadas.

**As exceções, nomeadas:** `/metodologia` (senão faz laço), `/entrar`, `/cadastrar`,
`/redefinir`, `/como-funciona` e `/retorno/mercadopago`. As quatro primeiras são de quem
ainda não entrou ou está entrando; `/como-funciona` é a mesma leitura sem o aceite, e
barrá-la seria barrar justamente o texto que se quer que a pessoa leia.

**Depois de concordar:** grava a data e redireciona para o `destino` que veio na URL. Sem
destino, vai para `/abrir`.

**A sequência do cadastro** passa a ser:

```
cadastrar → (loga) → /assinar → o portão intercepta → /metodologia?destino=/assinar
          → OK, CONCORDO → /assinar → … → /abrir
```

O cadastro continua redirecionando para `/assinar` como hoje: quem muda a ordem é o portão,
não a ação de cadastro. Uma coisa a menos para manter em dois lugares.

**Aceite.** Usuário sem aceite é mandado para `/metodologia` de qualquer tela; com aceite,
passa. O botão grava a data e leva ao destino. O teste de fonte das exceções fica verde.

## 5 · Arquitetura

```
drizzle/00NN_*.sql                            + usuarios.metodologia_aceita_em (e o down)
src/modules/dominio/db/schema/plataforma.ts   a coluna
src/modules/plataforma/assinatura/guarda.ts   o portão, entre acesso e nível

src/app/(app)/abrir/page.tsx                  NOVA — decide e redireciona
src/app/(app)/metodologia/page.tsx            NOVA — conteúdo + OK, CONCORDO
src/app/(app)/metodologia/acoes.ts            NOVA — grava a data
src/components/metodologia/Conteudo.tsx       NOVA — o corpo extraído da /como-funciona
src/app/(app)/como-funciona/page.tsx          passa a renderizar o componente

src/components/navegacao/CabecalhoTela.tsx    + slot aoLadoDoTitulo
src/app/(app)/page.tsx                        o botão COMO FUNCIONA no cabeçalho
src/app/manifest.ts                           start_url: '/abrir'
src/app/(app)/entrar/acoes.ts                 destino padrão '/abrir'
```

O motor não muda. O ruleset não muda. Nenhuma tela perde função.

## 6 · Verificação

- `npm run typecheck && npm run lint && npm run boundaries && npm test`.
- Migração sobe e desce limpa — o teste que já existe (`persistencia`) cobre.
- Testes novos: `/abrir` nos dois caminhos; o portão com e sem aceite; a ação que grava a
  data; o botão no cabeçalho da Lista; o `start_url`; o teste de fonte das exceções; e que
  as duas telas de metodologia renderizam o MESMO componente.
- Captura em 1024 e 1440, sem rolagem horizontal, com a tela nova de metodologia.

## 7 · Fora de escopo

- Versionar o aceite (guardar qual texto foi aceito).
- O botão da metodologia no Fire Live ou nas outras abas.
- Reescrever o texto da metodologia — ele é o que já está na `/como-funciona`.
- Qualquer mudança no que o Fire Live mostra quando não há jogo.

## 8 · Ordem

1. A coluna e a migração.
2. O componente de conteúdo extraído, com a `/como-funciona` passando a usá-lo.
3. `/metodologia` e a ação de aceite.
4. O portão em `exigirNivel` e o teste de fonte das exceções.
5. `/abrir`, o `start_url` e o destino do login.
6. O slot e o botão no cabeçalho da Lista.
7. Bateria, captura, doc, commit único.

## 9 · Riscos

| Risco | Mitigação |
| --- | --- |
| **O portão dentro de `exigirNivel` intercepta tela demais** — inclusive `/assinar`, que é onde o cadastro cai. | É o comportamento desejado (metodologia antes dos planos). As exceções são nomeadas e têm teste de fonte. |
| **Laço de redirecionamento** se `/metodologia` passar pelo portão. | Ela não chama `exigirNivel`: checa a sessão direto. Teste cobre. |
| **`/abrir` na frente de toda abertura** — uma leitura a mais no caminho crítico. | É a mesma leitura (`jogosDoDiaResumo`) que o Fire Live e as Estatísticas já fazem; e ela só roda na abertura, não a cada navegação. |
| **A base atual toda vê a tela no próximo login.** | É o que o parceiro escolheu. Uma vez por conta, e a data fica gravada. |
| **Extrair 467 linhas** pode mudar a `/como-funciona` sem querer. | Os testes de escrita e de tela que já cobrem a `/como-funciona` continuam valendo sem edição — se o texto mudar, eles quebram. |
