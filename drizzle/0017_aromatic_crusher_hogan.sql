CREATE TABLE "mapa_jogadores_casa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"casa_id" uuid NOT NULL,
	"nome_na_casa" text NOT NULL,
	"jogador_id" uuid,
	"confirmado" boolean DEFAULT false NOT NULL,
	CONSTRAINT "mapa_jogadores_casa_unico" UNIQUE("casa_id","nome_na_casa")
);
--> statement-breakpoint
ALTER TABLE "mapa_jogadores_casa" ADD CONSTRAINT "mapa_jogadores_casa_casa_id_casas_id_fk" FOREIGN KEY ("casa_id") REFERENCES "public"."casas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mapa_jogadores_casa" ADD CONSTRAINT "mapa_jogadores_casa_jogador_id_jogadores_id_fk" FOREIGN KEY ("jogador_id") REFERENCES "public"."jogadores"("id") ON DELETE no action ON UPDATE no action;