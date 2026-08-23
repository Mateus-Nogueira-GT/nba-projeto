CREATE TABLE "push_inscricoes_auditoria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inscricao_id" uuid,
	"acao" text NOT NULL,
	"usuario_anterior_id" uuid,
	"usuario_atual_id" uuid,
	"dispositivo_anterior_id" uuid,
	"dispositivo_atual_id" uuid,
	"ocorrido_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "push_inscricoes" ADD COLUMN "expira_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "push_inscricoes" ADD COLUMN "invalidada_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "push_inscricoes" ADD COLUMN "motivo_invalidacao" text;--> statement-breakpoint
ALTER TABLE "push_inscricoes" ADD COLUMN "criado_em" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "push_inscricoes" ADD COLUMN "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "push_inscricoes_auditoria" ADD CONSTRAINT "push_inscricoes_auditoria_inscricao_id_push_inscricoes_id_fk" FOREIGN KEY ("inscricao_id") REFERENCES "public"."push_inscricoes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_inscricoes_auditoria" ADD CONSTRAINT "push_inscricoes_auditoria_usuario_anterior_id_usuarios_id_fk" FOREIGN KEY ("usuario_anterior_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_inscricoes_auditoria" ADD CONSTRAINT "push_inscricoes_auditoria_usuario_atual_id_usuarios_id_fk" FOREIGN KEY ("usuario_atual_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_inscricoes_auditoria" ADD CONSTRAINT "push_inscricoes_auditoria_dispositivo_anterior_id_dispositivos_id_fk" FOREIGN KEY ("dispositivo_anterior_id") REFERENCES "public"."dispositivos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_inscricoes_auditoria" ADD CONSTRAINT "push_inscricoes_auditoria_dispositivo_atual_id_dispositivos_id_fk" FOREIGN KEY ("dispositivo_atual_id") REFERENCES "public"."dispositivos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "push_inscricoes_auditoria_inscricao_idx" ON "push_inscricoes_auditoria" USING btree ("inscricao_id","ocorrido_em");--> statement-breakpoint
CREATE INDEX "push_inscricoes_fanout_idx" ON "push_inscricoes" USING btree ("criado_em","id");--> statement-breakpoint
CREATE INDEX "push_inscricoes_dispositivo_idx" ON "push_inscricoes" USING btree ("dispositivo_id","invalidada_em");