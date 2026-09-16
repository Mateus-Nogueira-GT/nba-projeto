# Planos de assinatura — grátis, MVP e All Star — design

**Status:** aprovada em 15/09/2026.
**Origem:** a call de 08/09 (três níveis, duas modalidades, diferenciais a definir) e a
definição comercial enviada em 15/09 (preços, entregas por plano). Grilling de oito
perguntas em 15/09; as respostas estão em §3.

Hoje a NIP tem um produto e uma pergunta: `NBA_PRO`, "pode ou não pode". Esta spec troca a
pergunta por "até onde pode", cria o plano grátis sem inventar linha nova no banco, e deixa
a cobrança pronta para dois níveis em duas modalidades.

## 1 · Ponto de partida

**O direito já tem tudo, menos o nível.** `direitos_acesso` guarda `produto`, `origem`,
`inicio`, `fim`, `revogado_em` e `motivo_revogacao`. Uma assinatura de temporada é um
direito com `fim` cravado — o modelo comporta sem mudar de forma. O que falta é uma coluna
dizendo *qual* plano aquele direito representa.

**Toda tela pergunta a mesma coisa, do mesmo jeito.** `avaliarAcesso(db, usuarioId)` devolve
`{ permitido: true | false }` e é chamada em dezesseis pontos: as páginas da home, do apito,
do Fire Live, das quatro telas de estatísticas, da gestão, dos resultados, da conta, do
assinar e do retorno do Mercado Pago; as rotas de API do chat e das inscrições de push; e as
duas guardas em `plataforma/assinatura/`. Cada um vira um ponto de nível.

**A cota do chat é uma só.** `CHAT_COTA_DIARIA` vale para todo mundo; a contagem é por janela
de 24h, sem contador paralelo. "Limitar créditos por plano" é trocar a constante por uma função
do nível.

**A cobrança é mensal por tipo, não por valor.** `ConfiguracaoProdutoPago` tem
`frequencia: 1` e `tipoFrequencia: 'months'` como tipos literais. A porta só sabe criar
`preapproval` (recorrente). Temporada não é mensal com outro número: é pagamento único com
data de fim, e precisa de um segundo caminho na porta e no webhook.

**A home já sabe listar os jogos sem o sinal.** `jogosDoDiaResumo(db, hoje, fuso)` devolve
siglas, horário e status de cada confronto do dia — é a leitura que o plano grátis vai usar.

**Gestão de banca só registra a partir de um apito.** `registrarEntrada` recebe jogador,
atributo e linha escondidos no card sugerido. Quem não vê apito não tem o que registrar.

**Cadastro público está fechado** (`CADASTRO_PUBLICO_HABILITADO=false`) e a decisão de
estatística paga ou aberta está adiada numa flag dedicada — a resolução está em §5 e §7.

## 2 · Escopo

Entra:

- O **nível do plano** como conceito do domínio: `GRATIS`, `MVP`, `ALL_STAR`, nessa ordem.
- Os **portões** de cada tela e recurso por nível (§5), e a experiência do grátis (§6).
- **Cadastro público** ligado (§7) e **migração** dos direitos existentes (§8).
- A **cobrança** de dois níveis em duas modalidades — mensal recorrente e temporada de
  pagamento único — com upgrade (§9), e a **configuração de preços** (§10).
- A **cota de IA por nível** e o botão do assistente só para quem tem.

Fica fora, por decisão de 15/09:

- **Telegram.** Não existe uma linha de código. É a spec seguinte e depende desta: "2 filtros"
  e "todos os filtros" só fazem sentido quando o nível existe. A matriz de §5 registra a linha
  para a spec do Telegram ler daqui.
- **Comunidade, lives, mentorias, reprises, especialistas, suporte 24h.** Acontecem fora da
  plataforma. A página de planos os lista como benefício; o app não entrega nada disso.
- **Funcionalidades que não existem.** Comparação entre jogadores, times e confrontos; painel
  personalizado por perfil; análises com contexto e justificativa; filtros avançados e
  combinações personalizadas; acesso antecipado a recursos novos. Cada uma é spec própria.
  Esta só fixa o nível de cada uma para quando nascer: comparação → MVP; as demais → All Star.
- **Pró-rata, cupom, promoção por período, plano regional, estorno automático.** Ver §9 e §14.

## 3 · Decisões

| # | Decisão | Por quê |
| --- | --- | --- |
| 1 | O nível é **coluna do direito** (`direitos_acesso.nivel_do_plano`), não produto novo nem tabela de planos | Produto novo obrigaria "All Star inclui MVP" a virar checagem de lista em cada portão, ou dois direitos por assinante. Tabela de planos é para quando benefício for dado; hoje benefício é código (portão) e preço é config |
| 2 | **GRATIS é "logado sem direito ativo"** | Nenhuma linha nova para o grátis. O caminho `sem-direito-ativo` que hoje redireciona para `/assinar` vira o nível de entrada — o usuário existe, tem conta, vê o que o grátis vê |
| 3 | Dois direitos ativos ao mesmo tempo → **vale o maior** | O upgrade cria o novo antes de revogar o antigo; nesse instante existem dois, e o usuário não pode cair de nível no meio |
| 4 | **Temporada = até o fim da temporada da NBA, playoffs incluídos**, data fixa em config | É o que "pacote de temporada" significa. Quem compra em março paga o mesmo por menos meses — decisão comercial de 15/09. Tecnicamente é um direito com `fim` cravado, sem recorrência |
| 5 | Na Lista Secreta o grátis vê **os jogos do dia, sem nenhum apito** | Portão mais duro; o sinal é 100% pago. É onde a pessoa decide se paga |
| 6 | **Fire Live é pago desde o MVP**; o grátis vê a aba com o convite | É o produto mais caro de rodar e o mais diferenciado |
| 7 | **IA: grátis não tem**; MVP e All Star têm cota **por dia**, valores distintos | O botão nem aparece no grátis, a API responde 403. A cota diária já existe — vira função do nível. LLM custa dinheiro real em conta que não paga |
| 8 | **Gestão de banca no grátis é só leitura** do histórico | Quem cancelou não perde o que registrou; quem nunca pagou vê a aba com o convite. Zero funcionalidade nova, e vira gancho de retenção |
| 9 | **Resultados é grátis, inteiro** | É a prova social: apitou X ontem e deu certo. Vaza o sinal com um dia de atraso, que não serve para apostar |
| 10 | Estatísticas: **grátis vê o resumo; profundidade é paga**, em qualquer página | No jogador, o GRÁTIS vê o bloco de destaque do topo — identidade, time, situação e as médias principais (pontos, rebotes, assistências); "Jogo a jogo", "Números completos" e "Apitos da estratégia" exigem MVP. *(Corrigido em 16/09: a redação anterior dizia "Ataque/Defesa/Posse grátis", mas esses três são GRUPOS INTERNOS do componente "Números completos" — a seção paga. Não eram seções próprias, e não havia como liberá-los sem liberar o que os contém.)* A mesma régua nas outras páginas (§5): no jogo, "Box score" e "Confrontos anteriores" são MVP; no time, "Box score por jogo" é MVP. Classificação é grátis inteira. Casa com "base da temporada completa" e "estatísticas avançadas" da lista comercial |
| 10b | **"Hierarquia NIP" (tela do time) é GRÁTIS** | Decidido em 16/09, pergunta que a spec tinha deixado aberta. A seção mostra a curadoria do CJ — quem é MVP, All Star, Suporte ou Randola por atributo — e é de onde o motor tira quem pode apitar. Ficou grátis como VITRINE: ver que existe curadoria por atributo, time a time, prova que há trabalho humano por trás e é argumento de venda. Não entrega o sinal do dia, que continua pago |
| 11 | Cortesias `NBA_PRO` existentes viram **ALL_STAR** | Cortesia é para mostrar tudo. Nenhuma cortesia perde acesso a nada na virada |
| 12 | **Upgrade = compra do nível maior**, sem pró-rata; **downgrade não existe** | Na aprovação, o direito antigo é revogado e o contrato antigo é cancelado pela porta. A tela avisa antes de cobrar. Quem quer descer cancela e deixa vencer |
| 13 | Preços e data da temporada em **config**, nunca em código | São decisão comercial. O código lê; quem muda preço faz commit ou muda env, nunca edita componente |
| 14 | O nome do tipo é **`NivelDoPlano`**, a coluna é `nivel_do_plano` | `Nivel` já existe no motor (nível do jogador) e o CLAUDE.md proíbe `nivel` sozinho. Dois conceitos com o mesmo nome no mesmo repositório é como se troca um pelo outro num refactor |

## 4 · O modelo de nível

```ts
// plataforma/assinatura/nivel-do-plano.ts — puro, sem I/O
export type NivelDoPlano = 'GRATIS' | 'MVP' | 'ALL_STAR'
export type Modalidade = 'MENSAL' | 'TEMPORADA'
export const ORDEM_DOS_NIVEIS: readonly NivelDoPlano[] = ['GRATIS', 'MVP', 'ALL_STAR']
export function atende(nivel: NivelDoPlano, minimo: NivelDoPlano): boolean
export function maior(a: NivelDoPlano, b: NivelDoPlano): NivelDoPlano
```

**Schema.** `direitos_acesso.nivel_do_plano text not null` com
`check (nivel_do_plano in ('MVP', 'ALL_STAR'))` — o grátis nunca tem linha, então `GRATIS`
não entra no check. `assinaturas` ganha `nivel_do_plano` (mesmo check) e
`modalidade text` com `check (modalidade in ('MENSAL', 'TEMPORADA'))`: o contrato precisa
saber o que foi comprado, para a conta e para a reconciliação.

**`avaliarAcesso`** deixa de devolver `permitido` e passa a devolver o nível:

```ts
export type ResultadoAcesso =
  | { nivel: NivelDoPlano; direitoId: string | null; validoAte: Date | null; modalidade: Modalidade | null }
  | { nivel: null; motivo: 'sem-sessao' | 'bloqueio-administrativo' }
```

`GRATIS` vem com `direitoId: null`. O motivo `sem-direito-ativo` deixa de existir — ele *é*
o grátis. Com mais de um direito ativo, `nivel` é o maior e `validoAte` é o do direito que
deu o nível. Uma consulta só, como hoje (o comentário sobre iad1 → sa-east-1 continua valendo).

**As guardas.** `exigirNivel(minimo: NivelDoPlano, destino: string)` substitui
`exigirAcesso`: sem sessão → `/entrar?destino=`; **bloqueado → `/conta`**, que já mostra o
status da conta — hoje o bloqueio administrativo cai em `/assinar` junto com quem não tem
direito, oferecendo plano a quem não pode comprar, e isso é corrigido de passagem; nível
insuficiente → `/assinar?nivel=<minimo>&voltar=<destino>`. `exigirAcessoEstatisticasSeConfigurado`
e a flag que adiava a decisão de estatísticas são apagadas: a decisão está tomada em §5.

**Chat e push.** A rota do chat exige `MVP` e responde 403 abaixo disso; a cota é
`cotaDiariaDoNivel(nivel)`. O ramo `comDireito: false` do prompt deixa de existir — ninguém
sem direito chega ao chat. A rota de inscrição de push exige `MVP`: push carrega apito, e
apito é pago.

## 5 · A matriz

| Tela / recurso | GRATIS | MVP | ALL_STAR |
| --- | --- | --- | --- |
| Lista Secreta (home) | jogos do dia, **sem apito** | inteira | inteira |
| Página do apito | redireciona para `/assinar?nivel=MVP` | sim | sim |
| Fire Live | a aba abre com o convite; sem apito | sim | sim |
| Resultados | **inteiro** | sim | sim |
| Estatísticas — classificação inteira; jogador: destaque do topo (identidade, time, médias principais); jogo: Pontos por quarto, Líderes da partida, Desfalques; time: Campanha, **Hierarquia NIP** (decisão 10b), Elenco | sim | sim | sim |
| Estatísticas — jogador: Jogo a jogo, Números completos, Apitos da estratégia; jogo: Box score, Confrontos anteriores; time: Box score por jogo | a seção mostra o título e o convite | sim | sim |
| Gestão de banca | **só leitura** do histórico; sem registrar | sim | sim |
| Push de apito | não; a tela de alertas explica | sim | sim |
| Assistente de IA | botão oculto; API 403 | cota/dia de MVP | cota/dia de All Star |
| Os seis filtros da lista | — (não há lista) | sim | sim |
| Conta | nível "Grátis" e o convite | nível, modalidade, próxima cobrança | idem |
| Telegram *(registro para a spec do Telegram)* | — | 2 filtros | todos |

Itens da lista comercial que a matriz entrega sem tela nova: "todos os jogos e jogadores da
rodada" e "base de dados da temporada completa" são a Lista inteira e a profundidade das
estatísticas; "análise de desempenho recente" é "Jogo a jogo"; "histórico de análises e
palpites" é o Resultados — que ficou grátis, então esse item já é entregue no nível de baixo.

## 6 · O grátis é mais que "bloqueado"

Regra: **nenhuma tela do grátis é vazia nem é só um redirecionamento.** As abas da barra
inferior sempre abrem; o que ele não tem aparece como o que existe ali, mais o nível que libera.

- **Home.** Os confrontos do dia com siglas, horário e status — `jogosDoDiaResumo`, já
  existente — e um convite fixo no lugar dos cards: o que a Lista Secreta é, e que ela começa
  no MVP. Sem filtros (não há o que filtrar), sem chip, sem ordenação. O cabeçalho da rodada e
  o link para Resultados continuam.
- **Fire Live.** A aba abre, mostra os jogos em andamento se houver (o mesmo resumo do dia,
  com status ao vivo) e o convite. Nunca um apito, nunca o modo fire.
- **Estatísticas.** As quatro páginas abrem. As seções de profundidade da matriz (§5) rendem
  só o título e o convite — a página continua inteira acima e abaixo delas, na mesma ordem.
  A classificação não muda.
- **Gestão.** O histórico do usuário aparece como hoje; a coluna de sugestões do dia é
  substituída pelo convite, com a frase de que registrar entradas começa no MVP. Nada é
  apagado quando alguém cancela.
- **Conta.** O bloco de assinatura diz "Grátis" e leva para `/assinar`.
- **Apito** (página funda, fora da barra) redireciona para `/assinar?nivel=MVP&voltar=...`,
  e o assinar sabe voltar.
- **Assistente.** O botão flutuante não é montado abaixo de MVP.

O convite é um componente só (`ConviteDoPlano`), com o nível mínimo e a frase do recurso;
a página de planos recebe `?nivel=` e destaca o plano certo.

## 7 · Cadastro público liga

Plano grátis que ninguém consegue criar não é plano. `CADASTRO_PUBLICO_HABILITADO` passa a
`true` no Plano A — com o rate limit que o cadastro já tem. Não há verificação de e-mail nem
recuperação de senha por e-mail (o projeto não tem provedor de e-mail); o parceiro aceitou essa
ausência em 16/09. A flag continua existindo para poder fechar a porta numa emergência; o
padrão em `.env.example` vira `true`.

## 8 · Migração

Uma migration, três passos no mesmo arquivo: cria `nivel_do_plano` **com** `default 'ALL_STAR'`,
o que preenche todo direito existente (decisão 11); grava `nivel_do_plano = 'ALL_STAR'` e
`modalidade = 'MENSAL'` em `assinaturas` existentes; **remove os defaults**. Dado velho migra,
dado novo é obrigado a escolher. O `down` apaga as duas colunas. O arnês de teste sobe, desce
e sobe de novo, como faz com todas.

`CORTESIA_ADMIN` continua sendo origem válida; a ação do admin que concede cortesia passa a
pedir o nível. `RECONCILIACAO` grava o nível do contrato.

## 9 · Cobrança (Plano B)

**Quatro SKUs.** `MVP_MENSAL`, `MVP_TEMPORADA`, `ALL_STAR_MENSAL`, `ALL_STAR_TEMPORADA`. O
`/assinar` vira o seletor: dois planos, duas modalidades, os preços de §10, a matriz de §5
resumida em benefícios, e os itens fora da plataforma (comunidade, lives…) listados como
benefício sem link.

**Mensal** é o `preapproval` que já existe, um por nível: `PedidoCriacaoAssinatura` ganha
`nivelDoPlano`, o `nomePlano` vira o nome do SKU, o valor vem de §10. O webhook grava
`nivel_do_plano` e `modalidade = 'MENSAL'` no contrato e no direito. `proximaCobranca` e a
contagem regressiva da conta continuam iguais.

**Temporada** é pagamento único. A porta ganha `criarPagamentoUnico(pedido): Promise<PagamentoExterno>`
(Checkout Pro / preferência, com `external_reference` = a referência local, como o preapproval
faz) e `consultarPagamento(id)`. O webhook passa a interpretar o tópico `payment` além de
`preapproval` e `authorized_payment`; um `payment` aprovado cuja referência é de temporada
cria o contrato com `modalidade = 'TEMPORADA'`, `proximaCobranca = null` e
`fim` = a meia-noite **seguinte** a `TEMPORADA_FIM` no fuso da rodada (`intervaloDoDia(...).fim`,
o mesmo helper de todo recorte de dia), e o direito com o mesmo `fim`. Sem recorrência: no ano seguinte é compra nova. **Temporada só é
oferecida enquanto `agora < TEMPORADA_FIM`**; depois disso o seletor esconde a modalidade.
O preço não é pró-rata (decisão 4).

**Upgrade.** Comprar um nível maior com um direito ativo: o novo contrato nasce normalmente;
na aprovação do primeiro pagamento, o direito anterior é revogado com
`motivo_revogacao = 'UPGRADE'` e, se o contrato anterior era mensal, a porta o cancela. A tela
de compra avisa, antes de cobrar, que o plano atual será encerrado sem devolução do período
restante. Entre a aprovação e a revogação vale a decisão 3.

**Trocar de modalidade no mesmo nível** (mensal → temporada) segue a mesma regra do upgrade:
o novo substitui o antigo na aprovação, sem devolução. **O seletor não oferece** nível igual
ou menor que o ativo na mesma modalidade, nem temporada → mensal: essas compras não existem.

**Downgrade** não existe: o usuário cancela e o direito vence. **Estorno de temporada** é
manual: painel do Mercado Pago mais revogação pelo admin, com motivo. Fora da spec.

**Retorno do navegador nunca concede acesso** (princípio da Spec 04, mantido): quem volta do
Checkout Pro vê "aguardando confirmação" até o webhook chegar.

## 10 · Preços e configuração

Tudo em env, lido por `configuracaoProdutoPago`, obrigatório quando
`MERCADOPAGO_CHECKOUT_ENABLED=true`:

```
PLANO_MVP_MENSAL_CENTAVOS=5990
PLANO_MVP_MENSAL_DE_CENTAVOS=7990          # só exibição: "de R$ 79,90 por R$ 59,90"
PLANO_MVP_TEMPORADA_CENTAVOS=39700
PLANO_ALL_STAR_MENSAL_CENTAVOS=9990
PLANO_ALL_STAR_MENSAL_DE_CENTAVOS=14900    # só exibição
PLANO_ALL_STAR_TEMPORADA_CENTAVOS=59700
TEMPORADA_FIM=2027-06-30                   # último dia INCLUSIVE da temporada vendida
CHAT_COTA_DIARIA_MVP=                      # a definir pelo parceiro — ver §14
CHAT_COTA_DIARIA_ALL_STAR=                 # a definir pelo parceiro — ver §14
```

O preço "de" só aparece quando está definido e é maior que o preço cobrado. Os valores acima
são os de lançamento enviados em 15/09; mudá-los é mudar env, nunca código.
`MERCADOPAGO_PLANO_NOME` e `MERCADOPAGO_PLANO_VALOR_CENTAVOS` são apagados **no Plano B**,
quando os SKUs os substituem — no Plano A o checkout antigo continua atrás da flag, intacto.
`CHAT_COTA_DIARIA` é apagada no Plano A em favor das duas por nível.
A flag que adiava a decisão de estatísticas também é apagada no Plano A (§4).

## 11 · O que não muda, de propósito

O motor e o ruleset — nível do plano não entra em regra de estratégia. O painel de afiliados
e a trilha de saídas. O formato do snapshot do feed. A regra 4 do CLAUDE.md: nada aqui envia
aposta, guarda credencial de casa ou movimenta dinheiro fora do Mercado Pago.

## 12 · Dois conflitos registrados, não resolvidos aqui

**"Probabilidade estimada e nível de confiança"** está na lista comercial do MVP. O CLAUDE.md
diz que o % é score de confiança e que "probabilidade" nunca aparece na UI; a ata de 08/09
registrou "probabilidade muito alta" como alinhado e o que foi ao ar foi `SINAL MAIS FORTE`.
É a segunda vez que volta. Esta spec escreve "nível de confiança" em toda tela e não muda a
regra. Derrubá-la é decisão para `docs/05-perguntas-abertas.md`, com o cliente.

**MVP abaixo de All Star** inverte o vocabulário do produto. Nível do jogador é
`MVP · All Star · Suporte · Randola` — MVP no topo. O assinante que aprende que "MVP" é o
melhor jogador vai ler "MVP" como o melhor plano. Esta spec usa os nomes enviados; o custo
aparece em ticket de suporte, não em código. Fica registrado para o parceiro decidir com o
cliente antes do Plano B ir ao ar.

## 13 · Pronto quando

**Plano A — níveis e portões**

- `atende` e `maior` respeitam a ordem `GRATIS < MVP < ALL_STAR`, e com dois direitos ativos
  `avaliarAcesso` devolve o maior.
- Um usuário logado sem direito recebe `nivel: 'GRATIS'`, nunca um redirecionamento para
  `/assinar` a partir de uma aba da barra.
- Cada linha da matriz de §5 tem um teste que renderiza a tela como GRATIS, MVP e ALL_STAR e
  afirma o que aparece e o que não aparece — o mesmo arnês de `telas-04-*`.
- A home do grátis lista os jogos do dia e **não contém** nome de jogador apitado, nível de
  apito nem confiança.
- A página do jogador, para o grátis, contém o bloco de destaque do topo (identidade, time,
  situação, médias principais) e não contém as linhas de "Jogo a jogo" nem os "Números
  completos"; a do jogo contém "Líderes da partida" e não contém o box score; a do time contém
  "Elenco" e não contém o box score por jogo.
- A gestão do grátis mostra o histórico e não tem formulário de registro.
- A rota do chat responde 403 para GRATIS e usa a cota do nível para MVP e ALL_STAR; o botão
  não é montado para GRATIS.
- A migration sobe, desce e sobe; todo direito existente sai com `ALL_STAR`.
- Cadastro público cria uma conta que nasce GRATIS.
- Nenhum teste nomeia jogador ou time. Nenhuma tela contém a palavra "probabilidade".
- Bateria verde: `typecheck`, `lint`, `boundaries`, `test`, `build`.

**Plano B — cobrança**

- `/assinar` mostra quatro SKUs com os preços de §10, "de/por" onde definido, e esconde a
  temporada quando `agora ≥ TEMPORADA_FIM`.
- Mensal por nível: o webhook de `preapproval` grava `nivel_do_plano` e `modalidade` no
  contrato e no direito.
- Temporada: um `payment` aprovado cria contrato e direito com `fim = TEMPORADA_FIM` e sem
  `proximaCobranca`; o mesmo evento entregue duas vezes não cria dois direitos (o mesmo
  teste de idempotência que o de `preapproval` já tem).
- Upgrade: na aprovação do novo, o direito antigo tem `revogado_em` e motivo `UPGRADE`, e a
  porta fake registra o cancelamento do contrato antigo; em nenhum instante `avaliarAcesso`
  devolveu menos que o nível antigo.
- Retorno do navegador sem webhook não concede acesso.
- Porta fake cobre `criarPagamentoUnico` e `consultarPagamento`; nenhum teste chama o Mercado
  Pago de verdade.

## 14 · Riscos e o que ficou registrado

- **Dezesseis portões, um esquecido = grátis vendo conteúdo pago.** A mitigação é o teste por
  linha da matriz (§13), não a leitura do diff. O Plano A apaga `exigirAcesso` e
  `avaliarAcesso().permitido` para que o typecheck acuse quem ficou para trás.
- **Os valores da cota de IA não estão definidos.** A lista comercial diz "limitar créditos"
  e "limite ampliado" sem número. Pela regra 3 do CLAUDE.md, ninguém inventa: as duas
  variáveis existem e o parceiro preenche. Enquanto qualquer uma estiver vazia, **o chat se
  comporta como desligado** — botão oculto, API 503 — do mesmo jeito que `CHAT_HABILITADO=false`.
  Degradar é melhor que quebrar o boot de produção por uma variável que a operação esqueceu, e
  melhor que inventar um número.
- **`TEMPORADA_FIM` é anual.** Ninguém vai lembrar de mudar em junho. O Plano B inclui um
  aviso no painel do admin quando faltam 30 dias, e o seletor esconde a temporada sozinho
  depois da data. Renovação não é automática por decisão 4.
- **Cortesia vira All Star para todos.** Se houver cortesia que devia ser MVP, o admin rebaixa
  à mão depois da virada. É o preço de nenhuma cortesia perder acesso.
- **Resultados grátis vaza o sinal com um dia de atraso.** Decisão consciente (9); se virar
  vetor de cópia, o corte é por tempo (só noites com mais de N dias), não por remover a tela.
- **O ramo `comDireito: false` do prompt do chat morre.** Ele existia para responder a quem
  não assinava; agora quem não assina não chega ao chat. A sonda de guardrail
  (`npm run chat:sondar`) precisa rodar de novo no Plano A, porque o prompt muda.
- **Telegram lê a matriz daqui.** Se §5 mudar, a spec do Telegram tem que mudar junto.

## 15 · Os dois planos

**Plano A — níveis e portões.** §4, §5, §6, §7, §8, a cota de IA por nível, e o `/assinar`
como página de comparação (sem botão de compra por nível — o checkout continua atrás de
`MERCADOPAGO_CHECKOUT_ENABLED`, que está `false` em produção). Entrega o grátis e os dois
níveis inteiros com o admin concedendo cortesia, sem tocar no Mercado Pago.

**Plano B — cobrança.** §9 e §10. Seletor de planos, mensal por nível, temporada por
pagamento único, upgrade. Depende do Plano A estar no ar.

A ordem separa o risco de produto do risco de dinheiro: dá para ver o grátis funcionando —
e o cliente aprovar o que cada nível mostra — antes de encostar em checkout.
