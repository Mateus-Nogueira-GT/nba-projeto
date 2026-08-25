-- DESCIDA de 0013_misty_wrecking_crew.sql — GERADO por scripts/gerar-down.mjs, não editar à mão.

ALTER TABLE "jogadores_ocultos" DROP CONSTRAINT IF EXISTS "jogadores_ocultos_jogador_id_jogadores_id_fk";
ALTER TABLE "jogadores_ocultos" DROP CONSTRAINT IF EXISTS "jogadores_ocultos_usuario_id_usuarios_id_fk";
DROP TABLE IF EXISTS "jogadores_ocultos" CASCADE;
