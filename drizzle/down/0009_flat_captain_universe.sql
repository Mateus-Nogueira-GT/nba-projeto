-- DESCIDA de 0009_flat_captain_universe.sql — GERADO por scripts/gerar-down.mjs, não editar à mão.

DROP INDEX IF EXISTS "push_inscricoes_dispositivo_idx";
DROP INDEX IF EXISTS "push_inscricoes_fanout_idx";
DROP INDEX IF EXISTS "push_inscricoes_auditoria_inscricao_idx";
ALTER TABLE "push_inscricoes_auditoria" DROP CONSTRAINT IF EXISTS "push_inscricoes_auditoria_dispositivo_atual_id_dispositivos_id_fk";
ALTER TABLE "push_inscricoes_auditoria" DROP CONSTRAINT IF EXISTS "push_inscricoes_auditoria_dispositivo_anterior_id_dispositivos_id_fk";
ALTER TABLE "push_inscricoes_auditoria" DROP CONSTRAINT IF EXISTS "push_inscricoes_auditoria_usuario_atual_id_usuarios_id_fk";
ALTER TABLE "push_inscricoes_auditoria" DROP CONSTRAINT IF EXISTS "push_inscricoes_auditoria_usuario_anterior_id_usuarios_id_fk";
ALTER TABLE "push_inscricoes_auditoria" DROP CONSTRAINT IF EXISTS "push_inscricoes_auditoria_inscricao_id_push_inscricoes_id_fk";
ALTER TABLE "push_inscricoes" DROP COLUMN IF EXISTS "atualizado_em";
ALTER TABLE "push_inscricoes" DROP COLUMN IF EXISTS "criado_em";
ALTER TABLE "push_inscricoes" DROP COLUMN IF EXISTS "motivo_invalidacao";
ALTER TABLE "push_inscricoes" DROP COLUMN IF EXISTS "invalidada_em";
ALTER TABLE "push_inscricoes" DROP COLUMN IF EXISTS "expira_em";
DROP TABLE IF EXISTS "push_inscricoes_auditoria" CASCADE;
