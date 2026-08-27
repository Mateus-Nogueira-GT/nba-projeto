-- DESCIDA de 0016_wonderful_imperial_guard.sql — GERADO por scripts/gerar-down.mjs, não editar à mão.

DROP INDEX IF EXISTS "llm_chamadas_criado_em_idx";
DROP INDEX IF EXISTS "chat_mensagens_usuario_dia_idx";
ALTER TABLE "chat_mensagens" DROP CONSTRAINT IF EXISTS "chat_mensagens_usuario_id_usuarios_id_fk";
DROP TABLE IF EXISTS "llm_chamadas" CASCADE;
DROP TABLE IF EXISTS "chat_mensagens" CASCADE;
