-- DESCIDA de 0005_mature_prism.sql — GERADO por scripts/gerar-down.mjs, não editar à mão.

ALTER TABLE "jogos" DROP COLUMN IF EXISTS "atualizado_em";
ALTER TABLE "estatisticas_time_jogo" DROP COLUMN IF EXISTS "atualizado_em";
ALTER TABLE "estatisticas_jogo" DROP COLUMN IF EXISTS "atualizado_em";
