ALTER TABLE "acordos_afiliados" ADD COLUMN "moeda" text NOT NULL;--> statement-breakpoint
ALTER TABLE "itens_importacao_afiliados" ADD COLUMN "atribuicao_id" uuid;--> statement-breakpoint
ALTER TABLE "itens_importacao_afiliados" ADD COLUMN "acordo_id" uuid;--> statement-breakpoint
ALTER TABLE "lotes_importacao_afiliados" ADD COLUMN "resumo_previa" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "comissoes_afiliados" ADD CONSTRAINT "comissoes_afiliados_ajuste_de_id_comissoes_afiliados_id_fk" FOREIGN KEY ("ajuste_de_id") REFERENCES "public"."comissoes_afiliados"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itens_importacao_afiliados" ADD CONSTRAINT "itens_importacao_afiliados_atribuicao_id_atribuicoes_afiliados_id_fk" FOREIGN KEY ("atribuicao_id") REFERENCES "public"."atribuicoes_afiliados"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itens_importacao_afiliados" ADD CONSTRAINT "itens_importacao_afiliados_acordo_id_acordos_afiliados_id_fk" FOREIGN KEY ("acordo_id") REFERENCES "public"."acordos_afiliados"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acordos_afiliados" ADD CONSTRAINT "acordos_afiliados_moeda_valida" CHECK ("acordos_afiliados"."moeda" ~ '^[A-Z]{3}$');