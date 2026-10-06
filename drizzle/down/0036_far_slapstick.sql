-- DESCIDA de 0036_far_slapstick.sql — GERADO por scripts/gerar-down.mjs, não editar à mão.

ALTER TABLE "jogos" ADD CONSTRAINT "jogos_chave_natural" UNIQUE("data_jogo","time_casa_id","time_visitante_id");
