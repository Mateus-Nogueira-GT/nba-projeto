-- DESCIDA de 0012_smooth_shadowcat.sql — GERADO por scripts/gerar-down.mjs, não editar à mão.

ALTER TABLE "feed_snapshot" DROP CONSTRAINT IF EXISTS "feed_snapshot_unico";
ALTER TABLE "feed_snapshot" DROP CONSTRAINT IF EXISTS "feed_snapshot_jogo_id_jogos_id_fk";
ALTER TABLE "feed_snapshot" DROP COLUMN IF EXISTS "jogo_id";
ALTER TABLE "feed_snapshot" ADD CONSTRAINT "feed_snapshot_unico" UNIQUE ("data_referencia", "estrategia");
