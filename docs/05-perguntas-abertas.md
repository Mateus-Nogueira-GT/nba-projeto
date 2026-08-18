# Perguntas do cliente — RESPONDIDAS

Enviadas 18/08/2026 · respondidas 18/08/2026.
`config/ruleset.v1.yaml` passou de `provisorio` para **`homologado`**.

---

## Respostas

| #   | Pergunta                    | Resposta                                                 | Campo no ruleset                               |
| --- | --------------------------- | -------------------------------------------------------- | ---------------------------------------------- |
| P1  | Qual média?                 | **Temporada inteira, móvel** (recalcula a cada jogo)     | `media.janela: temporada`, `media.modo: movel` |
| P2  | DNP quebra a sequência?     | **Não quebra — o jogo não disputado é ignorado**         | `oscilacao.dnp: ignora` ⚠️                     |
| P3  | "Abaixo da média" = ?       | **Abaixo do limiar** (média − delta)                     | `oscilacao.criterio_sequencia: limiar`         |
| P4  | Modo Fire: 70 ou 75%?       | **75%**                                                  | `modo_fire.percentual_media: 0.75` ⚠️          |
| P5  | "MVP não está em quadra"    | **Fora da partida** (DNP)                                | `presenca_topo.criterio: dnp`                  |
| P6  | Times sem MVP               | **Vale a mesma regra olhando o nº 1 da hierarquia**      | `bloco_topo.sem_mvp: jogador_1` ⚠️             |
| P7  | Philadelphia com 2 MVPs     | **Proposital — os dois precisam estar fora**             | `bloco_topo.com_mvp: todos_os_mvps`            |
| P8  | Bônus do Randola            | **Randola nunca ganha bônus de nível, em nenhum método** | `bonus.RANDOLA: {2: 0, 3: 0}`                  |
| P9  | MVP nível 3: verde ou azul? | **Azul (turbo) E ganha os +4%**                          | `oscilacao.turbo.acumula_bonus: true`          |
| P10 | Qual lista é canônica?      | **A última do documento** (`Introdução I.A da NBA.md`)   | ver abaixo                                     |
| P11 | Green do MVP começa em 25   | **Sim — a odd de 20 é baixa demais pra notificar**       | `push.marcos_green.MVP`                        |
| P12 | O % é probabilidade?        | **Nota de confiança**                                    | seção renomeada para `confianca`               |

⚠️ = contrariou o default provisório. Foram três: P2, P4 e P6.

---

## Consequências que as respostas geraram

### 1 · P5 = DNP eliminou uma tabela inteira

`presenca_quadra` **saiu do modelo de dados**. Não é preciso rastrear cada substituição em
tempo real — basta saber quem não joga a partida, dado que já vem da escalação. Foi a
resposta mais barata das doze.

### 2 · P6 + P7 se unificam numa regra só (ADR-0006)

Verifiquei a lista: **em todos os 15 times que têm MVP, o MVP é o jogador nº 1.**
A única anomalia é Philadelphia, com MVP no nº 1 e no nº 2 — e a resposta de P7 diz que os
dois precisam estar fora.

Então as duas respostas colapsam num conceito único, o **bloco de topo**:

```
bloco_topo = conjunto que precisa estar TODO fora para liberar Suporte/Randola
   time com MVP  → todos os jogadores nível MVP
   time sem MVP  → o jogador nº 1 da hierarquia
```

Uma regra em vez de dois casos especiais. Exceções seguem: Utah, Detroit e Denver ignoram
o bloqueio.

### 3 · P2 = `ignora` cria um caso de borda que vale monitorar

Com `janela: temporada` + `modo: movel` + `dnp: ignora`, a sequência de oscilação
**atravessa lesões longas**:

> Jogador faz 1 jogo abaixo do limiar → lesiona → volta 3 semanas depois → ainda carrega
> oscilação nível 1 ativa, e o jogo do retorno pode fechar o nível 2.

Isso pode ser exatamente o que o CJ quer (a tendência de regressão à média não expira),
ou pode gerar apito velho. **Não estou reabrindo a pergunta** — a resposta foi clara. Mas
é o primeiro candidato a ajuste depois dos dados reais, e o ruleset já permite adicionar
um teto de janela sem tocar em código.

### 4 · P10 revelou que a lista é documento vivo

O cliente informou que **Schröder foi dispensado e está sem time**, e que a lista foi
atualizada durante a elaboração. Confirma duas decisões:

- `niveis_versao` versionado estava certo — a lista muda com o mercado, não só por temporada
- o import precisa ser **reexecutável**, e o admin precisa tratar "jogador saiu da liga"

O arquivo canônico é **`Introdução I.A da NBA.md`** (Cleveland com 7, sem Schröder).

### 5 · P12 validou o design system

"Nota de confiança" confirma o tratamento de `04-design-system.md`. A seção do ruleset foi
renomeada de `probabilidades` para `confianca`, para que o nome errado não sobreviva no
código.

---

## Uma confirmação de uma linha ainda pendente

**P8** — a resposta foi _"randola não ganha % nos níveis, não vale na OPD e na oscilação"_.

Interpretei como: **o bônus de nível não se aplica ao Randola em nenhum dos dois métodos**,
então o Randola usa sempre a tabela base (5 pts = 85%, 10 pts = 80%), qualquer que seja o
nível do apito. Foi assim que ficou no ruleset.

A leitura alternativa seria "Randola não participa de OPD nem de oscilação", mas isso
contraria o documento (que coloca o Randola na hierarquia da OPD e diz que ele apita a
partir do nível 2 na oscilação). Por isso adotei a primeira.

**Não bloqueia nada** — é um valor no ruleset. Vale confirmar numa frase quando houver
oportunidade.

---

## Surgiu na implementação: combinação de métodos

O documento trata oscilação e OPD como métodos paralelos, e a única regra sobre os dois
juntos é o **turbo da OPD** (OPD nível 3 + oscilação nível 2). Ou seja: o próprio CJ
prevê que os dois apitem o mesmo jogador ao mesmo tempo.

O que ele **não** diz é qual nível prevalece nesse caso — e a chave de deduplicação
`(jogo, jogador, atributo, estratégia, linha)` não inclui o método, então o par não pode
virar dois apitos separados sem colidir.

**Decidi assim, e é revisável:** um único apito de Lista Secreta por jogador/atributo/linha,
com `nivelApito = max(OPD, oscilação)`, `metodo = OPD` quando a OPD disparou, e turbo
ligado se qualquer uma das duas regras de turbo se satisfizer. O nível de origem da OPD
fica registrado à parte, porque o Fire Live precisa dele para o cruzamento.

Alternativa, se o CJ preferir: incluir `metodo` na chave e emitir dois apitos, deixando o
usuário ver os dois motivos separados. Custa uma linha no ruleset e uma migration.

**Pergunta de uma frase para a próxima conversa:** *quando o mesmo jogador apita por
oscilação e por OPD ao mesmo tempo, ele aparece uma vez ou duas na lista?*

---

## Fora das 12 — escopo novo, ainda não contratado

Apareceu nos documentos e **não está na proposta comercial**:

- Integração com casas de apostas (contrato e prazo)
- Aba **Gestão** (banca, stake, perfis de risco — referência: StatsHub)
- Aba **teórica** (explicação da metodologia para usuário leigo)
- **Construtor de aposta** ("Divisão": simples/múltipla, combinações de atributos)
- Seletor de linha de pontos por jogador
- Filtro granular de notificação
- Aviso de blowout
- **Rebotes e assistências como atributos completos** — a proposta e o protótipo tratam
  praticamente só pontos

### Já incluído no v0 por decisão de 18/08/2026

**Aba de estatísticas no estilo Sofascore** — jogos do dia, classificação e vitórias por
time, médias, quebra por quarto e histórico. Expande a tela de estatísticas da p.5 da
proposta, que era centrada no jogador, para navegação de liga inteira.

Consequência no modelo de dados: exige estatística **por time**, não só por jogador —
ver `03-modelo-dados.md` (`estatisticas_time_jogo`, `classificacao`).

E duas mudanças em documento já aprovado, que precisam ser comunicadas:

| O quê                                                                  | Onde                                    |
| ---------------------------------------------------------------------- | --------------------------------------- |
| App **passa** a se conectar a casas de apostas (leitura de odds)       | p.2, caixa vermelha "REGRA FUNDAMENTAL" |
| Escala de confiança de 5 faixas **removida**, fundida no anel de apito | p.4                                     |
