-- DESCIDA de 0023_common_sentinel.sql — GERADO por scripts/gerar-down.mjs, não editar à mão.

DROP INDEX IF EXISTS "redefinicoes_senha_usuario_idx";
ALTER TABLE "redefinicoes_senha" DROP CONSTRAINT IF EXISTS "redefinicoes_senha_criada_por_id_usuarios_id_fk";
ALTER TABLE "redefinicoes_senha" DROP CONSTRAINT IF EXISTS "redefinicoes_senha_usuario_id_usuarios_id_fk";
DROP TABLE IF EXISTS "redefinicoes_senha" CASCADE;
