# Correções de lógica — o que a auditoria da Identidade 05 encontrou

**Data:** 19/09/2026 · **Status:** spec escrita a partir da auditoria de 19/09 (código lido,
fluxos conferidos no código, consequência de cada um verificada por teste temporário ou
por leitura da chamada); **aguardando a leitura do parceiro**.
**Corrige:** [`Identidade 05 · Manual da Marca`](2026-09-18-identidade-05-manual-da-marca-design.md),
mesclada na `main` em 19/09 (`950be66`).
**Irmã:** [`Correções de UX no desktop`](2026-09-19-correcoes-ux-desktop-identidade-05-design.md)
— tela, interação e hierarquia visual moram lá; aqui é o que mostra dado errado, ignora
uma configuração, ou deixa o cache mentir.

---

## 1 · Objetivo em uma frase

Fechar os cinco defeitos de funcionamento que a auditoria encontrou — dois números que
mentem, uma regra de ambiente ignorada, um cache que a demo não invalida, e um caminho de
cache que nunca rodou contra o Next de verdade — sem tocar no motor nem no ruleset.

## 2 · Problema

A Identidade 05 acrescentou uma leitura nova (`lerLateral`) com cache de uma hora e tag
própria, um contador de entradas no cabeçalho da Lista, um bloco de classificação com
aproveitamento em porcentagem, e uma doca do assistente na lateral. Cada um deles foi
testado no que faz; nenhum foi testado no que **combina** com o que já existia:

- O contador do cabeçalho conta as entradas **publicadas**; os filtros contam as
  **visíveis**. Com filtro, os dois números divergem na mesma tela.
- A lateral escreve o aproveitamento como "89 %"; a tabela cheia de Estatísticas escreve
  "89,0 %". A mesma equipe, dois formatos, a 300 px de distância.
- A doca do assistente aparece para todo assinante com lateral, mas o chat só existe
  quando `CHAT_HABILITADO=true` E há cota configurada. Sem isso, a doca envia para um
  `/chat` que responde 404 — e o botão flutuante, que já respeita a regra, some.
- A demo (`/api/cron/demo`) avança a temporada simulada sem invalidar `TAG_LATERAL`; a
  lateral mostra a rodada de até uma hora atrás enquanto a Lista já mostra a nova.
- `unstable_cache` e `revalidateTag(tag, 'max')` são mockados em todos os testes. Nada no
  repositório prova que a assinatura `'max'` existe nesta versão do Next em runtime nem
  que a tag invalida a leitura. É a única coisa da passada que só a preview confirma.

Nenhum dos cinco é regra de estratégia. Nenhum toca `src/modules/motor`. Nenhum exige
decisão do cliente — as respostas de 18/08 não são afetadas.

## 3 · Princípios

1. **Um número, uma função.** Todo aproveitamento que aparece na tela sai de
   `formatarAproveitamento` em `src/components/formato.ts`. Quem quiser outro formato
   muda a função, não o call-site.
2. **A regra de ambiente mora em um lugar.** `configuracaoChat().habilitado` já decide se
   o chat existe. A doca pergunta a ela, como o botão flutuante já pergunta.
3. **Quem escreve o que a lateral lê, invalida a lateral.** Toda rota que altera
   `jogos`, `boxscores` ou `classificacao` chama `revalidateTag(TAG_LATERAL, 'max')`.
   Hoje são duas: a sincronização e a demo.
4. **O que o teste não pode provar, o plano manda conferir na preview** — com passo
   escrito, resultado esperado e o que fazer se falhar.

## 4 · As correções

### 4.1 · O contador do cabeçalho ignora os filtros

**Erro.** `CabecalhoTela` recebe `contador={{ numero: entradasPublicadas.length }}`.
`entradasPublicadas` é o total do dia; `cartoes` (o que a página rende) já passou por
`recortesAtivos(estado)`.
**Como aparece.** Lista com 12 entradas. Filtrar por método OPD: sobram 3 cards, o
cabeçalho segue dizendo "12 ENTRADAS".
**Correção.** Com filtro ativo, o contador vira "3 de 12 entradas"; sem filtro, "12
entradas" como hoje. `CabecalhoTela.contador` ganha `total?: number`; quando presente e
diferente de `numero`, o rótulo é `"${numero} de ${total} ${rotulo}"`.
**Aceite.** `telas-05-lista`: com `?metodo=opd` na URL o cabeçalho tem "de"; sem filtro
não tem. O teste unitário do `CabecalhoTela` cobre as duas formas.

### 4.2 · Aproveitamento com dois formatos

**Erro.** `ClassificacaoCompacta` escreve `Math.round(v * 100)` → "89". A tabela cheia
usa `aproveitamentoEscrito(v) = (v*100).toFixed(1).replace('.', ',')` → "89,0".
**Como aparece.** Estatísticas a 1440 com lateral: "BOS 89 %" na lateral, "BOS 89,0 %" na
tabela ao lado.
**Correção.** `src/components/formato.ts` exporta `formatarAproveitamento(v: number):
string` com uma casa e vírgula. Os dois lugares importam dela. O formato vencedor é o da
tabela cheia (uma casa), porque distingue 66,7 de 66,3 na briga por play-in — a lateral
vai mostrar "89,0" com Bebas, que é tabular e não alarga.
**Aceite.** Teste da função (0 → "0,0"; 0,8889 → "88,9"; 1 → "100,0"); teste da lateral
esperando "88,9"; `aproveitamentoEscrito` local some de Estatísticas.

### 4.3 · A doca do assistente ignora `CHAT_HABILITADO`

**Erro.** `Lateral.tsx` rende `DocaDoAssistente` quando `!gratis && assistente`;
`assistente` vem de `lateralPadrao({ assistente: true })` em toda tela de aba. A regra
`configuracaoChat().habilitado` (env + cota) não é consultada.
**Como aparece.** Ambiente sem `CHAT_HABILITADO=true`: assinante MVP a 1440 vê a doca,
digita, aperta Enter, cai em `/chat?q=…` que devolve 404. O botão flutuante — que
respeita a regra — não aparece; a doca aparece.
**Correção.** `lateralPadrao` só passa `assistente: true` quando
`configuracaoChat().habilitado`. A regra fica no `montar.tsx` (camada de leitura), não no
componente, que segue puro.
**Aceite.** `lateral.test`: com `CHAT_HABILITADO` ausente, `lateralPadrao({ assistente:
true, gratis: false })` rende sem "Pergunte ao assistente"; com `vi.stubEnv('CHAT_HABILITADO',
'true')` e cota, rende com.

### 4.4 · A demo não invalida a lateral

**Erro.** `/api/cron/demo` chama `simularAte` (escreve jogos, boxscores, classificação) e
não chama `revalidateTag(TAG_LATERAL, 'max')`; a sincronização real chama.
**Como aparece.** Em ambiente com `DEMO_AUTOSSEMEADURA`: o cron da demo avança a rodada;
a Lista (que lê direto) mostra a rodada nova; a lateral mostra "Última noite" da rodada
anterior por até uma hora.
**Correção.** A demo chama `revalidateTag(TAG_LATERAL, 'max')` depois de `simularAte`,
igual à sincronização. Um teste de fonte garante que **toda** rota sob `src/app/api/cron`
que importa `simularAte` ou `sincronizarRodada` também importa `TAG_LATERAL` — para a
próxima rota não esquecer.
**Aceite.** Teste de fonte verde; o teste existente da demo (mock de `next/cache`)
registra a chamada.

### 4.5 · O cache da lateral nunca rodou contra o Next real

**Erro.** Todos os testes que tocam `lerLateralCacheada` fazem `vi.mock('next/cache')`.
A assinatura `revalidateTag(tag, 'max')` foi lida em `node_modules/next/dist/docs` e é a
documentada; mas nada no repositório executa `unstable_cache` de verdade. Se a versão
instalada divergir da documentação, a lateral ou não cacheia (custo) ou não invalida
(dado velho) — e o teste passa.
**Correção.** Duas partes. (a) Um teste de fonte fixa a **forma**: `leitura.ts` chama
`unstable_cache` com `tags: [TAG_LATERAL]` e `revalidate: 3600`; toda chamada de
`revalidateTag` no repositório passa `'max'` como segundo argumento. (b) Uma **medição
contra o runtime real**, feita em 19/09 com uma sonda descartável (rota própria, tag
própria, contador em memória, zero banco), `next build` + `next start`.

**O que a medição achou — e corrige esta spec.** O texto anterior desta seção dizia que
*sem* o perfil a invalidação seria *stale-while-revalidate*. É o oposto. A doc da 16.3.1
(`03-api-reference/04-functions/revalidateTag.md`) e a sonda concordam:

| forma | comportamento |
| --- | --- |
| `revalidateTag(tag, 'max')` | marca como obsoleto: a **primeira** leitura seguinte ainda serve o valor velho e busca o novo em segundo plano |
| `revalidateTag(tag)` | expira na hora, próxima leitura é *cache miss* bloqueante — porém **deprecada** ("may be removed in a future version") |
| `updateTag(tag)` | expira na hora, mas **só** pode ser chamada de Server Action: "It cannot be used in Route Handlers" |

Os crons são Route Handlers, e a própria doc manda usar `revalidateTag` neles. Então
`'max'` é a única forma não deprecada disponível, e o código já estava certo — o que
estava errado era a justificativa escrita.

Sonda (o número é quantas vezes a função cacheada executou): três leituras seguidas → `1`,
`1`, `1` (o cache serve); invalidar com `'max'`; leitura seguinte → `1` (**velho**, com a
função rodando em segundo plano); leituras depois → `2`, `2`, `2` (novo).

**Consequência aceita.** Depois do cron, o primeiro visitante da lateral ainda vê a noite
anterior; do segundo em diante, a nova. Não é instantâneo, mas é o que existe para um
Route Handler nesta versão — e substitui até uma hora inteira de defasagem.
**Aceite.** Teste de fonte verde; medição feita e anotada no commit. Falta a ponta a
ponta com o cron da demo, que escreve no Neon que **produção também lê** — decisão do
parceiro, não deste plano.

## 5 · Arquitetura

```
src/components/formato.ts                   + formatarAproveitamento
src/components/navegacao/CabecalhoTela.tsx  contador.total?
src/components/lateral/ClassificacaoCompacta.tsx   usa formatarAproveitamento
src/app/(app)/estatisticas/page.tsx         usa formatarAproveitamento (some a local)
src/app/(app)/page.tsx                      contador { numero: cartoes.length, total: entradasPublicadas.length }
src/app/(app)/lateral/montar.tsx            assistente && configuracaoChat().habilitado
src/app/api/cron/demo/route.ts              + revalidateTag(TAG_LATERAL, 'max')
src/app/api/cron/__tests__/invalidacao-lateral.test.ts   fonte: quem escreve, invalida
src/app/(app)/lateral/__tests__/cache-forma.test.ts      fonte: tags, revalidate, 'max'
```

O motor não muda. O ruleset não muda. Nenhuma tabela, rota ou campo novo.

## 6 · Verificação

- Bateria: `npm run typecheck && npm run lint && npm run boundaries && npm test`.
- Testes novos: `formato.test.ts`; `CabecalhoTela` com `total`; `telas-05-lista` com
  filtro na URL; `lateral.test` com e sem `CHAT_HABILITADO`; os dois testes de fonte.
- **Roteiro de preview** (4.5), executado uma vez antes do commit, resultado anotado.

## 7 · Fora de escopo

- Reescrever a leitura da lateral para não usar `unstable_cache` (a decisão da Identidade
  05 fica).
- Mudar o formato da tabela cheia de Estatísticas para inteiro (a lateral é que se adapta).
- Qualquer coisa da spec irmã.

## 8 · Ordem

1. Formatador (4.2) — não depende de nada.
2. Contador (4.1).
3. Doca gated (4.3).
4. Demo invalida (4.4) e teste de fonte.
5. Forma do cache (4.5), roteiro de preview.
6. Bateria, commit único.

## 9 · Riscos

- **`formatarAproveitamento` muda o texto da lateral** de "89" para "89,0". Os testes da
  Identidade 05 que esperam o inteiro precisam ser atualizados — o plano lista quais.
- **Gatear a doca em `montar.tsx`** lê `ambiente` numa função que hoje é síncrona e sem
  I/O; `configuracaoChat()` também é síncrona e só lê env. Não muda a pureza de nada.
- **O roteiro de preview depende de `CRON_SECRET`** do ambiente de preview e de
  `DEMO_AUTOSSEMEADURA` ligado ali. Se a preview não tiver os dois, o roteiro roda no
  local com `next start` e Postgres local — o plano descreve os dois caminhos.
