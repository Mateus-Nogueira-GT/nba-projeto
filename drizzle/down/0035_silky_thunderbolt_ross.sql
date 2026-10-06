-- DESCIDA de 0035_silky_thunderbolt_ross.sql — GERADO por scripts/gerar-down.mjs, não editar à mão.

ALTER TABLE "parceiros_afiliados" DROP CONSTRAINT IF EXISTS "parceiros_afiliados_tipo_valido";
ALTER TABLE "links_afiliados" DROP CONSTRAINT IF EXISTS "links_afiliados_tipo_destino_valido";
ALTER TABLE "eventos_afiliados" DROP CONSTRAINT IF EXISTS "eventos_afiliados_tipo_valido";
ALTER TABLE "eventos_afiliados" DROP CONSTRAINT IF EXISTS "eventos_afiliados_assinatura_com_plano";
ALTER TABLE "campanhas_afiliados" DROP CONSTRAINT IF EXISTS "campanhas_afiliados_oferta_por_finalidade";
ALTER TABLE "campanhas_afiliados" DROP CONSTRAINT IF EXISTS "campanhas_afiliados_finalidade_valida";
DROP INDEX IF EXISTS "links_afiliados_campanha_idx";
DROP INDEX IF EXISTS "eventos_afiliados_assinatura_unica";
ALTER TABLE "parceiros_afiliados" DROP COLUMN IF EXISTS "tipo";
ALTER TABLE "eventos_afiliados" DROP COLUMN IF EXISTS "modalidade";
ALTER TABLE "eventos_afiliados" DROP COLUMN IF EXISTS "nivel_do_plano";
ALTER TABLE "campanhas_afiliados" DROP COLUMN IF EXISTS "finalidade";
ALTER TABLE "campanhas_afiliados" ALTER COLUMN "oferta_id" SET NOT NULL;
ALTER TABLE "links_afiliados" ADD CONSTRAINT "links_afiliados_tipo_destino_valido" CHECK ("links_afiliados"."tipo_destino" in ('NIP', 'CASA'));
ALTER TABLE "eventos_afiliados" ADD CONSTRAINT "eventos_afiliados_tipo_valido" CHECK ("eventos_afiliados"."tipo" in ('CLIQUE', 'VISITA_NIP', 'SAIDA_CASA', 'CADASTRO_NIP'));
