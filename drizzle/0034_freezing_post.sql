CREATE TABLE "apitos_retroativos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"temporada" text NOT NULL,
	"data_referencia" date NOT NULL,
	"niveis_versao_id" uuid NOT NULL,
	"ruleset_versao" text NOT NULL,
	"jogo_id" uuid NOT NULL,
	"jogador_id" uuid NOT NULL,
	"atributo" "atributo" NOT NULL,
	"estrategia" "estrategia" NOT NULL,
	"metodo" "metodo",
	"nivel_jogador" "nivel_jogador" NOT NULL,
	"nivel_apito" smallint NOT NULL,
	"turbo" boolean DEFAULT false NOT NULL,
	"modo_fire" boolean DEFAULT false NOT NULL,
	"opd_origem_nivel" smallint,
	"linha" smallint,
	"confianca" numeric(5, 2),
	"alvo_1q" smallint,
	"gerado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "apitos_retroativos_dedup" UNIQUE NULLS NOT DISTINCT("jogo_id","jogador_id","atributo","estrategia","linha")
);
--> statement-breakpoint
CREATE TABLE "feed_retroativo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"temporada" text NOT NULL,
	"data_referencia" date NOT NULL,
	"niveis_versao_id" uuid NOT NULL,
	"conteudo_json" jsonb NOT NULL,
	"hash" text NOT NULL,
	"gerado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feed_retroativo_unico" UNIQUE("temporada","data_referencia")
);
--> statement-breakpoint
CREATE TABLE "greens_retroativos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"temporada" text NOT NULL,
	"data_referencia" date NOT NULL,
	"jogo_id" uuid NOT NULL,
	"jogador_id" uuid NOT NULL,
	"atributo" "atributo" NOT NULL,
	"nivel_jogador" "nivel_jogador" NOT NULL,
	"marco" smallint NOT NULL,
	"valor" smallint NOT NULL,
	CONSTRAINT "greens_retroativos_unico" UNIQUE("jogo_id","jogador_id","atributo","marco")
);
--> statement-breakpoint
ALTER TABLE "apitos_retroativos" ADD CONSTRAINT "apitos_retroativos_niveis_versao_id_niveis_versao_id_fk" FOREIGN KEY ("niveis_versao_id") REFERENCES "public"."niveis_versao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apitos_retroativos" ADD CONSTRAINT "apitos_retroativos_jogo_id_jogos_id_fk" FOREIGN KEY ("jogo_id") REFERENCES "public"."jogos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apitos_retroativos" ADD CONSTRAINT "apitos_retroativos_jogador_id_jogadores_id_fk" FOREIGN KEY ("jogador_id") REFERENCES "public"."jogadores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_retroativo" ADD CONSTRAINT "feed_retroativo_niveis_versao_id_niveis_versao_id_fk" FOREIGN KEY ("niveis_versao_id") REFERENCES "public"."niveis_versao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "greens_retroativos" ADD CONSTRAINT "greens_retroativos_jogo_id_jogos_id_fk" FOREIGN KEY ("jogo_id") REFERENCES "public"."jogos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "greens_retroativos" ADD CONSTRAINT "greens_retroativos_jogador_id_jogadores_id_fk" FOREIGN KEY ("jogador_id") REFERENCES "public"."jogadores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "apitos_retroativos_temporada_data_idx" ON "apitos_retroativos" USING btree ("temporada","data_referencia");--> statement-breakpoint
CREATE INDEX "apitos_retroativos_jogador_idx" ON "apitos_retroativos" USING btree ("jogador_id");--> statement-breakpoint
CREATE INDEX "greens_retroativos_temporada_data_idx" ON "greens_retroativos" USING btree ("temporada","data_referencia");