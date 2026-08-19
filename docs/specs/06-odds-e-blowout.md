# Spec 06 — Odds e aviso de blowout

**Estado:** proposta · 19/08/2026
**Depende de:** spec 01 (jogos e jogadores precisam existir para ancorar odd) ·
**contrato comercial com as casas**
**Destrava:** o card completo

---

## Problema

Duas coisas independentes, agrupadas porque ambas completam o card e ambas já
estão descritas no ruleset sem uma linha de código.

### Odds

Quatro tabelas vazias — `casas`, `odds_snapshot`, `odds_agregada`,
`mapa_mercados` — e a seção `odds` do ruleset homologada:

```yaml
odds:
  agregacao: mediana      # resiste a outlier de uma casa
  casas_minimas: 2        # abaixo disso, cai no fallback
  exibicao: faixa         # sempre min-max, nunca odd única
  fallback: tabela_estatica
```

`CardEntrada` **já sabe exibir** faixa entre casas, com contagem. Nada preenche.

### Blowout

`avisos.blowout` está no ruleset e no schema de validação, sem implementação:

```yaml
avisos:
  blowout:
    quarto: 4
    diferenca_pontos: 25
    aplica_a: TITULARES
    local: introducao_das_estrategias
```

`local: introducao_das_estrategias` é instrução explícita: **lembrete fixo, não
dentro do card**.

---

## A restrição que governa tudo aqui

> **ADR-0004 — odds somente leitura.**
> Sem envio de aposta. Sem credencial de casa. Sem conta de usuário vinculada a
> casa. Sem movimentação de dinheiro. Não criar tabela, rota ou campo para isso.

O schema já foi desenhado sob essa restrição e diz isso por escrito. Esta spec
**lê** odd pública e agrega. Qualquer coisa além disso está fora de escopo por
decisão registrada, não por falta de tempo.

Consequência prática: o card mostra faixa entre casas e **nunca** um botão de
apostar, um link para a casa ou o nome de uma casa individual associado a um
número.

---

## Escopo · Odds

### Entra

- Porta de casa de aposta (anticorrupção, como a da NBA)
- Coleta periódica para `odds_snapshot`
- Agregação por mediana para `odds_agregada`
- Fallback para a tabela estática do ruleset
- Curadoria de `mapa_mercados`

### Não entra

Tudo que o ADR-0004 proíbe.

---

## Contrato · Odds

### Porta

```ts
type CotacaoExterna = {
  jogadorNomeNaCasa: string
  nomeMercadoNaCasa: string   // "Player Points", "Pontos do Jogador"...
  linha: number
  oddOver: number | null
  oddUnder: number | null
}

interface CasaDeAposta {
  readonly nome: string
  cotacoes(jogoIdExterno: string): Promise<CotacaoExterna[]>
}
```

Mesmo princípio da porta da NBA: **nenhum campo com nome de casa atravessa**.

### Dois problemas de reconciliação, não um

`mapa_mercados` existe porque cada casa nomeia o mercado à sua maneira. Mas há um
segundo, mais difícil: **o nome do jogador na casa**.

O projeto já resolveu esse problema uma vez, para a lista do CJ — `pontuar()` em
`dominio/texto.ts`, com a mesma régua que a busca da aba de estatísticas usa.
Reaproveitar, com confirmação humana no painel, como o `mapa_jogadores`.

> Regra 3: vínculo errado aqui mostra a odd de um jogador no card de outro. Nunca
> automático sem confirmação.

### Agregação — função pura, no motor

O cálculo da mediana e a decisão de fallback saem inteiramente do ruleset:

```ts
// motor/odds/agregar.ts — puro, sem I/O
function agregar(
  cotacoes: { casa: string; oddOver: number | null }[],
  ruleset: Ruleset,
): { min: number; max: number; mediana: number; qtdCasas: number; origem: OrigemOdds } | null
```

- `qtdCasas >= ruleset.odds.casas_minimas` → agrega
- abaixo disso → `ruleset.odds.tabela_estatica[nivel][linha]`, origem
  `TABELA_ESTATICA`

Vai para o motor porque é regra de estratégia sobre números, e porque o backtest
(spec 07) precisa reproduzi-la sem banco.

### Frescor

Odd envelhece em minutos. `odds_agregada.calculado_em` já existe; o card **precisa**
mostrar o horário, pela mesma regra da aba de estatísticas: número velho
apresentado como atual é pior que número nenhum.

---

## Escopo · Blowout

### Contrato

Função pura no motor:

```ts
// motor/avisos/blowout.ts
function emBlowout(
  jogo: { quartoAtual: number | null; placarCasa: number | null; placarVisitante: number | null },
  ruleset: Ruleset,
): boolean
```

Quarto e diferença saem do ruleset. Trocar 25 para 20 é um diff de YAML.

`aplica_a: TITULARES` e `local: introducao_das_estrategias` dizem que o aviso é
**texto fixo na introdução das estratégias**, avisando que titulares saem em jogo
decidido — não um selo no card de um jogador.

> Como o Fire Live só observa o 1º quarto e o blowout é do 4º, os dois nunca se
> encontram. O aviso é editorial: existe para o assinante entender por que uma
> entrada pode furar no fim do jogo.

---

## Perguntas antes de codar

1. **Quais casas, e com qual contrato?** Não há credencial, base URL nem nome de
   casa em lugar nenhum. Esta spec não sai do papel sem isso.
2. **A odd é do over, do under, ou dos dois?** A tabela estática do ruleset lista
   um par por linha e o schema tem `odd_over` e `odd_under`. Como a estratégia é
   sempre "acima da linha", presumo **over** — mas presumir aqui é inventar regra.
3. **Cadência de coleta.** Odd muda por minuto. Coletar de 5 em 5 minutos para
   todos os jogos do dia é volume relevante e custo de contrato.
4. **O aviso de blowout aparece onde exatamente?** `introducao_das_estrategias`
   não é uma tela que existe hoje.

---

## Pronto quando

**Odds**

- Duas casas cotando o mesmo jogador produzem uma faixa com mediana
- Uma casa só cai para a tabela estática, com origem `TABELA_ESTATICA`
- Trocar `casas_minimas` no ruleset muda o comportamento sem tocar em código
- Nome de mercado desconhecido entra na fila de curadoria, nunca em vínculo automático
- O card mostra faixa e o horário da cotação
- **Nenhuma rota, tabela ou campo de envio de aposta foi criado** — verificável por
  varredura, como o teste de credenciais já faz

**Blowout**

- Jogo no 4º quarto com 25 de diferença aciona o aviso
- 24 de diferença não aciona
- Trocar o limiar no ruleset muda o resultado sem tocar em código

---

# Plano

### Fatia 0 · Contrato comercial

Bloqueante para odds. O blowout **não depende** disto e pode ser feito antes.

### Fatia 1 · Blowout

1. `motor/avisos/blowout.ts` — puro
2. Teste-âncora: 25 aciona, 24 não; trocar o ruleset muda
3. Texto na introdução das estratégias, conforme resposta da pergunta 4

Fatia pequena, isolada, sem dependência externa. É por onde começar.

### Fatia 2 · Agregação pura

1. `motor/odds/agregar.ts`
2. Testes: mediana com 2, 3 e 5 casas; fallback abaixo do mínimo; outlier não
   desloca a mediana
3. `npm run boundaries` continua limpo

Também não depende de contrato: dá para escrever e testar hoje.

### Fatia 3 · Porta e fake

`CasaDeAposta` + adapter fake com cotações de fixture.

### Fatia 4 · Reconciliação

1. Casar mercado com `mapa_mercados`
2. Casar jogador reaproveitando `pontuar()`
3. Tela de curadoria no painel, **com a guarda de admin** — o padrão que faltou em
   `/admin/mapeamento` e que a auditoria corrigiu

### Fatia 5 · Coleta e materialização

1. `sincronizarOdds` → `odds_snapshot`
2. `agregarOdds` → `odds_agregada`, idempotente pela UNIQUE existente
3. Cron na cadência da resposta 3

### Fatia 6 · Card

Ligar `odds_agregada` ao feed. `CardEntrada` já exibe; falta preencher.

---

## Riscos

**Termos de uso das casas.** Coletar odd pública pode esbarrar em restrição
contratual ou técnica. É questão jurídica antes de técnica, e precisa de resposta
antes da fatia 5.

**Odd envelhece mais rápido que o feed.** O feed é cacheado; a odd, não. Mostrar
odd de 10 minutos como atual é o mesmo defeito que a aba de estatísticas existe
para evitar. O horário no card não é enfeite.

**Reconciliação de nome de jogador na casa é a parte cara.** A lista do CJ levou
uma tela de curadoria inteira. Cada casa tem sua grafia, e são pelo menos duas.
Orçar como o `mapa_jogadores`, não como um `if`.
