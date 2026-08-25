CREATE TYPE "public"."papel_usuario" AS ENUM('USUARIO', 'ADMIN');--> statement-breakpoint
CREATE TYPE "public"."tipo_evento_conta" AS ENUM('LOGIN', 'LOGIN_FALHOU', 'SESSAO_ENCERRADA', 'USO_SIMULTANEO', 'BLOQUEIO', 'DESBLOQUEIO');--> statement-breakpoint
CREATE TABLE "eventos_conta" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid,
	"tipo" "tipo_evento_conta" NOT NULL,
	"detalhe" text,
	"ip" text,
	"contexto" jsonb,
	"ocorrido_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eventos_pagamento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provedor" text NOT NULL,
	"evento_externo_id" text NOT NULL,
	"tipo" text NOT NULL,
	"referencia_externa" text,
	"carga_json" jsonb,
	"processado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "eventos_pagamento_unico" UNIQUE("provedor","evento_externo_id")
);
--> statement-breakpoint
CREATE TABLE "tentativas_login" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identificador" text NOT NULL,
	"ip" text,
	"sucesso" boolean NOT NULL,
	"tentado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sessoes" ADD COLUMN "criada_em" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "sessoes" ADD COLUMN "ip" text;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "papel" "papel_usuario" DEFAULT 'USUARIO' NOT NULL;--> statement-breakpoint
ALTER TABLE "eventos_conta" ADD CONSTRAINT "eventos_conta_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eventos_conta_usuario_idx" ON "eventos_conta" USING btree ("usuario_id","ocorrido_em");--> statement-breakpoint
CREATE INDEX "tentativas_login_janela_idx" ON "tentativas_login" USING btree ("identificador","tentado_em");--> statement-breakpoint
CREATE INDEX "sessoes_antiguidade_idx" ON "sessoes" USING btree ("usuario_id","criada_em");