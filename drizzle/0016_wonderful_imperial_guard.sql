CREATE TABLE "chat_mensagens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"papel" text NOT NULL,
	"texto" text NOT NULL,
	"modelo" text,
	"tokens_entrada" integer DEFAULT 0 NOT NULL,
	"tokens_saida" integer DEFAULT 0 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_chamadas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"perfil" text NOT NULL,
	"modelo" text,
	"tokens_entrada" integer DEFAULT 0 NOT NULL,
	"tokens_saida" integer DEFAULT 0 NOT NULL,
	"ok" boolean NOT NULL,
	"erro" text,
	"duracao_ms" integer DEFAULT 0 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_mensagens" ADD CONSTRAINT "chat_mensagens_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_mensagens_usuario_dia_idx" ON "chat_mensagens" USING btree ("usuario_id","criado_em");--> statement-breakpoint
CREATE INDEX "llm_chamadas_criado_em_idx" ON "llm_chamadas" USING btree ("criado_em");