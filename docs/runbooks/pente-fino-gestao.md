# Runbook — pente fino da Gestão no navegador

**Data:** 22/09/2026 · implementa a seção 5 da spec
[`2026-09-22-pente-fino-gestao-design.md`](../superpowers/specs/2026-09-22-pente-fino-gestao-design.md).

O que os testes automatizados não fazem é **clicar**. Este roteiro faz, num navegador de
verdade, sobre a temporada simulada de 49 dias — e a cada passo diz o que conferir na tela
**e** no banco. Leva ~30 minutos. Depois dele, `npm run e2e` repete a parte clicável
sozinho (ver o fim).

---

## 0 · Antes de qualquer coisa: onde este banco está

`.env.local` e a produção apontam para o **mesmo Neon**. Semear demonstração nele é seguro
só enquanto ele não tiver dado real — e `demo:temporada` não confere isso sozinho. Duas
conferências, nesta ordem: a primeira olha o **dado**, a segunda a configuração.

**1. O banco já tem dado real?** No SQL Editor do console do Neon (ou no Drizzle Studio, §2):

    SELECT count(*) FROM checkpoints_ingestao;

Só o backfill da temporada real (`scripts/backfill-ingestao.ts`, runbook
[`temporada-retroativa.md`](temporada-retroativa.md)) escreve nessa tabela.

- `0` → siga para a conferência 2.
- **Maior que zero → pare.** O Neon tem dado real, e semear demonstração por cima o
  mistura com ficção. Esta é a conferência que vale: desligar a ingestão (apagar as
  variáveis, como manda o "Como desligar" da retroativa) não apaga o que já foi gravado.

**2. A ingestão real está configurada?**

    vercel env ls production

Leia a lista **inteira**, sem filtrar: se o CLI não estiver vinculado ao projeto, um
`grep` vazio pareceria "tudo certo". `vercel env ls` mostra só o **nome** de cada
variável, nunca o valor.

- Nem `NBA_INGESTAO_HABILITADA` nem `BALLDONTLIE_API_KEY` aparecem → siga.
- Alguma das duas aparece → **pare**: a ingestão real pode rodar a qualquer momento.
- `DEMO_AUTOSSEMEADURA`: **não mexa.** É o interruptor do parceiro; este roteiro não
  depende dela.

**Parou?** Crie um branch no console do Neon (Branches → Create branch, a partir de
`main`), copie a connection string do branch para `DATABASE_URL` no `.env.local`, e
recomece deste passo — agora contra o branch.

## 1 · Dado: a temporada com muitas partidas

    df -h / /System/Volumes/Data          # abaixo de 3 GB livres, limpe antes
    npx dotenv -e .env.local -- npm run demo:temporada
    npx dotenv -e .env.local -- npm run demo:conferir

`demo:temporada` termina em `✓ Temporada pronta até hoje.` Se disser
`! Faltam N dia(s) da janela`, rode de novo até a primeira frase. `demo:conferir` termina
em `✓ Demonstração pronta para apresentar.` Ordem de grandeza: ~49 dias, ~315 jogos,
~4.600 linhas de box (medido em 22/09: 315 · 4.629).

## 2 · Subir

    npm run dev

Abra `http://localhost:3000/entrar` e entre com a **sua** conta. Deixe uma segunda aba em
`npm run db:studio` (Drizzle Studio) na tabela `entradas_realizadas`, filtrada pelo seu
`usuario_id`. **O Studio edita o que mostra:** contra o Neon de produção, só leia — não
clique dentro das células.

## 3 · O diagnóstico — antes de qualquer cortesia

Se a sua conta ainda não tem direito (é o caso do ADMIN recém-criado pelo bootstrap):
aceite a metodologia se for a primeira vez e abra `/gestao`.

- [ ] A tela mostra 4 blocos borrados, um cadeado e "Registrar entradas começa no MVP".
      **Clicar nos blocos não faz nada — é o esperado:** é a silhueta de quem não tem
      direito, inerte por CSS. T: sem campos. B: nada.

Se a sua conta **já** tem cortesia, pule: o teste automatizado `gestao-acesso-real`
percorre este passo com uma conta ADMIN sem direito.

## 4 · Conta: a sua, como assinante

    CORTESIA_EMAIL=<seu e-mail> CORTESIA_ATE=2026-12-31 \
      npx dotenv -e .env.local -- npm run cortesia

Saída esperada: `Cortesia ativa para … até 2026-12-31 · direito <uuid>`. Se disser
`usuário … não existe — crie a conta antes`, crie pela tela (`/cadastrar`) e rode de novo.

- [ ] Recarregue `/gestao`: chips R$ 200/500/1.000/5.000, "Outro valor", os 4 números, os
      cards agrupados por time, cada um com unidades/odd/Registrei.

Para o teste de dois usuários (§5, Realizadas) e para o `npm run e2e` (§6), uma segunda
conta — o comando cria **e** já concede a cortesia:

    CONTA_TESTE_EMAIL=segunda@nip.test CONTA_TESTE_SENHA='<12+ caracteres, letra e número>' \
      npx dotenv -e .env.local -- npm run conta:teste

## 5 · Roteiro — marque cada linha

Legenda: **T** = o que a tela mostra · **B** = o que o banco mostra (Drizzle Studio, F5).

A unidade da aba é o **card**: um por jogador e atributo, com a linha de maior confiança,
como na Lista Secreta. Cada card tem **um** "Registrei", na linha que ele mostra.

### Banca
- [ ] Clicar **R$ 500** → URL `?banca=500`; chip destacado; "1 unidade" = R$ 5,00; teto,
      stop win e stop loss mudam. Os valores dos cards mudam junto.
- [ ] Digitar **750** em "Outro valor" → **Aplicar** → URL `?banca=750`; "1 unidade" = R$ 7,50.
- [ ] Digitar **-5** → Aplicar → o navegador barra (`min=1`). Editar a URL para
      `?banca=abc` → volta a R$ 1.000, sem "NaN" em lugar nenhum.

### Registrar
- [ ] No primeiro card: unidades **1,5**, odd **1,62**, **Registrei** → a URL vira
      `?ver=realizadas`; a entrada aparece: "PTS N+ · 1.5 unidades · odd 1.62" e a hora.
      B: 1 linha, `unidades 1.50`, `odd 1.62`, `data_referencia` = hoje.
- [ ] Voltar a **Sugeridas**, **mesmo card**: unidades **3**, odd **2,10**, Registrei →
      Realizadas mostra "3 unidades · odd 2.10" — **uma entrada só**. B: **ainda 1 linha**,
      valores novos, `registrada_em` avançou.
- [ ] Outro card, odd **em branco** → Realizadas mostra "odd —". B: `odd` nulo.
- [ ] Odd **0,5** → o navegador barra (`min=1.01`). Para testar o servidor: F12 → Console
      → `document.querySelector('input[name=odd]').form.noValidate = true` → preencher 0,5
      no **primeiro** card → Registrei → URL `?erro=entrada-invalida` e "Confira unidades e
      odd." no topo. B: **nenhuma linha nova**.
- [ ] **JavaScript desligado** (Chrome: F12 → ⋮ → Settings → Debugger → Disable JavaScript;
      recarregar): repetir o **Aplicar** e um **Registrei**. Os dois funcionam igual — a
      tela promete isso e este é o único lugar que confere. (O **login** precisa de
      JavaScript: desligue só depois de entrar.)
- [ ] **Observar (achado 1 da spec §9):** abra o detalhe de um jogador com várias linhas
      (clique no nome). As linhas que o card não mostra **não têm** "Registrei" em lugar
      nenhum. Se você entraria numa delas na vida real, anote — é matéria de decisão.

### Realizadas
- [ ] Registrar em 3 **jogadores** diferentes com um minuto entre eles → o mais recente
      aparece **primeiro**.
- [ ] Na segunda conta (outra janela anônima): registrar **7,5 unidades**. Na sua conta,
      Realizadas **não** mostra "7.5 unidades". B: `usuario_id` diferentes.
- [ ] Rodapé: "Somente leitura: a NIP não envia aposta…" presente.

### Sessão
- [ ] Noutra aba, `/conta` → **Sair**; voltar à aba da Gestão (ainda renderizada) e clicar
      Registrei → cai em `/entrar?destino=/gestao`, sem gravar. B: nenhuma linha nova.

## 6 · Depois

Cada item que **não** se comportou como descrito é um achado: anote tela, ação, esperado,
observado, e o estado do banco. Achado é matéria de spec nova, não de correção inline.

Com o app ainda no ar, a parte clicável repete sozinha — **com a segunda conta**:

    E2E_EMAIL=segunda@nip.test E2E_SENHA='<a senha dela>' npm run e2e

Por que ela e não a sua: o E2E **escreve** (registra e atualiza entradas de hoje), e cada
execução entra de um navegador novo, o que conta como aparelho novo — com o limite de dois
aparelhos por conta, a sessão mais antiga dela cai. Na sua conta (ou na do ADMIN), seria a
sua sessão que cairia.

A segunda conta fica no banco com cortesia ALL_STAR **sem expiração** — é o que
`conta:teste` concede, e não há comando pronto para revogá-la (`npm run cortesia` grava
com outra referência e criaria um segundo direito, sem encerrar o primeiro). Anote que ela
existe.

Para desfazer a demo: `npx dotenv -e .env.local -- npm run demo:limpar -- --confirmar`.
Ele apaga **todo o domínio** — jogos, jogadores, estatísticas, apitos — não só o que a demo
criou. Só em branch do Neon, ou num banco que **nunca** recebeu a temporada retroativa
(conferência 1 do §0 dando `0`): depois dela, apagaria o dado real junto. Contas e
cortesias ficam.
