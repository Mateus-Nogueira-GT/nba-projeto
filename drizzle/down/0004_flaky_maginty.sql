-- DESCIDA de 0004_flaky_maginty.sql — GERADO por scripts/gerar-down.mjs, não editar à mão.

ALTER TABLE "greens" DROP COLUMN IF EXISTS "push_enfileirado_em";
ALTER TABLE "apitos" DROP COLUMN IF EXISTS "push_enfileirado_em";
