-- DESCIDA de 0028_early_viper.sql — GERADO por scripts/gerar-down.mjs, não editar à mão.

ALTER TABLE "tentativas_checkout" DROP CONSTRAINT IF EXISTS "tentativas_checkout_modalidade_valida";
ALTER TABLE "tentativas_checkout" DROP CONSTRAINT IF EXISTS "tentativas_checkout_nivel_do_plano_valido";
ALTER TABLE "tentativas_checkout" DROP COLUMN IF EXISTS "modalidade";
ALTER TABLE "tentativas_checkout" DROP COLUMN IF EXISTS "nivel_do_plano";
