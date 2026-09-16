-- DESCIDA de 0027_furry_colonel_america.sql — GERADO por scripts/gerar-down.mjs, não editar à mão.

ALTER TABLE "direitos_acesso" DROP CONSTRAINT IF EXISTS "direitos_acesso_modalidade_valida";
ALTER TABLE "direitos_acesso" DROP CONSTRAINT IF EXISTS "direitos_acesso_nivel_do_plano_valido";
ALTER TABLE "assinaturas" DROP CONSTRAINT IF EXISTS "assinaturas_modalidade_valida";
ALTER TABLE "assinaturas" DROP CONSTRAINT IF EXISTS "assinaturas_nivel_do_plano_valido";
ALTER TABLE "direitos_acesso" DROP COLUMN IF EXISTS "modalidade";
ALTER TABLE "direitos_acesso" DROP COLUMN IF EXISTS "nivel_do_plano";
ALTER TABLE "assinaturas" DROP COLUMN IF EXISTS "modalidade";
ALTER TABLE "assinaturas" DROP COLUMN IF EXISTS "nivel_do_plano";
