ALTER TABLE "fire_live_execucoes" ADD COLUMN "estado" text DEFAULT 'RESERVADA' NOT NULL;--> statement-breakpoint
ALTER TABLE "fire_live_execucoes" ADD COLUMN "lease_token" uuid;--> statement-breakpoint
ALTER TABLE "fire_live_execucoes" ADD COLUMN "lease_expira_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "fire_live_execucoes" ADD COLUMN "tentativas_inicio" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "fire_live_execucoes" ADD COLUMN "ultima_tentativa_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "fire_live_execucoes" ADD COLUMN "workflow_iniciado_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "fire_live_execucoes" ADD COLUMN "erro_inicio" text;--> statement-breakpoint
ALTER TABLE "fire_live_execucoes" ADD COLUMN "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
UPDATE "fire_live_execucoes"
SET
	"estado" = CASE
		WHEN "encerrado_em" IS NOT NULL THEN 'ENCERRADA'
		WHEN "run_id" IS NOT NULL THEN 'INICIADA'
		ELSE 'RESERVADA'
	END,
	"lease_token" = CASE
		WHEN "encerrado_em" IS NULL AND "run_id" IS NULL THEN gen_random_uuid()
		ELSE NULL
	END,
	"lease_expira_em" = CASE
		WHEN "encerrado_em" IS NULL AND "run_id" IS NULL THEN now()
		ELSE NULL
	END,
	"tentativas_inicio" = 1,
	"ultima_tentativa_em" = "iniciado_em",
	"workflow_iniciado_em" = CASE WHEN "run_id" IS NOT NULL THEN "iniciado_em" ELSE NULL END,
	"atualizado_em" = COALESCE("encerrado_em", "iniciado_em");--> statement-breakpoint
CREATE INDEX "fire_live_execucoes_lease_idx" ON "fire_live_execucoes" USING btree ("estado","lease_expira_em");--> statement-breakpoint
ALTER TABLE "fire_live_execucoes" ADD CONSTRAINT "fire_live_execucoes_estado_valido" CHECK ("fire_live_execucoes"."estado" in ('RESERVADA', 'INICIADA', 'ENCERRADA', 'FALHOU_AO_INICIAR'));
