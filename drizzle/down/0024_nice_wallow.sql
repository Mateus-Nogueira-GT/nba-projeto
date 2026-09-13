-- DESCIDA de 0024_nice_wallow.sql — GERADO por scripts/gerar-down.mjs, não editar à mão.

DROP INDEX IF EXISTS "links_afiliados_saida_do_apito_unica";
ALTER TABLE "links_afiliados" DROP COLUMN IF EXISTS "saida_do_apito";
