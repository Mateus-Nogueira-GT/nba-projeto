CREATE TABLE "entradas_realizadas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"data_referencia" text NOT NULL,
	"jogador_id" uuid NOT NULL,
	"atributo" "atributo" NOT NULL,
	"linha" smallint NOT NULL,
	"unidades" numeric(6, 2) NOT NULL,
	"odd" numeric(6, 2),
	"registrada_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entradas_realizadas_unica" UNIQUE("usuario_id","data_referencia","jogador_id","atributo","linha")
);
--> statement-breakpoint
ALTER TABLE "entradas_realizadas" ADD CONSTRAINT "entradas_realizadas_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entradas_realizadas" ADD CONSTRAINT "entradas_realizadas_jogador_id_jogadores_id_fk" FOREIGN KEY ("jogador_id") REFERENCES "public"."jogadores"("id") ON DELETE no action ON UPDATE no action;