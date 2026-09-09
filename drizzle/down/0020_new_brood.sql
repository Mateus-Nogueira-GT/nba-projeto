-- DESCIDA de 0020_new_brood.sql — GERADO por scripts/gerar-down.mjs, não editar à mão.

ALTER TABLE "comissoes_afiliados" DROP CONSTRAINT IF EXISTS "comissoes_afiliados_valores_validos";
ALTER TABLE "comissoes_afiliados" DROP CONSTRAINT IF EXISTS "comissoes_afiliados_origem_valida";
ALTER TABLE "comissoes_afiliados" ALTER COLUMN "item_importacao_id" SET NOT NULL;
ALTER TABLE "comissoes_afiliados" ADD CONSTRAINT "comissoes_afiliados_valores_validos" CHECK ("base_nip_centavos" >= 0 and "parcela_parceiro_centavos" >= 0 and "percentual_pontos_base" between 0 and 10000);
