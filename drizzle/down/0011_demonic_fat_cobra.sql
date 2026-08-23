-- DESCIDA de 0011_demonic_fat_cobra.sql — GERADO por scripts/gerar-down.mjs, não editar à mão.

ALTER TABLE "assinaturas" DROP CONSTRAINT IF EXISTS "assinaturas_referencia_externa_unique";
DROP INDEX IF EXISTS "assinaturas_usuario_produto_idx";
DROP INDEX IF EXISTS "tentativas_operacao_conta_janela_idx";
DROP INDEX IF EXISTS "tentativas_checkout_reconciliar_idx";
DROP INDEX IF EXISTS "tentativas_checkout_aberta_unica";
DROP INDEX IF EXISTS "direitos_acesso_usuario_ativo_idx";
DROP INDEX IF EXISTS "cobrancas_usuario_idx";
ALTER TABLE "tentativas_checkout" DROP CONSTRAINT IF EXISTS "tentativas_checkout_usuario_id_usuarios_id_fk";
ALTER TABLE "direitos_acesso" DROP CONSTRAINT IF EXISTS "direitos_acesso_usuario_id_usuarios_id_fk";
ALTER TABLE "cobrancas" DROP CONSTRAINT IF EXISTS "cobrancas_assinatura_id_assinaturas_id_fk";
ALTER TABLE "cobrancas" DROP CONSTRAINT IF EXISTS "cobrancas_usuario_id_usuarios_id_fk";
ALTER TABLE "eventos_pagamento" DROP COLUMN IF EXISTS "ocorrido_em_origem";
ALTER TABLE "eventos_pagamento" DROP COLUMN IF EXISTS "recurso_externo_id";
ALTER TABLE "eventos_pagamento" DROP COLUMN IF EXISTS "recurso_tipo";
ALTER TABLE "assinaturas" DROP COLUMN IF EXISTS "cancelada_em";
ALTER TABLE "assinaturas" DROP COLUMN IF EXISTS "cancelamento_solicitado_em";
ALTER TABLE "assinaturas" DROP COLUMN IF EXISTS "ocorrido_em_origem";
ALTER TABLE "assinaturas" DROP COLUMN IF EXISTS "produto";
ALTER TABLE "assinaturas" DROP COLUMN IF EXISTS "referencia_externa";
DROP TABLE IF EXISTS "tentativas_operacao_conta" CASCADE;
DROP TABLE IF EXISTS "tentativas_checkout" CASCADE;
DROP TABLE IF EXISTS "direitos_acesso" CASCADE;
DROP TABLE IF EXISTS "cobrancas" CASCADE;
