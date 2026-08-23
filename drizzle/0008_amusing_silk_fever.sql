CREATE TABLE "identidades_jogo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jogo_id" uuid NOT NULL,
	"provedor" text NOT NULL,
	"id_externo" text NOT NULL,
	"capturado_em" timestamp with time zone,
	"origem_atualizada_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "identidades_jogo_externa_unica" UNIQUE("provedor","id_externo"),
	CONSTRAINT "identidades_jogo_provedor_unico" UNIQUE("jogo_id","provedor")
);
--> statement-breakpoint
CREATE TABLE "checkpoints_ingestao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job" text NOT NULL,
	"janela_inicio" date NOT NULL,
	"janela_fim" date NOT NULL,
	"temporada" text NOT NULL,
	"provedor" text NOT NULL,
	"cursor_json" jsonb,
	"ultimo_id_externo" text,
	"data_referencia" date,
	"concluido" boolean DEFAULT false NOT NULL,
	"execucao_id" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checkpoints_ingestao_particao_unica" UNIQUE("job","janela_inicio","janela_fim","temporada","provedor"),
	CONSTRAINT "checkpoints_ingestao_janela_valida" CHECK ("checkpoints_ingestao"."janela_fim" >= "checkpoints_ingestao"."janela_inicio")
);
--> statement-breakpoint
CREATE TABLE "conflitos_identidade_jogador" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provedor" text NOT NULL,
	"id_externo" text NOT NULL,
	"nome_externo" text NOT NULL,
	"jogador_candidato_id" uuid,
	"jogador_resolvido_id" uuid,
	"motivo" text NOT NULL,
	"estado" text DEFAULT 'PENDENTE' NOT NULL,
	"payload_hash" text,
	"ocorrencias" integer DEFAULT 1 NOT NULL,
	"resolvido_por" text,
	"primeira_ocorrencia_em" timestamp with time zone DEFAULT now() NOT NULL,
	"ultima_ocorrencia_em" timestamp with time zone DEFAULT now() NOT NULL,
	"resolvido_em" timestamp with time zone,
	CONSTRAINT "conflitos_jogador_identidade_unica" UNIQUE("provedor","id_externo"),
	CONSTRAINT "conflitos_jogador_ocorrencias_validas" CHECK ("conflitos_identidade_jogador"."ocorrencias" > 0),
	CONSTRAINT "conflitos_jogador_estado_valido" CHECK ("conflitos_identidade_jogador"."estado" in ('PENDENTE', 'RESOLVIDO', 'IGNORADO'))
);
--> statement-breakpoint
CREATE TABLE "conflitos_identidade_jogo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provedor" text NOT NULL,
	"id_externo" text NOT NULL,
	"data_referencia" date NOT NULL,
	"time_casa_sigla" text NOT NULL,
	"time_visitante_sigla" text NOT NULL,
	"jogo_candidato_id" uuid,
	"jogo_resolvido_id" uuid,
	"motivo" text NOT NULL,
	"estado" text DEFAULT 'PENDENTE' NOT NULL,
	"payload_hash" text,
	"ocorrencias" integer DEFAULT 1 NOT NULL,
	"resolvido_por" text,
	"primeira_ocorrencia_em" timestamp with time zone DEFAULT now() NOT NULL,
	"ultima_ocorrencia_em" timestamp with time zone DEFAULT now() NOT NULL,
	"resolvido_em" timestamp with time zone,
	CONSTRAINT "conflitos_jogo_identidade_unica" UNIQUE("provedor","id_externo"),
	CONSTRAINT "conflitos_jogo_ocorrencias_validas" CHECK ("conflitos_identidade_jogo"."ocorrencias" > 0),
	CONSTRAINT "conflitos_jogo_estado_valido" CHECK ("conflitos_identidade_jogo"."estado" in ('PENDENTE', 'RESOLVIDO', 'IGNORADO'))
);
--> statement-breakpoint
CREATE TABLE "execucoes_ingestao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job" text NOT NULL,
	"janela_inicio" date NOT NULL,
	"janela_fim" date NOT NULL,
	"temporada" text NOT NULL,
	"origem" text NOT NULL,
	"estado" text DEFAULT 'RESERVADA' NOT NULL,
	"lease_token" uuid,
	"tentativa" integer DEFAULT 1 NOT NULL,
	"fontes_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"contagens_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dado_origem_mais_recente_em" timestamp with time zone,
	"erro" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"iniciado_em" timestamp with time zone,
	"finalizado_em" timestamp with time zone,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "execucoes_ingestao_janela_valida" CHECK ("execucoes_ingestao"."janela_fim" >= "execucoes_ingestao"."janela_inicio"),
	CONSTRAINT "execucoes_ingestao_tentativa_valida" CHECK ("execucoes_ingestao"."tentativa" > 0),
	CONSTRAINT "execucoes_ingestao_origem_valida" CHECK ("execucoes_ingestao"."origem" in ('CRON', 'WORKFLOW', 'CLI')),
	CONSTRAINT "execucoes_ingestao_estado_valido" CHECK ("execucoes_ingestao"."estado" in ('RESERVADA', 'EXECUTANDO', 'SUCESSO', 'PARCIAL', 'FALHA', 'IGNORADA'))
);
--> statement-breakpoint
CREATE TABLE "locks_ingestao" (
	"chave" text PRIMARY KEY NOT NULL,
	"execucao_id" uuid NOT NULL,
	"lease_token" uuid NOT NULL,
	"lease_expira_em" timestamp with time zone NOT NULL,
	"tentativas" integer DEFAULT 1 NOT NULL,
	"adquirido_em" timestamp with time zone DEFAULT now() NOT NULL,
	"renovado_em" timestamp with time zone,
	"liberado_em" timestamp with time zone,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "locks_ingestao_tentativas_validas" CHECK ("locks_ingestao"."tentativas" > 0)
);
--> statement-breakpoint
ALTER TABLE "classificacao" ADD COLUMN "capturado_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "classificacao" ADD COLUMN "origem_atualizada_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "estatisticas_jogo" ADD COLUMN "capturado_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "estatisticas_jogo" ADD COLUMN "origem_atualizada_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "estatisticas_quarto" ADD COLUMN "capturado_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "estatisticas_quarto" ADD COLUMN "origem_atualizada_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "estatisticas_time_jogo" ADD COLUMN "capturado_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "estatisticas_time_jogo" ADD COLUMN "origem_atualizada_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "jogos" ADD COLUMN "data_referencia" date;--> statement-breakpoint
UPDATE "jogos" SET "data_referencia" = "data_jogo" WHERE "data_referencia" IS NULL;--> statement-breakpoint
ALTER TABLE "jogos" ALTER COLUMN "data_referencia" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "jogos" ADD COLUMN "capturado_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "jogos" ADD COLUMN "origem_atualizada_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lesoes_escalacao" ADD COLUMN "capturado_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lesoes_escalacao" ADD COLUMN "origem_atualizada_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "identidades_jogo" ADD CONSTRAINT "identidades_jogo_jogo_id_jogos_id_fk" FOREIGN KEY ("jogo_id") REFERENCES "public"."jogos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkpoints_ingestao" ADD CONSTRAINT "checkpoints_ingestao_execucao_id_execucoes_ingestao_id_fk" FOREIGN KEY ("execucao_id") REFERENCES "public"."execucoes_ingestao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conflitos_identidade_jogador" ADD CONSTRAINT "conflitos_identidade_jogador_jogador_candidato_id_jogadores_id_fk" FOREIGN KEY ("jogador_candidato_id") REFERENCES "public"."jogadores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conflitos_identidade_jogador" ADD CONSTRAINT "conflitos_identidade_jogador_jogador_resolvido_id_jogadores_id_fk" FOREIGN KEY ("jogador_resolvido_id") REFERENCES "public"."jogadores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conflitos_identidade_jogo" ADD CONSTRAINT "conflitos_identidade_jogo_jogo_candidato_id_jogos_id_fk" FOREIGN KEY ("jogo_candidato_id") REFERENCES "public"."jogos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conflitos_identidade_jogo" ADD CONSTRAINT "conflitos_identidade_jogo_jogo_resolvido_id_jogos_id_fk" FOREIGN KEY ("jogo_resolvido_id") REFERENCES "public"."jogos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locks_ingestao" ADD CONSTRAINT "locks_ingestao_execucao_id_execucoes_ingestao_id_fk" FOREIGN KEY ("execucao_id") REFERENCES "public"."execucoes_ingestao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conflitos_jogador_estado_idx" ON "conflitos_identidade_jogador" USING btree ("estado","ultima_ocorrencia_em");--> statement-breakpoint
CREATE INDEX "conflitos_jogo_estado_idx" ON "conflitos_identidade_jogo" USING btree ("estado","ultima_ocorrencia_em");--> statement-breakpoint
CREATE INDEX "execucoes_ingestao_job_janela_idx" ON "execucoes_ingestao" USING btree ("job","janela_inicio","janela_fim");--> statement-breakpoint
CREATE INDEX "execucoes_ingestao_estado_idx" ON "execucoes_ingestao" USING btree ("estado","criado_em");--> statement-breakpoint
CREATE INDEX "locks_ingestao_lease_idx" ON "locks_ingestao" USING btree ("lease_expira_em","liberado_em");--> statement-breakpoint
CREATE INDEX "jogos_referencia_status_idx" ON "jogos" USING btree ("data_referencia","status","data_hora_utc");--> statement-breakpoint
ALTER TABLE "jogos" ADD CONSTRAINT "jogos_chave_referencia" UNIQUE("data_referencia","time_casa_id","time_visitante_id");
