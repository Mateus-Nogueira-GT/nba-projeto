-- DESCIDA de 0003_funny_kat_farrell.sql — GERADO por scripts/gerar-down.mjs, não editar à mão.

DROP INDEX IF EXISTS "fire_live_execucoes_abertas_idx";
ALTER TABLE "greens" DROP CONSTRAINT IF EXISTS "greens_jogador_id_jogadores_id_fk";
ALTER TABLE "greens" DROP CONSTRAINT IF EXISTS "greens_jogo_id_jogos_id_fk";
ALTER TABLE "fire_live_execucoes" DROP CONSTRAINT IF EXISTS "fire_live_execucoes_jogo_id_jogos_id_fk";
DROP TABLE IF EXISTS "greens" CASCADE;
DROP TABLE IF EXISTS "fire_live_execucoes" CASCADE;
