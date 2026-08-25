CREATE TABLE "identidades_jogador" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jogador_id" uuid NOT NULL,
	"provedor" text NOT NULL,
	"id_externo" text NOT NULL,
	CONSTRAINT "identidades_jogador_unica" UNIQUE("provedor","id_externo")
);
--> statement-breakpoint
ALTER TABLE "jogos" ADD COLUMN "data_jogo" date GENERATED ALWAYS AS (((data_hora_utc AT TIME ZONE 'UTC')::date)) STORED NOT NULL;--> statement-breakpoint
ALTER TABLE "identidades_jogador" ADD CONSTRAINT "identidades_jogador_jogador_id_jogadores_id_fk" FOREIGN KEY ("jogador_id") REFERENCES "public"."jogadores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jogos" ADD CONSTRAINT "jogos_chave_natural" UNIQUE("data_jogo","time_casa_id","time_visitante_id");