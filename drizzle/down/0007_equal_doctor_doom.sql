-- DESCIDA de 0007_equal_doctor_doom.sql — GERADO por scripts/gerar-down.mjs, não editar à mão.

ALTER TABLE "fire_live_execucoes" DROP CONSTRAINT IF EXISTS "fire_live_execucoes_estado_valido";
DROP INDEX IF EXISTS "fire_live_execucoes_lease_idx";
ALTER TABLE "fire_live_execucoes" DROP COLUMN IF EXISTS "atualizado_em";
ALTER TABLE "fire_live_execucoes" DROP COLUMN IF EXISTS "erro_inicio";
ALTER TABLE "fire_live_execucoes" DROP COLUMN IF EXISTS "workflow_iniciado_em";
ALTER TABLE "fire_live_execucoes" DROP COLUMN IF EXISTS "ultima_tentativa_em";
ALTER TABLE "fire_live_execucoes" DROP COLUMN IF EXISTS "tentativas_inicio";
ALTER TABLE "fire_live_execucoes" DROP COLUMN IF EXISTS "lease_expira_em";
ALTER TABLE "fire_live_execucoes" DROP COLUMN IF EXISTS "lease_token";
ALTER TABLE "fire_live_execucoes" DROP COLUMN IF EXISTS "estado";
