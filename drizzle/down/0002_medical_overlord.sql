-- DESCIDA de 0002_medical_overlord.sql — GERADO por scripts/gerar-down.mjs, não editar à mão.

ALTER TABLE "usuarios" DROP COLUMN IF EXISTS "papel";
ALTER TABLE "sessoes" DROP COLUMN IF EXISTS "ip";
ALTER TABLE "sessoes" DROP COLUMN IF EXISTS "criada_em";
DROP TABLE IF EXISTS "tentativas_login" CASCADE;
DROP TABLE IF EXISTS "eventos_pagamento" CASCADE;
DROP TABLE IF EXISTS "eventos_conta" CASCADE;
DROP TYPE IF EXISTS "public"."tipo_evento_conta" CASCADE;
DROP TYPE IF EXISTS "public"."papel_usuario" CASCADE;
