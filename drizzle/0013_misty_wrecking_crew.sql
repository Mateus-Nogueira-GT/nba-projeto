CREATE TABLE "jogadores_ocultos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"jogador_id" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jogadores_ocultos_unico" UNIQUE("usuario_id","jogador_id")
);
--> statement-breakpoint
ALTER TABLE "jogadores_ocultos" ADD CONSTRAINT "jogadores_ocultos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jogadores_ocultos" ADD CONSTRAINT "jogadores_ocultos_jogador_id_jogadores_id_fk" FOREIGN KEY ("jogador_id") REFERENCES "public"."jogadores"("id") ON DELETE cascade ON UPDATE no action;