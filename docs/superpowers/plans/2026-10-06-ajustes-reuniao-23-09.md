# Plano — ajustes da reunião de 23/09

Spec: [2026-10-06-ajustes-reuniao-23-09-design.md](../specs/2026-10-06-ajustes-reuniao-23-09-design.md).

- [x] **1. Teste primeiro (motor):** um jogador de REB com média 3,9 não apita na Lista; com média 4,0
  apita. PONTOS não muda. Fire Live não muda. Sem `lista_media_minima`, tudo como antes.
- [x] **2. Schema:** `blocoAtributo.lista_media_minima: z.number().nonnegative().optional()`.
- [x] **3. Motor:** `avaliarListaSecreta` pula quem tem `medias[atributo]` ausente ou abaixo do mínimo.
- [x] **4. Ruleset:** `lista_media_minima: 4` em REBOTES e ASSISTENCIAS; `niveis.atributos` com os
  três atributos; os comentários registram a decisão de 06/10.
- [x] **5. Os testes que travavam `[PONTOS]`** são atualizados para a decisão nova, sem afrouxar o
  que provam.
- [x] **6. CLAUDE.md:** a armadilha "rebotes e assistências desligados" passa a dizer que estão ligados
  com tabela de demonstração, por decisão do parceiro de 06/10.
- [x] **7. Matchup (dado):** uma consulta pura sobre `estatisticas_time_jogo` (pontos cedidos, 3 errados
  e rebotes cedidos por jogo, com a posição na liga, só jogos antes da data), com teste no PGlite.
- [x] **8. Matchup (tela):** bloco "Adversário" no `DetalheDoApito`, com teste de fumaça.
- [x] **9. Suíte, tipos e lint.** Passam, salvo 2 testes que já falhavam antes (marco do modo fire e /redefinir). Achado: o commit 77722e5 tinha marcas de conflito em `_journal.json` e `gerar-down.mjs`; corrigido.
- [x] **10. Retroativo:** regravado com REB e AST: 1.231 jogos, 23.686 apitos (antes 14.418), 103 greens (antes 19).
- [ ] **11. Commit:** comandos para o parceiro, porque a trava bloqueia commit na main.
