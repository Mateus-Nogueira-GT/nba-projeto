# Spec 07 — Backtest de rulesets e alerta de dado parado

**Estado:** proposta · 19/08/2026
**Depende de:** spec 01 · e de **histórico acumulado** — o backtest sem temporada
gravada não tem o que reproduzir
**Destrava:** a entrega comercial que justificou a arquitetura inteira

---

## Problema

Duas dívidas de operação, agrupadas porque ambas só fazem sentido com o sistema
já rodando com dado real.

### Backtest

O ADR-0002 chama de **entrega comercial do projeto**. O CLAUDE.md é ainda mais
direto sobre a pureza do motor:

> Tempo e fatos entram como argumento. Isso não é estilo — é o que habilita o
> backtest de rulesets, que é entrega comercial do projeto.

A regra foi mantida a ferro: `npm run boundaries` prova, a cada commit, que o
motor não importa banco, rede, relógio nem framework. Pagamos esse preço em todo
desenho desde o primeiro dia.

**E a ferramenta não existe.** O motor está pronto para ser reexecutado sobre
fatos históricos com outro ruleset, e ninguém consegue fazê-lo.

### Alerta de dado parado

`avaliarFrescor` está escrito, testado e **nunca é chamado**. `registrarBatimento`
também existe. A visão promete:

> Alerta de dado parado — a equipe descobre antes do usuário

Hoje ninguém descobre: não há job que avalie nem canal por onde avisar.

---

## Parte A · Backtest

### O que é

Reexecutar o motor sobre fatos de datas passadas, com um ruleset alternativo, e
comparar o que **teria sido** apitado com o que aconteceu de fato.

Não é simulação de aposta. É responder: *"se o delta do MVP fosse 7 em vez de 6,
quantos apitos a mais teriam saído, e quantos teriam batido a linha?"*

> **Isto não é sugestão de aposta nem promessa de retorno.** É medição do
> comportamento de uma regra sobre dado histórico, para o CJ calibrar a
> estratégia. O relatório precisa dizer isso, pela mesma razão que o `%` é nota
> de confiança e nunca probabilidade (P12, ADR-0005).

### Contrato

```ts
// entrega/backtest/executar.ts — orquestra I/O; o motor segue puro
type PeriodoBacktest = { de: string; ate: string }

type ResultadoBacktest = {
  ruleset: string
  periodo: PeriodoBacktest
  apitos: number
  porNivel: Record<Nivel, number>
  porMetodo: Record<Metodo, number>
  /** Apitos cuja linha o jogador de fato superou naquele jogo. */
  acertos: number
  /** Sem box score do jogo, o apito não é classificável. Nunca contar como erro. */
  indeterminados: number
}

async function executarBacktest(
  db: Db,
  ruleset: Ruleset,
  periodo: PeriodoBacktest,
): Promise<ResultadoBacktest>
```

O laço é o mesmo do job diário: para cada data, `montarFatos` e `avaliar`. **Nada
é gravado** em `apitos` — backtest não polui o histórico real. É a distinção mais
importante da spec.

### Comparar dois rulesets

O valor real está na diferença:

```ts
function comparar(a: ResultadoBacktest, b: ResultadoBacktest): Diferenca
```

A saída responde: quantos apitos a mais, quais jogadores entraram e saíram, o que
aconteceu com a taxa de acerto.

### Onde os rulesets ficam

A tabela `rulesets` existe e está vazia — hoje o ruleset é lido do disco por
`rulesetAtivo()`. Para o backtest comparar versões, elas precisam estar em algum
lugar consultável.

> **Proposta:** o disco continua sendo a fonte do ruleset **ativo**; a tabela
> guarda as versões **candidatas** que o CJ quer testar, com `status: provisorio`.
> Promover uma candidata é um commit do YAML, não um UPDATE — assim a estratégia
> em produção continua versionada em git, como decidiu o ADR-0002.

### Interface

Painel admin, com a guarda de admin. Escolher período, escolher dois rulesets,
ver o comparativo. Exportar CSV, porque o CJ vai querer olhar na planilha dele.

---

## Parte B · Alerta de dado parado

### O que falta

As duas peças puras existem. Falta a orquestração:

```
cron -> lê saude_provedor -> avaliarFrescor(linhas, agora, emJanelaDeJogo) -> notifica
```

### `emJanelaDeJogo` é a parte não trivial

Os limites já estão definidos e são deliberadamente assimétricos:

```ts
LIMITES_PADRAO = { foraDeJogoMs: 30 min, emJanelaDeJogoMs: 90 s }
```

Fora da janela, dado de 30 minutos é normal. Com a bola rolando, 90 segundos já
significa que o Fire Live perdeu a janela de aposta.

Quem responde se estamos em janela de jogo é `jogos`: existe partida com status
`AO_VIVO`, ou com horário marcado nos próximos minutos? Consulta simples, mas é a
diferença entre um alerta útil e um alarme falso a cada madrugada.

### Canal

Não existe nenhum. `log_falhas` está vazia e é o mínimo: registrar o alerta com
severidade. Além disso, algo que **acorda alguém** — e-mail, Slack, o que o
cliente usar.

> **Pergunta:** qual canal? Sem isso, o alerta vira uma linha numa tabela que
> ninguém lê, e a promessa "a equipe descobre antes do usuário" não se cumpre.

### Não repetir

Provedor parado há uma hora não pode gerar 60 alertas. Guardar o último alerta
por provedor e só reavisar após um intervalo — número operacional, vai para o
ruleset como `fire_live.observacao` foi.

---

## Regras que isto toca

- **Regra 2 (motor puro)** — o backtest é a razão de ela existir. Se ele precisar
  de um mock, a regra foi violada em algum lugar.
- **Regra 1** — intervalo de realerta e limites de frescor saem do ruleset
- **ADR-0002** — o ruleset em produção continua versionado em git
- **P12 / ADR-0005** — o relatório de backtest não chama nada de probabilidade

---

## Pronto quando

**Backtest**

- Rodar sobre um período com histórico devolve contagem por nível e por método
- O **mesmo** ruleset sobre o **mesmo** período devolve o mesmo resultado, sempre
- Trocar o delta do MVP no ruleset candidato muda a contagem
- Nenhuma linha é escrita em `apitos` durante a execução
- Jogo sem box score conta como indeterminado, nunca como erro
- Nenhum teste do backtest precisa de mock do motor

**Alerta**

- Provedor sem resposta há mais que o limite gera alerta
- Dentro da janela de jogo, o limite apertado vale; fora dela, o folgado
- Provedor parado há uma hora não gera mais que um alerta por intervalo
- O alerta chega ao canal escolhido, não só à tabela

---

# Plano

### Parte B primeiro

O alerta é pequeno, não depende de histórico e protege tudo o que já foi
construído. O backtest é maior e precisa de temporada acumulada. **Inverter a
ordem interna desta spec.**

### Fatia 1 · Janela de jogo

1. `entrega/observabilidade/janela.ts` — existe jogo ao vivo ou prestes a começar?
2. Teste com fixture: dentro, fora, e na borda

### Fatia 2 · Job de alerta

1. `/api/cron/saude`, a cada 5 minutos
2. Lê `saude_provedor`, chama `avaliarFrescor`, grava em `log_falhas`
3. Intervalo de realerta no ruleset
4. Teste: provedor parado gera um alerta, não sessenta

### Fatia 3 · Canal

Conforme a resposta do cliente. Porta + adapter, como pagamento e fila — e adapter
em memória para o teste contar avisos.

### Fatia 4 · Motor do backtest

1. `entrega/backtest/executar.ts` — laço sobre datas, sem escrita
2. Classificar acerto contra `estatisticas_jogo`
3. Teste com temporada de fixture: resultado determinístico e reprodutível

### Fatia 5 · Comparação

1. `comparar(a, b)`
2. Teste: dois rulesets diferindo em um valor produzem diferença explicável

### Fatia 6 · Painel

1. Tela no admin **com a guarda** — o padrão que a auditoria teve que corrigir
2. Seleção de período e de rulesets candidatos
3. Exportação CSV

---

## Riscos

**O backtest sem histórico não mede nada.** É por isso que esta spec é a última.
Rodar sobre duas semanas de dado dá número, não conclusão — e número com cara de
conclusão é pior que nenhum. O relatório precisa mostrar o tamanho da amostra
junto do resultado.

**`montarFatos` carrega o histórico inteiro de todos os jogadores classificados.**
Chamado em laço sobre 180 datas, é lento. Se doer, a saída é carregar uma vez e
recortar por data em memória — o motor é puro, então isso é seguro por construção.

**Alarme falso mata alerta.** Um alerta que dispara sem motivo é ignorado em uma
semana, e aí o alerta verdadeiro passa junto. Calibrar `emJanelaDeJogo` com
cuidado é mais importante que entregar rápido.
