-- DESCIDA de 0017_aromatic_crusher_hogan.sql — GERADO por scripts/gerar-down.mjs, não editar à mão.

ALTER TABLE "mapa_jogadores_casa" DROP CONSTRAINT IF EXISTS "mapa_jogadores_casa_jogador_id_jogadores_id_fk";
ALTER TABLE "mapa_jogadores_casa" DROP CONSTRAINT IF EXISTS "mapa_jogadores_casa_casa_id_casas_id_fk";
DROP TABLE IF EXISTS "mapa_jogadores_casa" CASCADE;
