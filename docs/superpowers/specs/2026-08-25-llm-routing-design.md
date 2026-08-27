# LLM Routing via OpenRouter — narrativas, chat e admin

**Data:** 25/08/2026 · **Status:** aprovado em brainstorming, aguardando plano
**Decisor:** parceiro (Mateus) · abordagem A aprovada em chat

---

## 1 · O que é, em uma frase

Um subsistema de geração de texto por LLM com **OpenRouter como roteador único**
(uma chave, vários modelos, fallback nativo), alimentando três consumidores —
narrativas nos cards, chat do assinante e ferramentas do admin — **sem que a LLM
jamais decida quem apita**.

## 2 · O que a LLM é e o que ela nunca é

A LLM **narra e explica** fatos que o motor já decidiu. Ela nunca:

- decide, sugere ou altera um apito (regra 3 do projeto: regra é do CJ);
- consulta o banco (recebe fatos prontos no prompt);
- bloqueia o produto (falha em qualquer perfil = feature ausente, nunca erro).

O motor (L2) não é tocado por nada desta spec. Nenhum teste do motor muda.

## 3 · Arquitetura — `src/modules/ingestao/llm/`

Camada L0, fronteira anticorrupção, mesmo padrão dos adapters da NBA e do
Mercado Pago:

| Arquivo | Responsabilidade |
| --- | --- |
| `porta.ts` | Contrato `PortaLLM.gerar(perfil, prompt, opcoes) → Promise<TextoGerado>`. Consumidor nunca vê OpenRouter. |
| `openrouter.ts` | Adapter real: `POST https://openrouter.ai/api/v1/chat/completions` com o array `models` nativo fazendo fallback entre modelos. Timeout 15s, 1 retry, erros tipados. |
| `perfis.ts` | Mapa perfil → `{ modelos: [primário, ...fallbacks], maxTokens, temperatura }`, em config versionada. |
| `fake.ts` | Adapter determinístico para testes e para rodar sem chave (padrão do `fake.ts` do Mercado Pago). |

### Perfis de roteamento

| Perfil | Classe de modelo | Uso |
| --- | --- | --- |
| `narrativa` | barato e rápido (ex. gemini-flash) + 2 fallbacks | texto do card, 1x por item por publicação |
| `resumo` | idem `narrativa` | resumo do dia, 1x por rodada |
| `chat` | intermediário (ex. haiku / gpt-mini) + fallback barato | conversa do assinante |
| `admin` | o melhor disponível (classe sonnet/opus) | sugestão de vínculos; volume mínimo |

Os ids exatos dos modelos vivem em `perfis.ts` e são detalhe trocável — a spec
fixa as **classes**, não os ids.

### Seleção do adapter

`OPENROUTER_API_KEY` presente → adapter real. Ausente → `fake.ts`, e tudo
continua funcionando (narrativas determinísticas de demonstração). Nenhum outro
env é obrigatório.

O **teto de gasto** é configurado na plataforma OpenRouter (limite da chave),
não no nosso código — o freio que não depende de a gente acertar. Obrigatório
estar configurado antes de `CHAT_HABILITADO=true` em produção.

## 4 · Narrativas e resumo do dia (perfis `narrativa` e `resumo`)

Entram no pipeline de materialização da Lista Secreta (L3), no mesmo passo que
monta o snapshot:

1. **Prompt por item**: fatos já materializados (jogador, nível do jogador,
   nível do apito, método, últimos 5 na linha, média, linha) + texto fixo da
   metodologia. Nada de acesso a banco pela LLM.
2. **Validador** (função pura, `validador.ts`):
   - proíbe "probabilidade" e variações (regra do design system);
   - proíbe números que não constam dos fatos de entrada (anti-alucinação de
     estatística);
   - limite de 280 caracteres;
   - reprovou → o card sai **sem narrativa**, contado em métrica. A publicação
     nunca espera nem falha por causa disso.
3. Texto aprovado grava em campo novo do item do snapshot (`narrativa`).
   A tela lê como lê todo o resto — custo zero por usuário.
4. **Resumo do dia**: uma chamada por rodada, mesmo fluxo, campo `resumoDoDia`
   no cabeçalho do feed.

Custo: ~50 chamadas baratas/dia, **independente do número de assinantes**.

Idioma pt-BR, tom sóbrio de comentarista. Calibração fina do tom com o CJ fica
registrada como pergunta não-bloqueante em `docs/specs/README.md`.

## 5 · Chat do assinante (perfil `chat`)

- **Endpoint** `POST /api/chat` (L3), atrás de `sessaoAtual()` +
  `avaliarAcesso()` — sem direito ativo, sem chat.
- **Contexto montado pelo servidor**: feed materializado do dia + metodologia +
  últimas 10 mensagens da conversa. Prompt de sistema instrui: nunca sugerir
  entrada fora da lista; o mesmo validador das narrativas roda na resposta.
- **Cota**: `CHAT_COTA_DIARIA` (env, padrão 20 mensagens/dia por assinante).
  A cota é `COUNT(*)` do dia na tabela de mensagens — sem contador paralelo.
- **Limite por minuto**: reaproveita `plataforma/auth/rate-limit.ts`.
- **Tabela `chat_mensagens`**: `id, usuario_id, papel (USUARIO|ASSISTENTE),
  texto, modelo, tokens_in, tokens_out, criado_em`. É a cota, o histórico e a
  auditoria numa tabela só.
- **Flag** `CHAT_HABILITADO` (padrão false) — liga/desliga sem deploy, padrão
  das flags do Mercado Pago.
- **v1 sem streaming**: resposta JSON completa (~2–4s no modelo intermediário).
  Streaming é upgrade de UX registrado, não construído.
- Falha da LLM → resposta "indisponível agora", mensagem do usuário não
  desconta da cota.

Pior caso teórico: 10.000 × 20 = 200k chamadas/dia — é para isso que existem a
cota, a flag e o teto na plataforma.

## 6 · Uso interno (perfil `admin`)

No `/admin/mapeamento` (que já existe): botão **"sugerir vínculos"** que envia
os nomes não casados ao perfil `admin` e devolve sugestões com grau de
confiança. O humano confirma, como hoje — a sugestão nunca grava sozinha.
Nada além disso na v1.

## 7 · Observabilidade — tabela `llm_chamadas`

`id, perfil, modelo_usado, tokens_in, tokens_out, custo_estimado_usd, ok,
erro, duracao_ms, criado_em`. Toda chamada (real ou fake) registra uma linha.
É o que responde "quanto isso está custando" e "qual perfil está falhando" sem
depender do painel do OpenRouter.

## 8 · Envs (todos opcionais; ausência = feature desligada)

| Env | Efeito |
| --- | --- |
| `OPENROUTER_API_KEY` | ausente → adapter fake em tudo |
| `CHAT_HABILITADO` | padrão `false` |
| `CHAT_COTA_DIARIA` | padrão `20` |

## 9 · Testes

- `openrouter.ts` com fixtures HTTP (padrão balldontlie): sucesso, fallback de
  modelo, timeout, erro 402/429.
- `validador.ts`: bateria própria de função pura (probabilidade, número
  inventado, tamanho).
- Pipeline de narrativa: PGlite + adapter fake — snapshot ganha narrativa;
  validador reprovando → snapshot sem narrativa e publicação intacta.
- Rota de chat: PGlite + fake — gating por direito, cota esgotada, falha da
  LLM não desconta cota.
- Motor: intocado, zero testes alterados.

## 10 · Fora de escopo desta spec

- Streaming no chat (registrado como upgrade).
- Rascunho de respostas ao CJ e outras ferramentas de admin além do vínculo.
- Narrativas no Fire Live (o ciclo de 1 minuto tem orçamento de latência
  próprio; decidir depois com a tabela `llm_chamadas` na mão).
- **Mercado Pago**: não faz parte deste subsistema. A integração já existe no
  repo atrás de flags; "configurar sem conectar" é tarefa operacional (criar
  credenciais sandbox, definir envs com `MERCADOPAGO_CHECKOUT_ENABLED=false`,
  registrar webhook) + runbook `docs/runbooks/mercadopago.md` + script
  `mp:conferir` de validação de credenciais. Aprovado em chat como trabalho
  bounded, sem spec.
