# Plano — correções do pente fino de 09/10

Spec: [2026-10-09-correcoes-do-pente-fino-design.md](../specs/2026-10-09-correcoes-do-pente-fino-design.md).
Cada item começa por um teste que falha. Os lotes têm arquivos disjuntos e podem rodar em paralelo.

## Lote A · afiliados e assinatura

- [x] A1. **Indicação consumada sobrevive** (spec §2.1): `associarVisitanteAoUsuario` e
  `registrarClique` em `servico.ts` não rebaixam atribuição fechada; criam linha nova em
  `CONFLITO`. Testes: login de terceiro e segundo cadastro no mesmo navegador mantêm a indicação,
  `registrarAssinaturaIndicada` continua registrando; atribuição anônima com duas contas ainda
  vira `CONFLITO`.
- [x] A2. **Cancelamento do contrato vigente** (§2.2): `cancelarAssinaturaDoUsuario` com
  `assinaturaId` escopado + critério da tela como defesa; formulário de `/conta` envia o id;
  sem vigente → `/conta?cancelamento=erro`. Teste com `PagamentoFake`: após upgrade, cancela
  `pre-as`, não `pre-mvp`.
- [x] A3. **Destino pós-login por forma** (§2.7) em `auth/requisicao.ts` e
  `features/metodologia/destino.ts`; comentário de `exigirNivel` (§2.10). Testes: `/fire-live`,
  `/resultados/2026-01-05`, `/apito/<uuid>` honrados; `//host`, `/fire-live/../admin`,
  `/apito/<id>?x` recusados.
- [x] A4. **Cookie de visitante inválido** (§2.10) em `/r` e `/ir`. Teste: cookie forjado →
  `set-cookie` com token novo e o clique registrado.
- [x] A5. **Cortesia** (§2.10) e **log do cadastro** (§2.10).

## Lote B · matchup, Lista e lista do CJ (trabalho não commitado)

- [x] B1. **Memo do Fire Live** (§2.3): evict na rejeição em `calculadoraDeMatchup`; Fire Live
  degrada para `matchup: null` com log. Testes: a segunda chamada com banco saudável funciona; a
  materialização do Fire Live não lança quando o matchup falha; Lista continua lançando.
- [x] B2. **Posição junto da estrela** (§2.4): `motivos: { metrica, posicao }[]` no motor e nos
  três feeds; painel lê do item; leitor aceita o formato antigo. Testes de materialização e de
  fumaça do painel.
- [x] B3. **Lista e resumo sem "—"** (§2.5): `TabelaDeApitos` e `ResumoDaRodada` mostram "N{x}"
  na cor do apito quando o atributo não tem nota; Fire Live mantém "—". Testes de fumaça.
- [x] B4. **Temporada com dado** (§2.6): chave `niveis.resolucao_por_media.jogos_minimos: 5` no
  ruleset e no schema; `mediasMaisRecentes` ignora temporada abaixo disso; `--temporada=` no
  script. Testes: temporada nova com 1 jogo não decide; `--temporada` fixa.

## Lote C · scripts, fila e dependências

- [x] C1. **Guarda da demo** (§2.8) nos três scripts; `--apagar-dado-real` no `demo:limpar`.
  Teste do módulo de guarda com checkpoint real presente.
- [ ] C2. **Segredo da fila** (§2.9): `x-nip-fila` nas duas rotas e no publicador; 503 sem
  variável; 401 com valor errado. Testes de rota.
  **BLOQUEADO (09/10):** o cabeçalho de `send()` não chega ao callback. O SDK
  (`@vercel/queue` 0.4.0, `sendMessage`) só o põe na requisição de PUBLICAÇÃO ao VQS, e a
  API (vercel.com/docs/queues/api) guarda e devolve ao consumidor apenas o payload e o
  `Content-Type`. Com a guarda na rota, toda entrega legítima levaria 401 e o push pararia.
  Precisa de outra forma de autenticar (ver relatório do Lote C) antes de implementar.
- [x] C3. **`next`** para a última 16.3.x; `npm audit --omit=dev` sem alerta de `next`; build local
  de tipos ok.

## Fechamento

- [x] D1. Suíte inteira em lotes de 12: 2.724 passando, 0 falhas; `tsc`, lint e depcruise limpos.
- [x] D2. Relatório `docs/auditorias/2026-10-09-pente-fino.md` ganha a coluna "situação" por
  achado.
- [ ] D3. Produção, pelo parceiro (sem `FILA_PUSH_SECRET`: C2 bloqueado): commit e push únicos com as respostas
  do CJ; `lista-cj:restaurar`; `motor:retroativo` de 2025-26.
