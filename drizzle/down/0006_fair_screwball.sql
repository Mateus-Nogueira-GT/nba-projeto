-- DESCIDA de 0006_fair_screwball.sql — GERADO por scripts/gerar-down.mjs, não editar à mão.

ALTER TABLE "jogos" DROP CONSTRAINT IF EXISTS "jogos_chave_natural";
ALTER TABLE "identidades_jogador" DROP CONSTRAINT IF EXISTS "identidades_jogador_jogador_id_jogadores_id_fk";
ALTER TABLE "jogos" DROP COLUMN IF EXISTS "data_jogo";
DROP TABLE IF EXISTS "identidades_jogador" CASCADE;
