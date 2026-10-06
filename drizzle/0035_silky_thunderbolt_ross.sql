ALTER TABLE "eventos_afiliados" DROP CONSTRAINT "eventos_afiliados_tipo_valido";--> statement-breakpoint
ALTER TABLE "links_afiliados" DROP CONSTRAINT "links_afiliados_tipo_destino_valido";--> statement-breakpoint
ALTER TABLE "campanhas_afiliados" ALTER COLUMN "oferta_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "campanhas_afiliados" ADD COLUMN "finalidade" text DEFAULT 'CASA' NOT NULL;--> statement-breakpoint
ALTER TABLE "eventos_afiliados" ADD COLUMN "nivel_do_plano" text;--> statement-breakpoint
ALTER TABLE "eventos_afiliados" ADD COLUMN "modalidade" text;--> statement-breakpoint
ALTER TABLE "parceiros_afiliados" ADD COLUMN "tipo" text DEFAULT 'PARCEIRO' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "eventos_afiliados_assinatura_unica" ON "eventos_afiliados" USING btree ("atribuicao_id") WHERE "eventos_afiliados"."tipo" = 'ASSINATURA_NIP';--> statement-breakpoint
CREATE INDEX "links_afiliados_campanha_idx" ON "links_afiliados" USING btree ("campanha_id");--> statement-breakpoint
ALTER TABLE "campanhas_afiliados" ADD CONSTRAINT "campanhas_afiliados_finalidade_valida" CHECK ("campanhas_afiliados"."finalidade" in ('CASA', 'INDICACAO'));--> statement-breakpoint
ALTER TABLE "campanhas_afiliados" ADD CONSTRAINT "campanhas_afiliados_oferta_por_finalidade" CHECK ("campanhas_afiliados"."finalidade" = 'INDICACAO' or "campanhas_afiliados"."oferta_id" is not null);--> statement-breakpoint
ALTER TABLE "eventos_afiliados" ADD CONSTRAINT "eventos_afiliados_assinatura_com_plano" CHECK ("eventos_afiliados"."tipo" <> 'ASSINATURA_NIP' or ("eventos_afiliados"."nivel_do_plano" is not null and "eventos_afiliados"."nivel_do_plano" in ('MVP', 'ALL_STAR') and "eventos_afiliados"."modalidade" is not null and "eventos_afiliados"."modalidade" in ('MENSAL', 'TEMPORADA') and "eventos_afiliados"."atribuicao_id" is not null));--> statement-breakpoint
ALTER TABLE "eventos_afiliados" ADD CONSTRAINT "eventos_afiliados_tipo_valido" CHECK ("eventos_afiliados"."tipo" in ('CLIQUE', 'VISITA_NIP', 'SAIDA_CASA', 'CADASTRO_NIP', 'ASSINATURA_NIP'));--> statement-breakpoint
ALTER TABLE "links_afiliados" ADD CONSTRAINT "links_afiliados_tipo_destino_valido" CHECK ("links_afiliados"."tipo_destino" in ('NIP', 'CASA', 'CADASTRO'));--> statement-breakpoint
ALTER TABLE "parceiros_afiliados" ADD CONSTRAINT "parceiros_afiliados_tipo_valido" CHECK ("parceiros_afiliados"."tipo" in ('PARCEIRO', 'USUARIO'));