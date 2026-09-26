-- DESCIDA de 0034_freezing_post.sql — GERADO por scripts/gerar-down.mjs, não editar à mão.

DROP INDEX IF EXISTS "greens_retroativos_temporada_data_idx";
DROP INDEX IF EXISTS "apitos_retroativos_jogador_idx";
DROP INDEX IF EXISTS "apitos_retroativos_temporada_data_idx";
ALTER TABLE "greens_retroativos" DROP CONSTRAINT IF EXISTS "greens_retroativos_jogador_id_jogadores_id_fk";
ALTER TABLE "greens_retroativos" DROP CONSTRAINT IF EXISTS "greens_retroativos_jogo_id_jogos_id_fk";
ALTER TABLE "feed_retroativo" DROP CONSTRAINT IF EXISTS "feed_retroativo_niveis_versao_id_niveis_versao_id_fk";
ALTER TABLE "apitos_retroativos" DROP CONSTRAINT IF EXISTS "apitos_retroativos_jogador_id_jogadores_id_fk";
ALTER TABLE "apitos_retroativos" DROP CONSTRAINT IF EXISTS "apitos_retroativos_jogo_id_jogos_id_fk";
ALTER TABLE "apitos_retroativos" DROP CONSTRAINT IF EXISTS "apitos_retroativos_niveis_versao_id_niveis_versao_id_fk";
DROP TABLE IF EXISTS "greens_retroativos" CASCADE;
DROP TABLE IF EXISTS "feed_retroativo" CASCADE;
DROP TABLE IF EXISTS "apitos_retroativos" CASCADE;
