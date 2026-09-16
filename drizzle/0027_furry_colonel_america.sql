ALTER TABLE "assinaturas" ADD COLUMN "nivel_do_plano" text DEFAULT 'ALL_STAR' NOT NULL;--> statement-breakpoint
ALTER TABLE "assinaturas" ALTER COLUMN "nivel_do_plano" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "assinaturas" ADD COLUMN "modalidade" text DEFAULT 'MENSAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "assinaturas" ALTER COLUMN "modalidade" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "direitos_acesso" ADD COLUMN "nivel_do_plano" text DEFAULT 'ALL_STAR' NOT NULL;--> statement-breakpoint
ALTER TABLE "direitos_acesso" ALTER COLUMN "nivel_do_plano" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "direitos_acesso" ADD COLUMN "modalidade" text;--> statement-breakpoint
ALTER TABLE "assinaturas" ADD CONSTRAINT "assinaturas_nivel_do_plano_valido" CHECK ("assinaturas"."nivel_do_plano" in ('MVP', 'ALL_STAR'));--> statement-breakpoint
ALTER TABLE "assinaturas" ADD CONSTRAINT "assinaturas_modalidade_valida" CHECK ("assinaturas"."modalidade" in ('MENSAL', 'TEMPORADA'));--> statement-breakpoint
ALTER TABLE "direitos_acesso" ADD CONSTRAINT "direitos_acesso_nivel_do_plano_valido" CHECK ("direitos_acesso"."nivel_do_plano" in ('MVP', 'ALL_STAR'));--> statement-breakpoint
ALTER TABLE "direitos_acesso" ADD CONSTRAINT "direitos_acesso_modalidade_valida" CHECK ("direitos_acesso"."modalidade" is null or "direitos_acesso"."modalidade" in ('MENSAL', 'TEMPORADA'));