-- DESCIDA de 0025_red_red_skull.sql — GERADO por scripts/gerar-down.mjs, não editar à mão.

ALTER TABLE "entradas_realizadas" DROP CONSTRAINT IF EXISTS "entradas_realizadas_jogador_id_jogadores_id_fk";
ALTER TABLE "entradas_realizadas" DROP CONSTRAINT IF EXISTS "entradas_realizadas_usuario_id_usuarios_id_fk";
DROP TABLE IF EXISTS "entradas_realizadas" CASCADE;
