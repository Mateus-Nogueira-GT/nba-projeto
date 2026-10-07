# Plano — correções do debug de 07/10

Origem: revisão em 4 frentes (ingestão e scripts; motor, retroativo e matchup; odds e fuso; falhas
antigas de teste). Cada item tem um teste que falha antes da correção.

## Lote X · ingestão, scripts, retroativo

- [x] X1. **Elenco:** um jogador com dois ids no provedor (ligado por `identidades:conflitos
  --vincular`) não pode virar inativo porque um dos ids está fora de `/players/active`. Marcar
  ausente **por jogador** (nenhuma identidade presente). Se dois ids do mesmo jogador trouxerem
  times diferentes, vale o primeiro, de forma determinística.
- [x] X2. **`lista-cj:confirmar`:** detectar o separador pelo cabeçalho (`,` ou `;`); linha com
  número de colunas diferente do cabeçalho vira PROBLEMA; só contar como ligado o que o UPDATE
  realmente alterou.
- [x] X3. **`motor:retroativo`:** a transação de cada dia também apaga as linhas dos jogos do dia
  pelo `jogo_id`, não só pela data (cobre jogo que mudou de dia sem apagar a temporada).
  `--limpar-temporada` só roda se `--de/--ate` cobrirem toda a temporada e se houver versão da
  lista vigente.
- [x] X4. **`jogos:recalcular-rodada`:** só jogos `ENCERRADO`; jogo com horário exatamente 00:00 UTC
  (provável "a definir") é listado e não muda.

## Lote Y · entrega e telas

- [x] Y1. **Push do Fire Live:** rótulo com acento por atributo ("assistências") e unidade no título
  do green ("bateu 10 rebotes").
- [x] Y2. **Matchup:** perfis dos 30 times calculados uma vez por data e temporada, em cache de
  servidor, como o resto de `src/app/_cache`; a chamada vai para o `Promise.all` do painel.
- [x] Y3. **Fire Live, marco do modo fire:** a temporada da média sai da data do JOGO, como no
  motor, e não de `apitadoEm`. Corrige o teste antigo.
- [x] Y4. **Desempate de posição:** o mesmo critério estável no motor (OPD) e no detalhe do apito
  (posição, depois id do jogador); a demo para de inventar empate em REB/AST.
- [x] Y5. **Estatísticas, cabeçalho do jogo:** a data é a da rodada (EUA) e a hora é de Brasília.
- [x] Y6. **Gestão:** registrar de novo sem o campo odd mantém a odd salva antes; `''` explícito
  continua apagando.
- [x] Y7. **Teste de `/redefinir`:** emitir o token com o relógio real (o teste tinha data fixa).

## Depois

- [x] Z1. Suíte, tipos, lint e fronteiras: 2.576 testes passando, zero falhas (as três antigas incluídas).
- [x] Z2. Produção: `ingestao:elenco` rodado em 07/10; Dillon Jones de volta a ativo, com os dois ids.
- [ ] Z3. Commit e push pelo parceiro.
