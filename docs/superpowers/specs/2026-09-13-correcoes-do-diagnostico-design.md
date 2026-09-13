# Correções do diagnóstico de 13/09 — design

**Origem:** [`docs/superpowers/relatorios/2026-09-13-diagnostico-nip.md`](../relatorios/2026-09-13-diagnostico-nip.md).
Cada bug daquele relatório veio com um loop que ficou vermelho; esta spec corrige os que
tocam o produto e a infraestrutura de teste que morde, e deixa para uma spec própria o que é
refatoração de suíte.

**Status:** implementada em 13/09/2026. O código está no repositório; o reparo em produção
(`demo:desempatar` no Neon) é o último passo e depende da publicação.

## 1 · Escopo

Entra:

- **B1** — jogos encerrados empatados na simulação, e a classificação contando o empate como
  derrota do mandante. Em produção: 8 empates em 354 jogos encerrados e 13 dos 30 times com
  V-D errado na tabela que a apresentação mostra.
- **B2** — `/resultados/<data>` com ano abaixo de 1000 responde 500 a usuário logado.
- **T2** — fechar o PGlite com consulta em voo trava o worker de teste a 100% de CPU, sem fim.
- **Infra** — o CI não roda `next build`; o flake "00:00" de `telas-demo` não deixa artefato.

Fica fora, por decisão de 13/09:

- **T1** — os 28 testes em 16 arquivos que dependem da ordem em que foram escritos: spec própria.
- Cabeçalhos de segurança (`X-Content-Type-Options`, `X-Frame-Options`, CSP) e a configuração do
  Mercado Pago em produção: são estados, não bugs, e cada um é decisão à parte.

## 2 · Decisões

| # | Decisão | Por quê |
| --- | --- | --- |
| 1 | O empate é resolvido **no gerador**, sobre as linhas filtradas dos dois lados, com o PRNG semeado | O placar continua sendo a soma do box dos jogadores (invariante que o próprio código protege), a temporada continua reproduzível, e só os jogos empatados mudam |
| 2 | A classificação trata empate como **estado inválido**: não conta vitória nem derrota, e devolve a contagem | Escolher um lado com `>` era mentir na tabela; lançar erro derrubaria o cron das 6h por um dado velho |
| 3 | Produção é reparada por **script pontual e idempotente** (`demo:desempatar`) | Refazer os dias afetados mudaria placares, apitos conferidos e taxa de acerto de jogos que estavam certos; deixar como está manteria 13 linhas erradas na tabela |
| 4 | A regra de desempate é **de simulação, não de estratégia** — vive em `simulacao.ts`, não no ruleset | Regra 1 do `CLAUDE.md` vale para a metodologia; a demo é dado fictício, e o desempate não muda apito nenhum |
| 5 | B2 conserta a **raiz** (o ano sem zeros) e ganha uma guarda, sem regra nova de calendário | `0001-01-01` passa a renderizar uma rodada vazia, como `9999-12-31` já faz; inventar um limite de ano seria regra que ninguém pediu |
| 6 | `fechar()` do arnês **espera as consultas em voo** antes de fechar | Um `select 1` entra na fila do mesmo mutex do PGlite e só volta quando o que estava na frente terminou |
| 7 | O CI ganha `next build` e **sobe o HTML de conferência quando falha** | Build só na Vercel deixa erro de build para o deploy; artefato de falha é o que o flake precisa para ser diagnosticado |

## 3 · B1 — o empate

### 3.1 · Desempate no gerador

`src/modules/ingestao/demo/simulacao.ts` (módulo puro; a fronteira `simulacao-sem-outras-camadas`
continua valendo) ganha:

```ts
export const CESTA_DE_DESEMPATE = 2

export function desempatar<T extends { pontos: number }>(
  casa: readonly T[],
  visitante: readonly T[],
  sorteio: () => number,
): { casa: T[]; visitante: T[]; desempatou: 'casa' | 'visitante' | null }
```

Regra: soma `pontos` de cada lado; se diferem, devolve cópias inalteradas e `desempatou: null`.
Se empatam, `sorteio() < 0.5` escolhe `casa`, senão `visitante`; o lado escolhido precisa ter
linhas (se não tiver, o outro; se nenhum tiver, é jogo sem box — devolve inalterado e `null`).
Na linha de maior `pontos` do lado escolhido (a primeira, em empate), `pontos += CESTA_DE_DESEMPATE`.
Uma cesta basta: só um lado é somado, então o resultado nunca volta a empatar.

A chave do sorteio segue a convenção da temporada e é o que torna o reparo reproduzível:
`` `${semente}|${dia}|${casa}x${visitante}|desempate` `` — `semente` é a da temporada
(`SEMENTE_TEMPORADA = 'ia-nba-demo-2025-26'` quando o script não passa outra), `dia` a data de
referência, `casa`/`visitante` as siglas. Mesma chave, mesma escolha, em qualquer banco.

### 3.2 · O ponto de aplicação

Em `src/modules/ingestao/demo/temporada.ts`, no passo "3 · Jogar", o laço por lado hoje empurra
linhas de inserção direto. Passa a: (1) montar, por lado, a lista das linhas **filtradas**
(`LinhaBox & { jogadorId }`, depois do descarte de jogador sem vínculo e de homônimo — são elas
que `semearPlacares` soma); (2) chamar `desempatar(casa, visitante, criarSorteio(chave))`;
(3) só então mapear para linhas de inserção, com `decomporPontos(l.pontos)` refeito sobre o
valor final — é isso que mantém `2·doisC + 3·tresC + lanceC = pontos` na linha bumpada.

A convenção de chave dos boxes (`` `${semente}|${dia}|${casa}x${visitante}|${sigla}` ``) não
muda: mudar ela reescreveria a temporada inteira.

### 3.3 · A classificação

`semearClassificacao(db, ruleset, dataReferencia)` passa a devolver
`{ linhas: number; empates: number }`. Jogo encerrado com `placar_casa = placar_visitante`
não soma vitória nem derrota para ninguém e incrementa `empates`. Os três chamadores mudam:
`semear.ts` e `temporada.ts` leem `.linhas` (o resumo do dia ganha `empates`), e
`scripts/demo-conferencias.ts` imprime os dois números.

`scripts/demo-conferir.ts` ganha um item de gate: **"0 jogos encerrados empatados"** — vermelho
se houver. É o alarme operacional: qualquer carga futura que produza empate reprova a
conferência antes de a tabela ir para a frente do cliente.

### 3.4 · O reparo em produção

`scripts/demo-desempatar.ts` (`npm run demo:desempatar`):

1. Seleciona os jogos `ENCERRADO` com `placar_casa = placar_visitante`, com data e siglas.
2. Para cada um, carrega as linhas de `estatisticas_jogo` do jogo com o time pelo **vínculo da
   lista do CJ** (`niveis` da versão ativa — o mesmo join de `semearPlacares`, nunca
   `jogadores.time_id`), separa por lado e chama `desempatar` com a chave da §3.1.
3. Na linha escolhida, grava `pontos` e o desdobramento (`decomporPontos`) novos.
4. `semearPlacares(db, idsReparados)` e `semearClassificacao(db, ruleset, hoje)`.
5. Imprime: empates encontrados, jogos reparados, linhas da classificação, empates restantes.

Idempotente: na segunda execução não há empate e nada é escrito. Roda **uma vez** no Neon,
depois do deploy do código, e antes de `demo:conferir`.

## 4 · B2 — data com ano abaixo de 1000

Dois lugares montam ano sem zeros à esquerda:

- `dataDeReferencia` (`src/modules/dominio/rodada.ts`): `${p.year}` vira
  `String(p.year).padStart(4, '0')`.
- `temporadaDe` (`src/modules/dominio/temporada.ts`): `String(anoInicial)` vira
  `String(anoInicial).padStart(4, '0')` nos dois formatos — sem isso, `"0001-01-01"` continuaria
  virando `"0-01"` e a abertura da temporada continuaria `NaN`.

`diasDaTemporada` (`src/app/(app)/resultados/[data]/page.tsx`) ganha a guarda: se `dias` não
for finito, devolve `1`. Defesa em profundidade; com os dois `padStart` ela não dispara.

**Achado da implementação (13/09):** os dois `padStart` fecham o `RangeError`, mas não bastam. A
temporada de `0001-01-01` abre em `0000-10-01`, e **o Postgres não tem ano 0** — a consulta da
taxa morria convertendo o parâmetro (`22008`, `DateTimeParseError`), trocando um 500 por outro.
A mesma guarda de `diasDaTemporada` passa então a cortar a janela na primeira data que o tipo
`date` representa (`0001-01-01`). Não é limite de calendário da liga (regra 3 continua valendo,
`dataValida` não muda): é o alcance do tipo. Datas reais não chegam perto do corte.

Comportamento resultante: `/resultados/0001-01-01` renderiza uma rodada vazia. `dataValida` não
muda.

## 5 · T2 — fechar o PGlite sem travar

`src/modules/dominio/__tests__/ajuda-banco.ts`:

```ts
fechar: async () => {
  // Um `select 1` entra na fila do mesmo mutex que as consultas em voo e só
  // volta quando elas terminaram — fechar antes disso gira o worker sem fim.
  await pg.query('select 1').catch(() => undefined)
  await pg.close()
}
```

Regressão em `src/modules/dominio/__tests__/ajuda-banco.test.ts` (novo): dispara
`pg.query('select pg_sleep(0.3)')` **sem** `await`, chama `await banco.fechar()`, e exige que
resolva dentro do timeout do teste. Sem a correção, o teste estoura o timeout; com ela, resolve
em ~300 ms.

## 6 · Infra

- `.github/workflows/ci.yml`: passo `build` (`npm run build`) depois de `test`. Verificado em
  13/09: o build passa sem `.env.local` — nenhuma variável nova no CI. E um passo
  `actions/upload-artifact@v4` com `if: failure()` subindo `.superpowers/conferencia/`.
- `src/app/__tests__/telas-demo.test.ts`, teste "os horários dos jogos saem no fuso, não no do
  servidor": `onTestFailed` grava o HTML renderizado em `.superpowers/conferencia/flake-00-00.html`
  (criando o diretório se preciso; não depende de `CONFERENCIA=1`). A próxima ocorrência deixa
  artefato no CI.

## 7 · Pronto quando

- Após `simularAte` (7 e 21 dias, PGlite), **nenhum** jogo `ENCERRADO` tem `placar_casa =
  placar_visitante`, e por time `vitorias + derrotas` é igual ao número de jogos encerrados.
- `desempatar` é puro e determinístico pela chave; não toca em jogo sem empate; a soma de
  `pontos` do lado escolhido sobe exatamente `CESTA_DE_DESEMPATE`; a linha bumpada continua
  fechando `2·doisC + 3·tresC + lanceC = pontos` depois de `decomporPontos`.
- `semearClassificacao` devolve `empates: 0` sobre um banco sem empate, e `empates: n` (sem
  vitória nem derrota atribuída) sobre um banco com `n` empates plantados.
- `demo:desempatar` sobre um PGlite com empates plantados: repara todos, recomputa a
  classificação, e a segunda execução não escreve nada.
- `demo:conferir` reprova com empate presente e aprova sem.
- `/resultados/0001-01-01`, `/resultados/0999-12-31` e `/resultados/9999-12-31` autenticados
  renderizam sem lançar; `dataDeReferencia` e `temporadaDe` devolvem ano com quatro dígitos para
  o ano 1.
- O teste de `fechar()` com consulta em voo passa dentro do timeout.
- O CI executa `build` e, em falha, o artefato `conferencia` está disponível.
- Em produção, depois do reparo: 0 empates em `jogos` encerrados e 0 times com V-D divergente
  (a mesma consulta só-leitura do diagnóstico).

## 8 · Ordem de publicação

1. Bateria verde (`typecheck`, `lint`, `boundaries`, `test`, `build`).
2. Commit único, PR, CI verde, merge, deploy pronto.
3. `npx dotenv -e .env.local -- npm run demo:desempatar` — uma vez.
4. `npx dotenv -e .env.local -- npm run demo:conferir` — verde, incluindo o item novo.
5. A consulta só-leitura do diagnóstico no Neon: 0 empates, 0 divergentes.

Nada roda contra o Neon antes do passo 3.

## 9 · Riscos

- **A escolha de lado do reparo difere da que o gerador teria feito?** Não: a chave é a mesma
  e o maior pontuador é computado sobre as mesmas linhas (as inseridas). O teste do script
  planta empates e compara com `desempatar` puro.
- **O bump muda a média de um jogador** em até 2 pontos num jogo; `recalcularMedias` já roda
  por dia e o próximo dia recompõe. Um apito conferido daquele jogo pode virar de "não bateu"
  para "bateu" — é efeito colateral de reparar dado errado, e o gate do `demo:conferir` mostra
  as contagens novas.
- **`pg_sleep` no PGlite**: se a função não existir no WASM, o teste de T2 usa uma consulta
  pesada equivalente (`select count(*) from generate_series(1, 5e6)`).
