-- DESCIDA de 0033_graceful_bullseye.sql — GERADO por scripts/gerar-down.mjs, não editar à mão.

ALTER TABLE "estatisticas_jogo" DROP CONSTRAINT IF EXISTS "estatisticas_jogo_time_id_times_id_fk";
ALTER TABLE "estatisticas_jogo" DROP COLUMN IF EXISTS "time_id";
