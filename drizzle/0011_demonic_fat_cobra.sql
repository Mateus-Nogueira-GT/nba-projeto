CREATE TABLE "cobrancas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"assinatura_id" uuid,
	"provedor" text NOT NULL,
	"cobranca_externa_id" text NOT NULL,
	"status" text NOT NULL,
	"valor_centavos" integer,
	"moeda" text,
	"aprovado_em" timestamp with time zone,
	"ocorrido_em_origem" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cobrancas_provedor_externo_unico" UNIQUE("provedor","cobranca_externa_id")
);
--> statement-breakpoint
CREATE TABLE "direitos_acesso" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"produto" text NOT NULL,
	"origem" text NOT NULL,
	"referencia_origem" text NOT NULL,
	"inicio" timestamp with time zone NOT NULL,
	"fim" timestamp with time zone,
	"revogado_em" timestamp with time zone,
	"motivo_revogacao" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "direitos_acesso_origem_unica" UNIQUE("origem","referencia_origem","produto"),
	CONSTRAINT "direitos_acesso_intervalo_valido" CHECK ("direitos_acesso"."fim" is null or "direitos_acesso"."fim" > "direitos_acesso"."inicio"),
	CONSTRAINT "direitos_acesso_revogacao_tem_motivo" CHECK ("direitos_acesso"."revogado_em" is null or "direitos_acesso"."motivo_revogacao" is not null)
);
--> statement-breakpoint
CREATE TABLE "tentativas_checkout" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"produto" text NOT NULL,
	"provedor" text NOT NULL,
	"referencia_externa" text NOT NULL,
	"chave_idempotencia" text NOT NULL,
	"status" text DEFAULT 'RESERVADA' NOT NULL,
	"assinatura_externa_id" text,
	"url_checkout" text,
	"lease_expira_em" timestamp with time zone,
	"erro_codigo" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tentativas_checkout_referencia_externa_unique" UNIQUE("referencia_externa"),
	CONSTRAINT "tentativas_checkout_chave_idempotencia_unique" UNIQUE("chave_idempotencia"),
	CONSTRAINT "tentativas_checkout_status_valido" CHECK ("tentativas_checkout"."status" in ('RESERVADA', 'CRIANDO', 'AMBIGUA', 'CRIADA', 'FALHA', 'ENCERRADA'))
);
--> statement-breakpoint
CREATE TABLE "tentativas_operacao_conta" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operacao" text NOT NULL,
	"identificador_hash" text NOT NULL,
	"ip" text,
	"sucesso" boolean NOT NULL,
	"tentado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assinaturas" ADD COLUMN "referencia_externa" text;--> statement-breakpoint
ALTER TABLE "assinaturas" ADD COLUMN "produto" text DEFAULT 'NBA_PRO' NOT NULL;--> statement-breakpoint
ALTER TABLE "assinaturas" ADD COLUMN "ocorrido_em_origem" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "assinaturas" ADD COLUMN "cancelamento_solicitado_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "assinaturas" ADD COLUMN "cancelada_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "eventos_pagamento" ADD COLUMN "recurso_tipo" text;--> statement-breakpoint
ALTER TABLE "eventos_pagamento" ADD COLUMN "recurso_externo_id" text;--> statement-breakpoint
ALTER TABLE "eventos_pagamento" ADD COLUMN "ocorrido_em_origem" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cobrancas" ADD CONSTRAINT "cobrancas_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cobrancas" ADD CONSTRAINT "cobrancas_assinatura_id_assinaturas_id_fk" FOREIGN KEY ("assinatura_id") REFERENCES "public"."assinaturas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direitos_acesso" ADD CONSTRAINT "direitos_acesso_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tentativas_checkout" ADD CONSTRAINT "tentativas_checkout_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cobrancas_usuario_idx" ON "cobrancas" USING btree ("usuario_id","atualizado_em");--> statement-breakpoint
CREATE INDEX "direitos_acesso_usuario_ativo_idx" ON "direitos_acesso" USING btree ("usuario_id","produto","revogado_em","inicio","fim");--> statement-breakpoint
CREATE UNIQUE INDEX "tentativas_checkout_aberta_unica" ON "tentativas_checkout" USING btree ("usuario_id","produto") WHERE "tentativas_checkout"."status" in ('RESERVADA', 'CRIANDO', 'AMBIGUA', 'CRIADA');--> statement-breakpoint
CREATE INDEX "tentativas_checkout_reconciliar_idx" ON "tentativas_checkout" USING btree ("status","lease_expira_em","atualizado_em");--> statement-breakpoint
CREATE INDEX "tentativas_operacao_conta_janela_idx" ON "tentativas_operacao_conta" USING btree ("operacao","identificador_hash","tentado_em");--> statement-breakpoint
CREATE INDEX "assinaturas_usuario_produto_idx" ON "assinaturas" USING btree ("usuario_id","produto","atualizado_em");--> statement-breakpoint
ALTER TABLE "assinaturas" ADD CONSTRAINT "assinaturas_referencia_externa_unique" UNIQUE("referencia_externa");