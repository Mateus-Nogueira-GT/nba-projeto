-- DESCIDA de 0026_great_mordo.sql — GERADO por scripts/gerar-down.mjs, não editar à mão.

ALTER TABLE "eventos_afiliados" DROP CONSTRAINT IF EXISTS "eventos_afiliados_apito_so_em_saida";
ALTER TABLE "eventos_afiliados" DROP CONSTRAINT IF EXISTS "eventos_afiliados_apito_id_apitos_id_fk";
ALTER TABLE "eventos_afiliados" DROP COLUMN IF EXISTS "apito_id";
