ALTER TABLE "tentativas_checkout" ADD COLUMN "nivel_do_plano" text DEFAULT 'MVP' NOT NULL;--> statement-breakpoint
ALTER TABLE "tentativas_checkout" ALTER COLUMN "nivel_do_plano" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "tentativas_checkout" ADD COLUMN "modalidade" text DEFAULT 'MENSAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "tentativas_checkout" ALTER COLUMN "modalidade" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "tentativas_checkout" ADD CONSTRAINT "tentativas_checkout_nivel_do_plano_valido" CHECK ("tentativas_checkout"."nivel_do_plano" in ('MVP', 'ALL_STAR'));--> statement-breakpoint
ALTER TABLE "tentativas_checkout" ADD CONSTRAINT "tentativas_checkout_modalidade_valida" CHECK ("tentativas_checkout"."modalidade" in ('MENSAL', 'TEMPORADA'));