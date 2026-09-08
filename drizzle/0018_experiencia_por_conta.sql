CREATE TABLE "atributos_silenciados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"atributo" "atributo" NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "atributos_silenciados_unico" UNIQUE("usuario_id","atributo")
);
--> statement-breakpoint
CREATE TABLE "jogadores_acompanhados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"jogador_id" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jogadores_acompanhados_unico" UNIQUE("usuario_id","jogador_id")
);
--> statement-breakpoint
CREATE TABLE "jogadores_silenciados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"jogador_id" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jogadores_silenciados_unico" UNIQUE("usuario_id","jogador_id")
);
--> statement-breakpoint
CREATE TABLE "times_acompanhados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"time_id" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "times_acompanhados_unico" UNIQUE("usuario_id","time_id")
);
--> statement-breakpoint
ALTER TABLE "preferencias_usuario" ADD COLUMN "intensidade" text DEFAULT 'PADRAO' NOT NULL;--> statement-breakpoint
ALTER TABLE "preferencias_usuario" ADD COLUMN "som_habilitado" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "preferencias_usuario" ADD COLUMN "volume" integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE "preferencias_usuario" ADD COLUMN "apenas_acompanhados" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "atributos_silenciados" ADD CONSTRAINT "atributos_silenciados_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jogadores_acompanhados" ADD CONSTRAINT "jogadores_acompanhados_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jogadores_acompanhados" ADD CONSTRAINT "jogadores_acompanhados_jogador_id_jogadores_id_fk" FOREIGN KEY ("jogador_id") REFERENCES "public"."jogadores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jogadores_silenciados" ADD CONSTRAINT "jogadores_silenciados_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jogadores_silenciados" ADD CONSTRAINT "jogadores_silenciados_jogador_id_jogadores_id_fk" FOREIGN KEY ("jogador_id") REFERENCES "public"."jogadores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "times_acompanhados" ADD CONSTRAINT "times_acompanhados_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "times_acompanhados" ADD CONSTRAINT "times_acompanhados_time_id_times_id_fk" FOREIGN KEY ("time_id") REFERENCES "public"."times"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preferencias_usuario" ADD CONSTRAINT "preferencias_volume_valido" CHECK ("preferencias_usuario"."volume" BETWEEN 0 AND 100);--> statement-breakpoint
ALTER TABLE "preferencias_usuario" ADD CONSTRAINT "preferencias_intensidade_valida" CHECK ("preferencias_usuario"."intensidade" IN ('REDUZIDAS', 'PADRAO', 'INTENSAS'));