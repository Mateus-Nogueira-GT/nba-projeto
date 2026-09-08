-- DESCIDA de 0018_experiencia_por_conta.sql — GERADO por scripts/gerar-down.mjs, não editar à mão.

ALTER TABLE "preferencias_usuario" DROP CONSTRAINT IF EXISTS "preferencias_intensidade_valida";
ALTER TABLE "preferencias_usuario" DROP CONSTRAINT IF EXISTS "preferencias_volume_valido";
ALTER TABLE "times_acompanhados" DROP CONSTRAINT IF EXISTS "times_acompanhados_time_id_times_id_fk";
ALTER TABLE "times_acompanhados" DROP CONSTRAINT IF EXISTS "times_acompanhados_usuario_id_usuarios_id_fk";
ALTER TABLE "jogadores_silenciados" DROP CONSTRAINT IF EXISTS "jogadores_silenciados_jogador_id_jogadores_id_fk";
ALTER TABLE "jogadores_silenciados" DROP CONSTRAINT IF EXISTS "jogadores_silenciados_usuario_id_usuarios_id_fk";
ALTER TABLE "jogadores_acompanhados" DROP CONSTRAINT IF EXISTS "jogadores_acompanhados_jogador_id_jogadores_id_fk";
ALTER TABLE "jogadores_acompanhados" DROP CONSTRAINT IF EXISTS "jogadores_acompanhados_usuario_id_usuarios_id_fk";
ALTER TABLE "atributos_silenciados" DROP CONSTRAINT IF EXISTS "atributos_silenciados_usuario_id_usuarios_id_fk";
ALTER TABLE "preferencias_usuario" DROP COLUMN IF EXISTS "apenas_acompanhados";
ALTER TABLE "preferencias_usuario" DROP COLUMN IF EXISTS "volume";
ALTER TABLE "preferencias_usuario" DROP COLUMN IF EXISTS "som_habilitado";
ALTER TABLE "preferencias_usuario" DROP COLUMN IF EXISTS "intensidade";
DROP TABLE IF EXISTS "times_acompanhados" CASCADE;
DROP TABLE IF EXISTS "jogadores_silenciados" CASCADE;
DROP TABLE IF EXISTS "jogadores_acompanhados" CASCADE;
DROP TABLE IF EXISTS "atributos_silenciados" CASCADE;
