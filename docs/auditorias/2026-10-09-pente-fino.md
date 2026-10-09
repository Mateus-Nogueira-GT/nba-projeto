# Pente fino de 09/10/2026 — bugs encontrados

**Pedido do parceiro:** antes de commitar as respostas do CJ, revisar tudo, em especial os links
de afiliação, e dizer se o fluxo está funcional de ponta a ponta.

**Método:** quatro revisões independentes em paralelo (afiliados e indicações; conta, assinatura
e acesso; o trabalho não commitado dos lotes N e M; segurança e integridade), cada uma provando os
achados com testes PGlite descartáveis que exercitam as rotas e as server actions reais, mais
sondagens só de leitura na produção. Os testes descartáveis foram apagados; nenhum arquivo do
repositório mudou por causa da revisão.

## Veredito

| Área | Funcional de ponta a ponta? |
| --- | --- |
| Afiliados e indicações | **Sim, com uma ressalva séria** (achado 1). Os três bugs da auditoria de 26/09 estão corrigidos. |
| Conta, assinatura e acesso | **Sim, com uma ressalva séria** (achado 2), que só importa quando o checkout ligar. |
| Lotes N e M (não commitados) | Sem bloqueio para o commit. Um achado médio (3) e três menores. |
| Segurança | Nenhum achado explorável em produção. Dois reforços recomendados (4 e 5). |

## Achados, por gravidade

### 1. ALTO — uma 2ª conta no mesmo navegador apaga uma indicação já registrada
- **Onde:** `src/modules/plataforma/afiliados/servico.ts:504-511` e `:742-756`; efeito pelo
  predicado em `predicado-indicacao.ts:25` (`estado != 'CONFLITO'`).
- **Cenário:** B abre o link de A e se cadastra (`CADASTRO_NIP` gravado). Em até 30 dias, qualquer
  outra conta entra no mesmo navegador: um terceiro faz login, ou um segundo amigo se cadastra no
  celular de A. A atribuição de B vira `CONFLITO`.
- **Resultado:** B some de `/admin/indicacoes` e dos totais de A; se B assinar depois,
  `registrarAssinaturaIndicada` devolve `registrada: false`. Perda silenciosa do dado que o
  parceiro pediu para ter.
- **Prova:** teste com login de terceiro → estado `['CONFLITO']`, cadastros na lista 0, assinatura
  não registrada.
- **Correção:** atribuição que já tem `usuario_id` e já gerou `CADASTRO_NIP` está fechada; o uso
  posterior do cookie não deve rebaixá-la (não associar a conta nova, ou criar uma linha nova em
  `CONFLITO` e deixar a original intacta). Teste-âncora: indicação consumada sobrevive.

### 2. ALTO — "Cancelar assinatura" cancela o contrato errado depois de um upgrade
- **Onde:** `src/modules/plataforma/assinatura/checkout.ts:397-403`
  (`cancelarAssinaturaDoUsuario` ordena por `atualizadoEm` sem filtrar `cancelada_em IS NULL`).
- **Cenário:** MVP mensal → compra All Star. O cron cancela o contrato MVP e atualiza
  `atualizadoEm` depois do All Star. A tela mostra "Cancelar" para o All Star, mas a action pega o
  MVP já cancelado, chama o Mercado Pago de novo e redireciona com "cancelamento confirmado". O All
  Star continua cobrando.
- **Prova:** teste com `PagamentoFake`: esperado cancelar `pre-as`, recebido `pre-mvp`.
- **Correção:** mesma ordenação e filtro da tela (`isNull(canceladaEm)` + `desc(atualizadoEm)`),
  ou receber o `assinaturaId` do formulário escopado ao usuário; erro claro quando só há contratos
  cancelados. Só afeta quando o checkout estiver ligado.

### 3. MÉDIO — o memo do matchup no Fire Live guarda uma falha por 1 hora
- **Onde:** `src/modules/entrega/matchup.ts:219-224` (`calculadoraDeMatchup`) e
  `src/modules/entrega/fire-live/feed.ts:26-36`. Trabalho não commitado.
- **Cenário:** uma falha passageira do Postgres na primeira leitura de `matchupDoDia` fica guardada
  na promessa memorizada; todos os ciclos seguintes de todos os jogos da noite rejeitam de novo, a
  materialização do Fire Live lança e o snapshot ao vivo congela até o memo expirar. O push não é
  afetado; a tela Ao Vivo sim.
- **Correção:** apagar a chave do memo na rejeição (`.catch(e => { memo.delete(chave); throw e })`)
  e, no Fire Live, degradar para `matchup: null` em vez de derrubar a materialização.

### 4. MÉDIO — a fila de push aceita requisição forjada (mitigado pela Vercel)
- **Onde:** `src/app/api/fila/push/route.ts:17` e `entregas/route.ts:22`; a raiz é o
  `handleCallback` de `@vercel/queue`, que não valida assinatura da requisição.
- **Cenário:** um POST com os cabeçalhos `ce-*` e um corpo válido mandaria um push com texto livre
  para todos os assinantes.
- **Em produção, não é explorável:** sondagem em 09/10 com os cabeçalhos forjados devolve a página
  404 do app, e nada no código faz isso: a Vercel não expõe no endereço público as rotas com
  `experimentalTriggers`.
- **Reforço recomendado:** segredo compartilhado em cabeçalho próprio, enviado no `send()` e
  conferido com `timingSafeEqual` antes do `handleCallback`, como os crons já fazem.

### 5. MÉDIO — os scripts manuais da demo não têm a guarda de dado real
- **Onde:** `scripts/demo-temporada.ts`, `scripts/demo-seed.ts`, `scripts/demo-limpar.ts`.
- **Cenário:** `motivoParaNaoSemear` só protege o cron. Com `.env.local` apontando para produção,
  um `demo:limpar --confirmar` de rotina apaga a temporada 2025-26 real e os apitos regravados.
- **Correção:** os três scripts chamam `motivoParaNaoSemear` e abortam; `demo:limpar` exige uma
  flag extra quando há checkpoint de ingestão real.

### 6. MÉDIO (UX) — o destino que o portão manda é descartado no login e no aceite
- **Onde:** `src/modules/plataforma/auth/requisicao.ts:11` (`DESTINOS_POS_LOGIN`),
  `src/features/metodologia/destino.ts:10-12`.
- **Cenário:** `exigirNivel` manda `?destino=/fire-live` (ou `/gestao`, `/apito/...`,
  `/estatisticas/...`, `/resultados/...`); o login e o aceite reduzem para `/abrir`. O open
  redirect está fechado; o link que o produto gera é que fica inerte.
- **Correção:** ampliar a allowlist por forma (`^/(fire-live|gestao|estatisticas(/.*)?|resultados/\d{4}-\d{2}-\d{2}|apito/[^/]+)$`).

### 7. BAIXO — cookie de visitante inválido é regravado por 30 dias
- **Onde:** `src/app/r/[codigo]/route.ts:39,58-65`; `src/app/ir/[codigo]/route.ts:39-40`.
- **Cenário:** cookie adulterado fora de `^[A-Za-z0-9_-]{16,160}$` faz `hashVisitante` lançar; a
  resposta regrava o mesmo valor. Aquele navegador nunca mais gera atribuição.
- **Correção:** validar o valor lido e trocar por `novoTokenVisitante()` se inválido.

### 8. BAIXO — resolução de grafias muda de resposta quando 2026-27 começar
- **Onde:** `src/modules/ingestao/niveis/backup.ts:393-418` (`mediasMaisRecentes`). Não commitado.
- **Cenário:** a partir da 1ª rodada, `medias_jogador` ganha linhas 2026-27 com um jogo, e a
  "temporada mais recente com dado" passa a decidir nível de REB/AST pela média de um jogo.
  Reexecutar `lista-cj:restaurar` em novembro pode trocar o nível escolhido sem aviso.
- **Correção:** exigir `jogos >= N` (N no ruleset) para a temporada contar, ou `--temporada=` no
  script.

### 9. BAIXO — posição entre parênteses no painel pode divergir da estrela
- **Onde:** `src/features/apito/DetalheDoApito.tsx:262-274`, `carregar.ts:117-131`. Não commitado.
- **Cenário:** a estrela vem do snapshot, a posição de outro cache (1 h). Entre uma leitura e outra
  a tela pode imprimir "Top 5 que mais cedem pontos (6º)". Transitório.
- **Correção:** guardar a posição junto com a estrela no item, ou omitir o parêntese quando a
  posição não bate com o corte.

### 10. BAIXO — a tabela da Lista mostra "—" em Confiança para REB e AST
- **Onde:** `src/features/lista/TabelaDeApitos.tsx:223`, `ResumoDaRodada.tsx:163`. Não commitado.
- O painel já mostra "Apito N{x} · Laranja"; a tabela e o resumo ainda imprimem "—" sob
  "Confiança". Inconsistência de leitura com a resposta 2 do CJ.

### 11. BAIXO — `CORTESIA_ATE` termina 3 h antes do dia informado
- **Onde:** `scripts/conceder-cortesia.ts:23` usa `T23:59:59.999Z` (UTC); `TEMPORADA_FIM` usa
  `intervaloDoDia(dia, fuso).fim`. Padronizar pelo segundo.

### 12. BAIXO — enumeração de e-mail pelo cadastro
- **Onde:** `src/features/publico/acoes.ts:104`. E-mail existente devolve mensagem diferente de
  inexistente. Freado por 5/h por e-mail e 30/h por IP. O login não vaza.

### 13. BAIXO — `cadastrar` loga o objeto de erro inteiro
- **Onde:** `src/features/publico/acoes.ts:43`. Um erro do driver pode carregar o SQL com
  `visitante_token` e `usuario_id`. Padronizar como `/r` e `/ir` (`evento` + `erro.name`).

### 14. BAIXO — dependências com alerta alto (`npm audit --omit=dev`: 19 altas, 0 críticas)
- `next` ^16.3.6 → 16.3.8+ (os dois alertas não se aplicam ao projeto, mas o custo é baixo);
  `undici`/`devalue` via `workflow` (DoS; baixo-médio, o fix exige major do `workflow`); `sharp`
  (baixo); o resto é ferramental de build.

### 15. INFO — comentário enganoso em `exigirNivel`
- `src/modules/plataforma/assinatura/guarda.ts:35-37`: "bloqueado vai para /conta" é
  inalcançável; bloqueado cai em `/entrar`. Confere com o runbook; só o comentário mente.

### 16. INFO — não há aceite de termos no cadastro
- Só nome, e-mail e senha. O único consentimento é o da metodologia, pós-login. Nenhum documento
  pede termos de uso: lacuna a decidir com o cliente, não bug.

### 17. INFO — sem dedupe de clique em `/r` e `/ir`
- Decisão da spec ("cada clique conta"). Um script infla o número de cliques do parceiro; não gera
  comissão nem indicação (únicas por atribuição).

## O que foi provado e está certo

- **Afiliados:** convite do admin → conta → `/afiliados` (bug 1 de 26/09 corrigido); parceiro do
  admin e convite na mesma linha (bug 2 corrigido); cadastro via link grava 1 `CADASTRO_NIP` e
  aparece em `/admin/indicacoes` (bug 3 corrigido); renovação não duplica `ASSINATURA_NIP`;
  cancelamento muda a situação; link de casa sem oferta ativa cai em `/oferta-indisponivel` sem
  afetar o link de indicação; ninguém se auto-indica; 17/17 actions do admin com `atorAdmin()`;
  nome do parceiro escapado; token de convite de 32 bytes, só o hash no banco, 7 dias, uso único.
- **Conta e acesso:** e-mail duplicado case-insensitive; senha ≥ 12 com letra e número; cookie
  `httpOnly`/`sameSite=lax`/`secure`; 3º aparelho derruba o mais antigo; teto por IP corrigido;
  redefinição de 1 h, uso único, senha fraca não queima o token; GRÁTIS/MVP/ALL_STAR nos portões
  certos; 9/9 páginas de admin com `negarSeNaoForAdmin`; 10/10 crons com `timingSafeEqual`.
- **Mercado Pago:** HMAC com tolerância de 5 min, idempotência por evento, `pending` não concede,
  `refunded`/`charged_back` revogam, temporada termina em `2027-07-01T04:00Z` (fuso NY),
  degradação limpa sem token (503 no webhook, "em breve" na tela, nenhum 500).
- **Lotes N e M:** motor puro (depcruise sem violações); linhas de REB/AST idênticas às antigas;
  nenhum lugar quebra com confiança `null`; posições com empate; o dia 20 conta; adversário certo
  em cada feed; snapshots antigos sem `matchup` renderizam; tema claro e escuro com o token novo.
- **Segurança geral:** sem segredo em código ou log; chave da BallDontLie só em header; sem
  `sql.raw` com entrada do usuário; destinos pós-login em allowlist fechada; `/r`, `/ir`, `/oferta`
  só para destino homologado; sem `fetch` para URL de usuário; `unstable_cache` nunca por usuário;
  migrações 0033–0036 e seus `down` coerentes.
- **Produção (sondagem de 09/10):** nenhum 500 em 28 rotas; saúde sem alertas; `/r` e `/ir` com
  código inexistente caem em `/oferta-indisponivel`; crons, chat e webhook recusam sem credencial;
  admin anônimo recebe só o redirecionamento para `/admin/entrar`.

## Depende de configuração de produção (não é bug)

- `MERCADOPAGO_ACCESS_TOKEN` e `MERCADOPAGO_WEBHOOK_SECRET` ausentes; com `CHECKOUT_ENABLED=true`
  também são obrigatórias as quatro `PLANO_*_CENTAVOS` e `TEMPORADA_FIM`.
- `MERCADOPAGO_SANDBOX` precisa ser `false` explícito em produção (o padrão é sandbox).
- `CADASTRO_PUBLICO_HABILITADO` ausente = aberto.
- O cron `reconciliar-pagamentos` dá 500 a cada rodada enquanto não houver token (ruído no log,
  sem efeito).
- Sem provedor de e-mail: redefinição só pelo admin; cadastro sem verificação de e-mail.

## Recomendação de ordem

1. Corrigir 1 (indicação apagada) e 3 (memo do Fire Live) **antes do commit** das respostas do CJ.
2. Corrigir 2 (cancelamento pós-upgrade) **antes de ligar o checkout**.
3. 5, 6, 7, 10 e 11 na mesma rodada, por serem pequenos.
4. 4, 8, 9, 12, 13 e 14 quando houver janela.

## Situação após as correções (09/10)

Plano: [2026-10-09-correcoes-do-pente-fino.md](../superpowers/plans/2026-10-09-correcoes-do-pente-fino.md).
Suíte inteira em lotes de 12 arquivos: **2.724 testes passando, 0 falhas**; `tsc`, lint e
depcruise limpos.

| # | Achado | Situação |
| --- | --- | --- |
| 1 | Indicação consumada apagada por 2ª conta | **Corrigido** (A1). Também o 2º caminho em `registrarClique`, que não estava no relatório. |
| 2 | Cancelar pós-upgrade cancela o contrato errado | **Corrigido** (A2). Formulário envia o id; sem vigente, não chama o Mercado Pago. |
| 3 | Memo do matchup congela o Fire Live | **Corrigido** (B1). |
| 4 | Fila de push aceita forjado | **Em aberto, bloqueado.** O cabeçalho do `send()` não chega ao callback (só payload e `Content-Type` são preservados); a guarda da spec pararia o push. Mitigado em produção pela Vercel (rota não exposta). Alternativa: HMAC dentro do payload. |
| 5 | Scripts da demo sem guarda de dado real | **Corrigido** (C1). `--apagar-dado-real` só no `demo:limpar`. |
| 6 | Destino pós-login descartado | **Corrigido** (A3). Também fechado `/x/../admin` normalizando para `/admin`. Resultados com filtro na query voltam para `/abrir`. |
| 7 | Cookie de visitante inválido | **Corrigido** (A4). |
| 8 | Grafias pela média de 1 jogo | **Corrigido** (B4). `jogos_minimos: 5` no ruleset (a confirmar pelo parceiro); `--temporada=` no script. |
| 9 | Posição do painel ≠ estrela | **Corrigido** (B2). Snapshot antigo mostra a frase sem posição. |
| 10 | "—" em Confiança na Lista para REB/AST | **Corrigido** (B3). A seção "Linhas" do painel ainda mostra "—" (fora da spec). |
| 11 | Cortesia termina 3 h antes | **Corrigido** (A5). |
| 12 | Enumeração de e-mail no cadastro | **Mantido** por decisão da spec §2.10. |
| 13 | Log do cadastro com objeto inteiro | **Corrigido** (A5). |
| 14 | Dependências | **`next` 16.3.8** (C3). `workflow`, `sharp` e transitivas ficam. |
| 15 | Comentário de `exigirNivel` | **Corrigido** (A3). |
| 16 | Termos de uso | Decisão com o cliente. |
| 17 | Dedupe de clique | Decisão da spec de afiliados. |
