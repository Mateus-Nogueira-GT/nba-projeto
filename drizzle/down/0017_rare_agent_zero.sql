-- DESCIDA de 0017_rare_agent_zero.sql — GERADO por scripts/gerar-down.mjs, não editar à mão.

ALTER TABLE "preferencias_usuario" DROP CONSTRAINT IF EXISTS "preferencias_usuario_usuario_id_usuarios_id_fk";
DROP TABLE IF EXISTS "preferencias_usuario" CASCADE;
