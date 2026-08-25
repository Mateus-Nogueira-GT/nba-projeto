ALTER TABLE "preferencias_notificacao" ADD COLUMN "criado_em" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "preferencias_notificacao" ADD COLUMN "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
UPDATE "push_inscricoes"
SET "invalidada_em" = now(),
    "motivo_invalidacao" = 'LEGADO_SEM_DISPOSITIVO',
    "atualizado_em" = now()
WHERE "dispositivo_id" IS NULL AND "invalidada_em" IS NULL;--> statement-breakpoint
UPDATE "push_inscricoes" AS p
SET "invalidada_em" = coalesce(p."invalidada_em", now()),
    "motivo_invalidacao" = coalesce(p."motivo_invalidacao", 'LEGADO_VINCULO_INCONSISTENTE'),
    "dispositivo_id" = NULL,
    "atualizado_em" = now()
WHERE p."dispositivo_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "dispositivos" AS d
    WHERE d."id" = p."dispositivo_id" AND d."usuario_id" = p."usuario_id"
  );--> statement-breakpoint
ALTER TABLE "dispositivos" ADD CONSTRAINT "dispositivos_id_usuario_unico" UNIQUE("id","usuario_id");--> statement-breakpoint
ALTER TABLE "push_inscricoes" ADD CONSTRAINT "push_inscricoes_dispositivo_usuario_fk" FOREIGN KEY ("dispositivo_id","usuario_id") REFERENCES "public"."dispositivos"("id","usuario_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_inscricoes" ADD CONSTRAINT "push_inscricoes_ativa_tem_dispositivo" CHECK ("push_inscricoes"."invalidada_em" is not null or "push_inscricoes"."dispositivo_id" is not null);--> statement-breakpoint
ALTER TABLE "push_inscricoes" ADD CONSTRAINT "push_inscricoes_invalidacao_tem_motivo" CHECK ("push_inscricoes"."invalidada_em" is null or "push_inscricoes"."motivo_invalidacao" is not null);--> statement-breakpoint
ALTER TABLE "push_inscricoes" ADD CONSTRAINT "push_inscricoes_expiracao_valida" CHECK ("push_inscricoes"."expira_em" is null or "push_inscricoes"."expira_em" > "push_inscricoes"."criado_em");
