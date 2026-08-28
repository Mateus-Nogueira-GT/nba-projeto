# Runbook — ligar a LLM (OpenRouter) e o push (VAPID) em produção

**Data:** 27/08/2026 · complementa a seção "Envs de LLM" de [`deploy.md`](deploy.md)
e o ADR-0009 (a LLM narra, nunca decide).

Este é o passo a passo operacional. Os dois subsistemas já estão implementados
e atrás de configuração: **nenhum código muda** para ligar nenhum dos dois.

---

## Regra que governa este runbook

**A chave NUNCA aparece em arquivo commitado.** Nem em código, nem em doc, nem
em script "temporário" — foi exatamente assim que um token de sessão vazou para
a main em 25/08 (removido e revogado em 27/08; `.gitignore` hoje barra
`scripts/*.tmp.ts`). A chave vive em dois lugares, e só:

| Onde | Para quê |
| --- | --- |
| `.env.local` (gitignored) | desenvolvimento e scripts locais |
| Painel da Vercel → Environment Variables | produção |

Se uma chave aparecer em qualquer outro lugar — inclusive numa conversa, num
print ou num commit — **rode-a**: crie outra no painel do provedor e apague a
exposta. Chave é descartável; vazamento não é.

---

## Parte 1 · OpenRouter (narrativas, resumo do dia e chat)

### O que já aconteceu (27/08)

- A chave foi validada no endpoint gratuito (`GET /api/v1/auth/key`) e gravada
  no `.env.local`.
- Uma chamada real de fumaça atravessou o pipeline inteiro — adapter →
  fallback de modelo → validador: o modelo primário do perfil não respondeu e
  o array `models` do OpenRouter caiu para o seguinte, que respondeu texto
  aprovado pelo validador. É o comportamento desenhado.
- **A chave está SEM teto de gasto** (`limit: null`). Ver o passo 2 — é o
  único passo que protege o cartão de crédito de um defeito nosso ou de abuso.

### O que VOCÊ precisa fazer

**1. Colocar a chave na Vercel** (~2 min)

1. `vercel.com` → projeto **nba-projeto** → **Settings** → **Environment Variables**.
2. **Add New**: nome `OPENROUTER_API_KEY`, valor = a chave (a mesma do
   `.env.local`), ambiente **Production** (Preview é opcional — cada preview
   gastaria crédito real; recomendo deixar de fora).
3. Salvar. Env novo só vale no PRÓXIMO deploy — combine com o Redeploy do
   passo 4.

**2. Configurar o teto de gasto — OBRIGATÓRIO antes de qualquer flag** (~2 min)

1. `openrouter.ai` → **Settings** → **Keys** (ou **Credits → Limits**).
2. Na chave do projeto, defina **Credit limit** (teto absoluto da chave) com
   um valor que você aceita perder num acidente — p.ex. US$ 10 para a fase
   demo.
3. Em **Settings → Privacy**, confira a política de dados: o padrão do
   OpenRouter já exclui provedores que treinam com os prompts, e o prompt do
   chat carrega a Lista Secreta inteira (conteúdo pago do produto). Mantenha o
   padrão ou restrinja mais.

Por que isso não é opcional: o custo por evento das narrativas é centavos/mês,
mas o chat é cobrado POR REQUISIÇÃO. As proteções de código existem (cota
diária, limite por minuto, teto de pergunta) — o teto na plataforma é o freio
que não depende de a gente ter acertado o código (ADR-0009).

**3. Nada mais.** Sem a chave o app usa o adapter fake (determinístico); com a
chave, a PRÓXIMA publicação da lista gera narrativas reais e o resumo do dia.
O chat continua desligado até `CHAT_HABILITADO=true` — e ele ainda não tem
interface, então não ligue por ora.

### Como conferir que funcionou

Depois do deploy: abrir a Lista Secreta e ler as narrativas nos cards — texto
variado por jogador (o fake usa um banco de 6 frases; o real nunca repete).
No banco, `select perfil, modelo, ok, tokens_saida from llm_chamadas order by
criado_em desc limit 10` mostra qual modelo respondeu e o custo em tokens.

### Detalhes que valem saber

- **Perfis e modelos** vivem em `src/modules/ingestao/llm/perfis.ts` — trocar
  modelo é editar a lista, sem tocar em mais nada. Ids de modelo envelhecem
  (a fumaça de 27/08 já pegou o primário fora do ar); o fallback existe para
  isso, mas vale revisar os ids de tempos em tempos.
- Os cabeçalhos opcionais `HTTP-Referer`/`X-Title` do OpenRouter (atribuição
  no ranking público deles) não são enviados hoje. Se quiser, é uma linha no
  adapter — cosmético, não funcional.
- A chave usada nesta configuração **circulou numa conversa de chat**. O teto
  de gasto mitiga; se um dia quiser zerar o risco, crie chave nova no painel,
  troque nos dois lugares e apague a antiga. Cinco minutos.

---

## Parte 2 · VAPID e push (tutorial completo)

### O que é VAPID, em uma frase

Um par de chaves que identifica ESTE app perante os serviços de push dos
navegadores: a pública vai no browser junto com a inscrição; a privada assina
cada envio no servidor — é o que impede outro site de empurrar notificação
para os seus assinantes.

### Estado atual

As três variáveis **já existem no `.env.local`** (geradas em 25/08):
`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.
O que falta é levá-las à Vercel — e uma decisão de dono (abaixo).

### Decisão antes de copiar: de quem são as chaves?

Cada navegador guarda a chave pública com que se inscreveu. **Trocar as chaves
depois derruba todas as inscrições existentes** (todo mundo precisa aceitar de
novo). Se o app será entregue ao CJ, o ideal é gerar as chaves definitivas
antes do primeiro assinante real — está registrado como pergunta em
`docs/specs/README.md`. Para a fase demo, as chaves atuais servem.

### Passo a passo

**A. Usar as chaves existentes** (caminho da demo, ~3 min)

1. Abra o `.env.local` e copie os valores das três variáveis.
2. Vercel → **Settings → Environment Variables** → adicione as três em
   **Production**:
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY` — pode vazar sem problema, é pública por
     construção (o `NEXT_PUBLIC_` a embute no bundle do browser).
   - `VAPID_PRIVATE_KEY` — segredo de verdade; marque como **Sensitive**.
   - `VAPID_SUBJECT` — `mailto:` do responsável (hoje
     `mailto:mateusnogueiradr1@gmail.com`).
3. Adicione também `PUSH_INTERNAL_ALLOWLIST` com o seu e-mail e o do CJ
   (separados por vírgula). Com a allowlist, só vocês recebem push — nenhum
   assinante recebe notificação de dado de demonstração.
4. **NÃO** defina `PUSH_ENABLED=true` ainda: essa flag abre o push para todo
   assinante com direito ativo. É o interruptor do dia em que houver dado
   real.

**B. Gerar chaves novas** (quando decidir o dono definitivo)

```bash
npx web-push generate-vapid-keys
```

Imprime o par novo. Substitua os valores no `.env.local` E na Vercel, faça
Redeploy — e saiba que toda inscrição existente morre nesse momento (na fase
demo, custo zero).

### O que o push precisa ALÉM do VAPID

| Requisito | Estado |
| --- | --- |
| Chaves na Vercel | este runbook |
| Alguém inscrito | instalar o PWA e aceitar notificações; **no iPhone só funciona com o app adicionado à tela inicial** (exigência da Apple) — sem isso parece defeito e não é |
| Gatilho em tempo real | os pushes de Fire Live e green nascem do cron `ao-vivo` (a cada minuto), que exige **plano Pro + `CRON_COMPLETO=true`** (ADR-0003). No Hobby, só o push da publicação diária da Lista Secreta dispara |

### Como conferir que funcionou

No app (logado, na allowlist): Lista Secreta → "Ativar alertas" → aceitar a
permissão do navegador. A inscrição aparece em `push_inscricoes`. Na próxima
publicação da lista, a notificação chega — desktop basta estar com o site
aberto uma vez; iPhone, app na tela inicial.

---

## Checklist consolidado — o que você tem que fazer

1. ☐ Vercel: `OPENROUTER_API_KEY` em Production
2. ☐ OpenRouter: **teto de gasto** na chave (não pule)
3. ☐ Vercel: as 3 variáveis VAPID (privada como Sensitive)
4. ☐ Vercel: `PUSH_INTERNAL_ALLOWLIST` com seu e-mail e o do CJ
5. ☐ Destravar o deploy (religar GitHub `Mateus-Nogueira-GT` na conta Vercel,
   ou Redeploy manual) — sem isso NADA acima entra em vigor
6. ☐ Depois do deploy: conferir narrativas nos cards e testar o push com a
   própria conta
