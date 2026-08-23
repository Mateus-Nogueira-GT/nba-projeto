-- DESCIDA de 0010_melted_arclight.sql — GERADO por scripts/gerar-down.mjs, não editar à mão.

ALTER TABLE "push_inscricoes" DROP CONSTRAINT IF EXISTS "push_inscricoes_expiracao_valida";
ALTER TABLE "push_inscricoes" DROP CONSTRAINT IF EXISTS "push_inscricoes_invalidacao_tem_motivo";
ALTER TABLE "push_inscricoes" DROP CONSTRAINT IF EXISTS "push_inscricoes_ativa_tem_dispositivo";
ALTER TABLE "push_inscricoes" DROP CONSTRAINT IF EXISTS "push_inscricoes_dispositivo_usuario_fk";
ALTER TABLE "dispositivos" DROP CONSTRAINT IF EXISTS "dispositivos_id_usuario_unico";
ALTER TABLE "preferencias_notificacao" DROP COLUMN IF EXISTS "atualizado_em";
ALTER TABLE "preferencias_notificacao" DROP COLUMN IF EXISTS "criado_em";
