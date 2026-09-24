# Comparação visual do front v2 — como rodar

`e2e/front-v2.spec.ts` varre as rotas de `referencias/nip-front-v2-prints/indice.json` no front
integrado, tira print em 1440×900 (desktop) e 390×844 @2x (celular) e monta
`comparacao.html` lado a lado com a referência do cliente. Fora do CI, como o resto de `e2e/`.

**Sem Postgres local** (ver `.superpowers/sdd/2026-09-23-front-v2-integracao/contexto-comum.md`):
este spec só faz sentido contra um ambiente com banco de verdade — um **preview do Vercel com uma
branch do Neon**. Nunca aponte para produção.

## 1. Preparar o preview

1. Crie uma branch do Neon a partir de produção (painel do Neon, ou `vercel env` + integração
   Neon do projeto) — isolada, pode ser apagada depois.
2. **Migre ANTES de implantar.** Regra geral do projeto (`docs/superpowers/specs/2026-09-23-prontidao-lancamento-2k-design.md`
   §6/§8): o `build` do Vercel não roda migração, e código novo pode ler coluna que só existe
   depois do `db:migrate`. Rode, apontando para a branch do Neon (nunca produção):
   ```
   DATABASE_URL=<url da branch>            npm run db:migrate
   ```
3. Publique o preview (`vercel:deploy` — preview, não `--prod`) com `DATABASE_URL` /
   `DATABASE_URL_UNPOOLED` do preview apontando para essa branch.

## 1.1 Variáveis do preview (além do banco)

O preview compila com qualquer coisa, mas fica **mudo** sem estas três — nenhuma delas
aparece na varredura visual (§2), só nos fluxos manuais (§4 e §5):

| Env | Para quê | Sem ela |
| --- | --- | --- |
| `CRON_COMPLETO=true` | libera os 7 crons (exige plano **Pro**; ver [ADR-0003](../docs/adr/0003-runtime-vercel.md)) — inclui o cron `ao-vivo` (a cada minuto), que é o gatilho real do push de Fire Live/green | só os 2 crons diários rodam; o push do §5 nunca dispara fora da publicação diária da Lista |
| `VAPID_SUBJECT` | o `mailto:` real do responsável pelo push (junto com `NEXT_PUBLIC_VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` — já existem no `.env.local`, ver [`openrouter-e-push.md`](../docs/runbooks/openrouter-e-push.md)) | a Apple recusa a inscrição (o `sub` de teste `mailto:push@example.com` só serve para os testes automatizados) |
| `ALERTA_WEBHOOK_URL` | webhook genérico (Slack/Discord/Zapier) para onde o preview avisa falha operacional durante a janela de teste | fica no log do Vercel — só percebe erro quem for procurar |

Adicione **junto** `PUSH_INTERNAL_ALLOWLIST=<seu e-mail>,<e-mail do CJ>` (não ligue
`PUSH_ENABLED=true` num preview de teste — isso abriria push pra qualquer assinante com
direito ativo na branch do Neon, não só pra vocês).

**A janela do deploy:** o `ao-vivo` só publica Fire Live/green durante o **1º quarto de um
jogo de verdade** (armadilha conhecida do projeto — Fire Live não existe fora disso). Isso
faz o teste de push do §5 diferente do teste de telas do §2/§4: a varredura visual e a
Gestão podem rodar a qualquer hora contra o preview parado num dia qualquer da temporada
simulada, mas o push ao vivo só dispara de verdade se o preview estiver publicado **durante**
um jogo — agende o §5 para essa janela, não para qualquer hora do dia. Fora dela, `CRON_COMPLETO`
continua rodando (o cron dispara a cada minuto), só não tem Fire Live pra publicar.

## 2. Rodar a varredura

```
E2E_BASE_URL=https://<preview>.vercel.app \
E2E_EMAIL=<conta de teste com cortesia> \
E2E_SENHA=<senha dessa conta> \
npx playwright test e2e/front-v2.spec.ts --project front-v2
```

- `E2E_EMAIL`/`E2E_SENHA` são opcionais: sem eles a varredura roda **anônima** (a maioria das
  rotas redireciona para `/entrar` — o `indice.json` gerado registra isso como `status`/`urlFinal`,
  não é erro do spec).
- `E2E_SAIDA` muda onde os prints e o `indice.json`/`comparacao.html` são escritos (padrão:
  `.superpowers/sdd/2026-09-23-front-v2-integracao/prints-integrado/`). Os prints **não vão para o
  git** — se for rodar contra o preview de verdade, considere um `E2E_SAIDA` fora do repo.
- Antes de rodar, confira disco: `df -h /System/Volumes/Data` (< 5 GB livre, não rode).
- `E2E_EMBUTIR=true` troca os `<img>` de `comparacao.html` (por padrão, link relativo pros
  `.jpg` ao lado do HTML) por `data:` URI em base64 — só vale a pena se for copiar o HTML
  pra outro lugar sem levar as pastas `desktop/`/`celular/` junto (ex.: anexar num e-mail);
  fica bem mais pesado.

## 3. Ler o resultado

Abra `<saida>/comparacao.html` no navegador — referência × integrado, desktop e celular, uma
seção por rota, com o status/URL final de cada lado. **A comparação é humana**: o dado por trás
de cada print é outro (a base local do preview × a base do cliente), então diferença de layout
que o dado não explique é o que volta para a tarefa da área que fez aquela tela; diferença que o
dado explica (outro jogador, outro placar, outra data) não é bug.

## 4. Gestão e login (`gestao.spec.ts`, `entrar.setup.ts`)

Mesma ideia, mas exercitando fluxos reais (registrar entrada, mudar banca, login) em vez de só
olhar telas — por isso PRECISA de banco de verdade (preview + branch do Neon acima), nunca só
`next dev` sem `DATABASE_URL` alcançável:

```
E2E_BASE_URL=https://<preview>.vercel.app \
E2E_EMAIL=<conta de teste com cortesia> \
E2E_SENHA=<senha dessa conta> \
npx playwright test --project setup --project gestao
```

Os seletores já foram reapontados para o front v2 (Task 13) mas **não foram executados** nesta
tarefa — sem Postgres local não há como rodar contra dado de verdade. Rode uma vez contra o
preview antes de confiar neles.

## 5. PWA e push no celular (manual)

Com as variáveis da §1.1 configuradas e o preview no ar (HTTPS — push e "instalar app" pedem
contexto seguro), **dentro da janela do jogo** descrita na §1.1 se o teste for o push AO VIVO
(o push da publicação diária da Lista não depende de janela):

1. Abra o preview no celular, adicione à tela de início (PWA instalável).
2. Ative alertas em Conta (`AtivarAlertas`) e aceite a permissão de notificação do navegador.
3. Dispare um push de teste pelo runbook de push já existente do projeto (painel admin ou script
   de push, conforme o runbook de pente-fino da Gestão / prontidão de lançamento).
4. Confirme: notificação chega com o app fechado, abre na rota certa ao tocar, e o ícone/nome do
   PWA batem com a marca.

Nunca contra produção.
