CREATE TABLE "fire_live_execucoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jogo_id" uuid NOT NULL,
	"run_id" text,
	"iniciado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"encerrado_em" timestamp with time zone,
	"motivo_encerramento" text,
	"ciclos" integer DEFAULT 0 NOT NULL,
	"ultimo_estado" jsonb,
	CONSTRAINT "fire_live_execucoes_jogo" UNIQUE("jogo_id")
);
--> statement-breakpoint
CREATE TABLE "greens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jogo_id" uuid NOT NULL,
	"jogador_id" uuid NOT NULL,
	"atributo" "atributo" NOT NULL,
	"nivel_jogador" "nivel_jogador" NOT NULL,
	"marco" smallint NOT NULL,
	"valor" smallint NOT NULL,
	"detectado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "greens_dedup" UNIQUE("jogo_id","jogador_id","atributo","marco")
);
--> statement-breakpoint
ALTER TABLE "fire_live_execucoes" ADD CONSTRAINT "fire_live_execucoes_jogo_id_jogos_id_fk" FOREIGN KEY ("jogo_id") REFERENCES "public"."jogos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "greens" ADD CONSTRAINT "greens_jogo_id_jogos_id_fk" FOREIGN KEY ("jogo_id") REFERENCES "public"."jogos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "greens" ADD CONSTRAINT "greens_jogador_id_jogadores_id_fk" FOREIGN KEY ("jogador_id") REFERENCES "public"."jogadores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fire_live_execucoes_abertas_idx" ON "fire_live_execucoes" USING btree ("encerrado_em");