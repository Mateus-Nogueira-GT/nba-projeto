-- DESCIDA de 0021_flashy_texas_twister.sql — GERADO por scripts/gerar-down.mjs, não editar à mão.

ALTER TABLE "acordos_afiliados" DROP CONSTRAINT IF EXISTS "acordos_afiliados_moeda_valida";
ALTER TABLE "itens_importacao_afiliados" DROP CONSTRAINT IF EXISTS "itens_importacao_afiliados_acordo_id_acordos_afiliados_id_fk";
ALTER TABLE "itens_importacao_afiliados" DROP CONSTRAINT IF EXISTS "itens_importacao_afiliados_atribuicao_id_atribuicoes_afiliados_id_fk";
ALTER TABLE "comissoes_afiliados" DROP CONSTRAINT IF EXISTS "comissoes_afiliados_ajuste_de_id_comissoes_afiliados_id_fk";
ALTER TABLE "lotes_importacao_afiliados" DROP COLUMN IF EXISTS "resumo_previa";
ALTER TABLE "itens_importacao_afiliados" DROP COLUMN IF EXISTS "acordo_id";
ALTER TABLE "itens_importacao_afiliados" DROP COLUMN IF EXISTS "atribuicao_id";
ALTER TABLE "acordos_afiliados" DROP COLUMN IF EXISTS "moeda";
