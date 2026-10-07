# Odds ocultas no app e rodada pela data dos EUA

**Data:** 07/10/2026. **Decisões do parceiro (07/10):**

1. "A parte de odd pode tirar tudo do front, porque não terá nada de integração com aposta ainda.
   Deixe só desligado agora, mas não tire do código."
2. "O jogo deve contar no dia em que foi marcado nos EUA."

## 1. Odds desligadas, código mantido

- Chave nova no ruleset: `odds.exibir_no_app: false`. O padrão do schema é `true`, o comportamento
  de hoje. Religar é trocar uma linha.
- **Saem da tela**, com a chave em `false`:
  - a odd do card, da tabela da Lista, de Resultados e do herói do apito (`oddFaixa`);
  - a tabela de odds por casa e a nota "Faixa entre N casas" do painel do apito;
  - a faixa de referência da tabela estática;
  - o exemplo de odd e o texto sobre odds da Metodologia;
  - o campo "odd" ao registrar uma entrada na Gestão, e a coluna de odd das entradas.
- **Onde se corta:** na origem. A materialização do feed não grava `oddFaixa`, os carregadores
  zeram faixa e casas e entregam à tela a flag `exibirOdds`. Os componentes já não desenham nada
  quando não há odd (`oddDaLinha(null)` devolve `null`). Feeds antigos, gravados com odd, também
  ficam limpos: os carregadores filtram ao ler.
- **Fica como está:** a coleta de odds e o admin de mercados (`/admin/mercados`). As casas estão em
  stand-by e nada disso aparece para o assinante. O motor não muda: odd nunca foi entrada de regra.
- O % de confiança continua. Ele é da análise, não da casa.

## 2. A rodada pela data dos EUA

Hoje `rodada.fuso: America/Sao_Paulo`, resposta do cliente de 24/08. Um jogo às 22h de Nova York
começa à meia-noite de Brasília e cai na rodada seguinte, e então um time pode ter dois jogos na
mesma rodada (DEN em 08/11/2025). O parceiro decidiu: **a rodada é a data do jogo nos EUA.**

- Hoje um fuso só faz duas coisas: decide **a que dia o jogo pertence** e **que horas a tela
  mostra**. A mudança separa as duas:
  - `rodada.fuso: America/New_York` decide o dia da rodada, o "hoje" do app, a fronteira de
    temporada, os crons e o `data_referencia` dos jogos;
  - `rodada.fuso_exibicao: America/Sao_Paulo`, chave nova, decide as **horas** na tela, as datas do
    admin e das contas, e os horários do chat. O assinante continua vendo "19:00" de Brasília.
  - A **data de um jogo** na tela, como "3/12" no histórico, é sempre a da rodada (EUA). Senão,
    um jogo às 22h de Nova York apareceria com o dia seguinte dentro da rodada do dia anterior.
- A conta de Nova York usa o fuso de verdade (`America/New_York`, com horário de verão), não um
  deslocamento fixo. Para todo jogo da NBA, a data em Nova York é a data da agenda oficial (a
  BallDontLie chama de `date`).
- **Dado já gravado:** os 1.231 jogos de 2025-26 têm `data_referencia` no fuso de Brasília. Um
  script reexecutável recalcula a data pelo fuso novo, e depois o motor retroativo regrava a
  temporada. Para não sobrar apito em data que perdeu o jogo, o motor retroativo apaga primeiro
  tudo de 2025-26 nas tabelas retroativas. O parceiro roda os dois passos, porque escrevem em
  produção.
- **Risco controlado:** a chave única `jogos_chave_referencia (data_referencia, casa, visitante)`
  continua valendo. O mesmo confronto em datas dos EUA diferentes é sempre jogo diferente. O script
  confere colisões antes de gravar e para se encontrar alguma.

## 3. Fora do escopo

Integração com casas (stand-by), o ajuste de horário da publicação da Lista (continua "1h antes do
primeiro jogo", que agora é o primeiro jogo do dia dos EUA) e textos que citam "horário de Brasília".
Esses textos continuam certos, porque a tela segue em Brasília.
