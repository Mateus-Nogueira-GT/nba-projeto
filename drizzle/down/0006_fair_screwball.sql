-- DESCIDA de 0006_fair_screwball.sql — GERADO por scripts/gerar-down.mjs, não editar à mão.

ALTER TABLE "jogos" DROP COLUMN IF EXISTS "data_jogo";
DROP TABLE IF EXISTS "identidades_jogador" CASCADE;
