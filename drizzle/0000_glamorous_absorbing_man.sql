CREATE TYPE "public"."atributo" AS ENUM('PONTOS', 'REBOTES', 'ASSISTENCIAS');--> statement-breakpoint
CREATE TYPE "public"."canal_notificacao" AS ENUM('FIRE_LIVE_APITO', 'GREEN', 'LISTA_SECRETA');--> statement-breakpoint
CREATE TYPE "public"."estrategia" AS ENUM('LISTA_SECRETA', 'FIRE_LIVE');--> statement-breakpoint
CREATE TYPE "public"."janela_media" AS ENUM('TEMPORADA', 'ULTIMOS_5', 'ULTIMOS_10');--> statement-breakpoint
CREATE TYPE "public"."metodo" AS ENUM('OSCILACAO', 'OPD');--> statement-breakpoint
CREATE TYPE "public"."nivel_jogador" AS ENUM('MVP', 'ALL_STAR', 'SUPORTE', 'RANDOLA');--> statement-breakpoint
CREATE TYPE "public"."origem_odds" AS ENUM('CASAS', 'TABELA_ESTATICA');--> statement-breakpoint
CREATE TYPE "public"."severidade" AS ENUM('INFO', 'AVISO', 'ERRO', 'CRITICO');--> statement-breakpoint
CREATE TYPE "public"."status_escalacao" AS ENUM('ATIVO', 'FORA', 'DUVIDA', 'PROVAVEL');--> statement-breakpoint
CREATE TYPE "public"."status_jogo" AS ENUM('AGENDADO', 'AO_VIVO', 'ENCERRADO');--> statement-breakpoint
CREATE TYPE "public"."status_ruleset" AS ENUM('provisorio', 'homologado');--> statement-breakpoint
CREATE TYPE "public"."status_usuario" AS ENUM('ATIVO', 'BLOQUEADO');--> statement-breakpoint
CREATE TYPE "public"."tipo_dispositivo" AS ENUM('MOBILE', 'DESKTOP');--> statement-breakpoint
CREATE TYPE "public"."tipo_provedor" AS ENUM('NBA_PRIMARIO', 'NBA_RESERVA', 'CASA');--> statement-breakpoint
CREATE TABLE "classificacao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"temporada" text NOT NULL,
	"time_id" uuid NOT NULL,
	"conferencia" text,
	"vitorias" smallint DEFAULT 0 NOT NULL,
	"derrotas" smallint DEFAULT 0 NOT NULL,
	"posicao" smallint,
	"aproveitamento" numeric(5, 3),
	"sequencia" text,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "classificacao_unica" UNIQUE("temporada","time_id")
);
--> statement-breakpoint
CREATE TABLE "estatisticas_jogo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jogo_id" uuid NOT NULL,
	"jogador_id" uuid NOT NULL,
	"minutos" numeric(5, 2),
	"pontos" smallint DEFAULT 0 NOT NULL,
	"rebotes_total" smallint DEFAULT 0 NOT NULL,
	"rebotes_of" smallint DEFAULT 0 NOT NULL,
	"rebotes_def" smallint DEFAULT 0 NOT NULL,
	"assistencias" smallint DEFAULT 0 NOT NULL,
	"cestas_c" smallint DEFAULT 0 NOT NULL,
	"cestas_t" smallint DEFAULT 0 NOT NULL,
	"dois_c" smallint DEFAULT 0 NOT NULL,
	"dois_t" smallint DEFAULT 0 NOT NULL,
	"tres_c" smallint DEFAULT 0 NOT NULL,
	"tres_t" smallint DEFAULT 0 NOT NULL,
	"lance_c" smallint DEFAULT 0 NOT NULL,
	"lance_t" smallint DEFAULT 0 NOT NULL,
	"roubos" smallint DEFAULT 0 NOT NULL,
	"bloqueios" smallint DEFAULT 0 NOT NULL,
	"turnovers" smallint DEFAULT 0 NOT NULL,
	"faltas" smallint DEFAULT 0 NOT NULL,
	"saldo_quadra" smallint,
	CONSTRAINT "estatisticas_jogo_unica" UNIQUE("jogo_id","jogador_id")
);
--> statement-breakpoint
CREATE TABLE "estatisticas_quarto" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jogo_id" uuid NOT NULL,
	"jogador_id" uuid NOT NULL,
	"quarto" smallint NOT NULL,
	"pontos" smallint DEFAULT 0 NOT NULL,
	"rebotes" smallint DEFAULT 0 NOT NULL,
	"assistencias" smallint DEFAULT 0 NOT NULL,
	"minutos" numeric(5, 2),
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "estatisticas_quarto_unica" UNIQUE("jogo_id","jogador_id","quarto")
);
--> statement-breakpoint
CREATE TABLE "estatisticas_time_jogo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jogo_id" uuid NOT NULL,
	"time_id" uuid NOT NULL,
	"pontos" smallint DEFAULT 0 NOT NULL,
	"pontos_q1" smallint DEFAULT 0 NOT NULL,
	"pontos_q2" smallint DEFAULT 0 NOT NULL,
	"pontos_q3" smallint DEFAULT 0 NOT NULL,
	"pontos_q4" smallint DEFAULT 0 NOT NULL,
	"pontos_prorrogacao" smallint DEFAULT 0 NOT NULL,
	"rebotes_total" smallint DEFAULT 0 NOT NULL,
	"rebotes_of" smallint DEFAULT 0 NOT NULL,
	"rebotes_def" smallint DEFAULT 0 NOT NULL,
	"assistencias" smallint DEFAULT 0 NOT NULL,
	"cestas_c" smallint DEFAULT 0 NOT NULL,
	"cestas_t" smallint DEFAULT 0 NOT NULL,
	"tres_c" smallint DEFAULT 0 NOT NULL,
	"tres_t" smallint DEFAULT 0 NOT NULL,
	"lance_c" smallint DEFAULT 0 NOT NULL,
	"lance_t" smallint DEFAULT 0 NOT NULL,
	"roubos" smallint DEFAULT 0 NOT NULL,
	"bloqueios" smallint DEFAULT 0 NOT NULL,
	"turnovers" smallint DEFAULT 0 NOT NULL,
	"faltas" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "estatisticas_time_jogo_unica" UNIQUE("jogo_id","time_id")
);
--> statement-breakpoint
CREATE TABLE "jogadores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome_completo" text NOT NULL,
	"foto_url" text,
	"posicao" text,
	"altura_cm" smallint,
	"numero_camisa" smallint,
	"time_id" uuid
);
--> statement-breakpoint
CREATE TABLE "jogos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"data_hora_utc" timestamp with time zone NOT NULL,
	"time_casa_id" uuid NOT NULL,
	"time_visitante_id" uuid NOT NULL,
	"status" "status_jogo" DEFAULT 'AGENDADO' NOT NULL,
	"quarto_atual" smallint,
	"tempo_restante" text,
	"placar_casa" smallint,
	"placar_visitante" smallint
);
--> statement-breakpoint
CREATE TABLE "lesoes_escalacao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jogo_id" uuid NOT NULL,
	"jogador_id" uuid NOT NULL,
	"status" "status_escalacao" NOT NULL,
	"motivo" text,
	"confirmado" boolean DEFAULT false NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesoes_escalacao_unica" UNIQUE("jogo_id","jogador_id")
);
--> statement-breakpoint
CREATE TABLE "mapa_jogadores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome_na_lista" text NOT NULL,
	"jogador_id" uuid,
	"provedor" text NOT NULL,
	"provedor_player_id" text,
	"score_similaridade" numeric(5, 4),
	"confirmado_por" text,
	"confirmado_em" timestamp with time zone,
	CONSTRAINT "mapa_jogadores_nome_provedor" UNIQUE("nome_na_lista","provedor")
);
--> statement-breakpoint
CREATE TABLE "medias_jogador" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jogador_id" uuid NOT NULL,
	"temporada" text NOT NULL,
	"janela" "janela_media" NOT NULL,
	"jogos" integer DEFAULT 0 NOT NULL,
	"ppg" numeric(5, 2),
	"rpg" numeric(5, 2),
	"apg" numeric(5, 2),
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "medias_jogador_unica" UNIQUE("jogador_id","temporada","janela")
);
--> statement-breakpoint
CREATE TABLE "times" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sigla" text NOT NULL,
	"nome" text NOT NULL,
	"logo_url" text,
	"conferencia" text,
	CONSTRAINT "times_sigla_unique" UNIQUE("sigla")
);
--> statement-breakpoint
CREATE TABLE "niveis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"niveis_versao_id" uuid NOT NULL,
	"jogador_id" uuid NOT NULL,
	"time_id" uuid NOT NULL,
	"atributo" "atributo" NOT NULL,
	"nivel" "nivel_jogador" NOT NULL,
	"posicao_hierarquia" smallint NOT NULL,
	CONSTRAINT "niveis_unico" UNIQUE("niveis_versao_id","jogador_id","atributo")
);
--> statement-breakpoint
CREATE TABLE "niveis_versao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"versao" text NOT NULL,
	"origem_arquivo" text,
	"importado_por" text,
	"importado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"ativa" boolean DEFAULT false NOT NULL,
	CONSTRAINT "niveis_versao_versao_unique" UNIQUE("versao")
);
--> statement-breakpoint
CREATE TABLE "casas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"tipo_api" text,
	"ativa" boolean DEFAULT true NOT NULL,
	CONSTRAINT "casas_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
CREATE TABLE "mapa_mercados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"casa_id" uuid NOT NULL,
	"nome_mercado_na_casa" text NOT NULL,
	"atributo" "atributo" NOT NULL,
	"confirmado" boolean DEFAULT false NOT NULL,
	CONSTRAINT "mapa_mercados_unico" UNIQUE("casa_id","nome_mercado_na_casa")
);
--> statement-breakpoint
CREATE TABLE "odds_agregada" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jogo_id" uuid NOT NULL,
	"jogador_id" uuid NOT NULL,
	"atributo" "atributo" NOT NULL,
	"linha" numeric(6, 1) NOT NULL,
	"odd_min" numeric(7, 3),
	"odd_max" numeric(7, 3),
	"odd_mediana" numeric(7, 3),
	"qtd_casas" smallint DEFAULT 0 NOT NULL,
	"origem" "origem_odds" NOT NULL,
	"calculado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "odds_agregada_unica" UNIQUE("jogo_id","jogador_id","atributo","linha")
);
--> statement-breakpoint
CREATE TABLE "odds_snapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"casa_id" uuid NOT NULL,
	"jogo_id" uuid NOT NULL,
	"jogador_id" uuid NOT NULL,
	"atributo" "atributo" NOT NULL,
	"linha" numeric(6, 1) NOT NULL,
	"odd_over" numeric(7, 3),
	"odd_under" numeric(7, 3),
	"capturado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "apitos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
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
	"odd_min" numeric(7, 3),
	"odd_max" numeric(7, 3),
	"alvo_1q" smallint,
	"gerado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "apitos_dedup" UNIQUE NULLS NOT DISTINCT("jogo_id","jogador_id","atributo","estrategia","linha")
);
--> statement-breakpoint
CREATE TABLE "feed_snapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"data_referencia" text NOT NULL,
	"estrategia" "estrategia" NOT NULL,
	"conteudo_json" jsonb NOT NULL,
	"gerado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"hash" text NOT NULL,
	CONSTRAINT "feed_snapshot_unico" UNIQUE("data_referencia","estrategia")
);
--> statement-breakpoint
CREATE TABLE "rulesets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"versao" text NOT NULL,
	"conteudo_yaml" text NOT NULL,
	"status" "status_ruleset" DEFAULT 'provisorio' NOT NULL,
	"ativo_desde" timestamp with time zone,
	"criado_por" text,
	CONSTRAINT "rulesets_versao_unique" UNIQUE("versao")
);
--> statement-breakpoint
CREATE TABLE "assinaturas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"mercadopago_id" text,
	"status" text NOT NULL,
	"plano" text,
	"inicio" timestamp with time zone,
	"fim" timestamp with time zone,
	"proxima_cobranca" timestamp with time zone,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assinaturas_mercadopago_id_unique" UNIQUE("mercadopago_id")
);
--> statement-breakpoint
CREATE TABLE "dispositivos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"tipo" "tipo_dispositivo" NOT NULL,
	"user_agent" text,
	"ip_ultimo" text,
	"ativo_desde" timestamp with time zone DEFAULT now() NOT NULL,
	"ultimo_uso" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dispositivos_unico" UNIQUE("usuario_id","fingerprint")
);
--> statement-breakpoint
CREATE TABLE "preferencias_notificacao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"canal" "canal_notificacao" NOT NULL,
	"habilitado" boolean DEFAULT true NOT NULL,
	CONSTRAINT "preferencias_notificacao_unica" UNIQUE("usuario_id","canal")
);
--> statement-breakpoint
CREATE TABLE "push_inscricoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"dispositivo_id" uuid,
	"endpoint" text NOT NULL,
	"chave_p256dh" text NOT NULL,
	"chave_auth" text NOT NULL,
	CONSTRAINT "push_inscricoes_endpoint" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "sessoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"dispositivo_id" uuid,
	"token_hash" text NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"encerrada_em" timestamp with time zone,
	"motivo_encerramento" text,
	CONSTRAINT "sessoes_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"senha_hash" text NOT NULL,
	"nome" text,
	"status" "status_usuario" DEFAULT 'ATIVO' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"ultimo_acesso" timestamp with time zone,
	CONSTRAINT "usuarios_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "log_falhas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"origem" text NOT NULL,
	"severidade" "severidade" NOT NULL,
	"mensagem" text NOT NULL,
	"contexto_json" jsonb,
	"ocorrido_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saude_provedor" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provedor" text NOT NULL,
	"tipo" "tipo_provedor" NOT NULL,
	"ultima_resposta_ok" timestamp with time zone,
	"latencia_ms" integer,
	"status" text NOT NULL,
	"dado_mais_recente_em" timestamp with time zone,
	CONSTRAINT "saude_provedor_unico" UNIQUE("provedor")
);
--> statement-breakpoint
ALTER TABLE "classificacao" ADD CONSTRAINT "classificacao_time_id_times_id_fk" FOREIGN KEY ("time_id") REFERENCES "public"."times"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estatisticas_jogo" ADD CONSTRAINT "estatisticas_jogo_jogo_id_jogos_id_fk" FOREIGN KEY ("jogo_id") REFERENCES "public"."jogos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estatisticas_jogo" ADD CONSTRAINT "estatisticas_jogo_jogador_id_jogadores_id_fk" FOREIGN KEY ("jogador_id") REFERENCES "public"."jogadores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estatisticas_quarto" ADD CONSTRAINT "estatisticas_quarto_jogo_id_jogos_id_fk" FOREIGN KEY ("jogo_id") REFERENCES "public"."jogos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estatisticas_quarto" ADD CONSTRAINT "estatisticas_quarto_jogador_id_jogadores_id_fk" FOREIGN KEY ("jogador_id") REFERENCES "public"."jogadores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estatisticas_time_jogo" ADD CONSTRAINT "estatisticas_time_jogo_jogo_id_jogos_id_fk" FOREIGN KEY ("jogo_id") REFERENCES "public"."jogos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estatisticas_time_jogo" ADD CONSTRAINT "estatisticas_time_jogo_time_id_times_id_fk" FOREIGN KEY ("time_id") REFERENCES "public"."times"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jogadores" ADD CONSTRAINT "jogadores_time_id_times_id_fk" FOREIGN KEY ("time_id") REFERENCES "public"."times"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jogos" ADD CONSTRAINT "jogos_time_casa_id_times_id_fk" FOREIGN KEY ("time_casa_id") REFERENCES "public"."times"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jogos" ADD CONSTRAINT "jogos_time_visitante_id_times_id_fk" FOREIGN KEY ("time_visitante_id") REFERENCES "public"."times"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesoes_escalacao" ADD CONSTRAINT "lesoes_escalacao_jogo_id_jogos_id_fk" FOREIGN KEY ("jogo_id") REFERENCES "public"."jogos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesoes_escalacao" ADD CONSTRAINT "lesoes_escalacao_jogador_id_jogadores_id_fk" FOREIGN KEY ("jogador_id") REFERENCES "public"."jogadores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mapa_jogadores" ADD CONSTRAINT "mapa_jogadores_jogador_id_jogadores_id_fk" FOREIGN KEY ("jogador_id") REFERENCES "public"."jogadores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medias_jogador" ADD CONSTRAINT "medias_jogador_jogador_id_jogadores_id_fk" FOREIGN KEY ("jogador_id") REFERENCES "public"."jogadores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "niveis" ADD CONSTRAINT "niveis_niveis_versao_id_niveis_versao_id_fk" FOREIGN KEY ("niveis_versao_id") REFERENCES "public"."niveis_versao"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "niveis" ADD CONSTRAINT "niveis_jogador_id_jogadores_id_fk" FOREIGN KEY ("jogador_id") REFERENCES "public"."jogadores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "niveis" ADD CONSTRAINT "niveis_time_id_times_id_fk" FOREIGN KEY ("time_id") REFERENCES "public"."times"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mapa_mercados" ADD CONSTRAINT "mapa_mercados_casa_id_casas_id_fk" FOREIGN KEY ("casa_id") REFERENCES "public"."casas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "odds_agregada" ADD CONSTRAINT "odds_agregada_jogo_id_jogos_id_fk" FOREIGN KEY ("jogo_id") REFERENCES "public"."jogos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "odds_agregada" ADD CONSTRAINT "odds_agregada_jogador_id_jogadores_id_fk" FOREIGN KEY ("jogador_id") REFERENCES "public"."jogadores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "odds_snapshot" ADD CONSTRAINT "odds_snapshot_casa_id_casas_id_fk" FOREIGN KEY ("casa_id") REFERENCES "public"."casas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "odds_snapshot" ADD CONSTRAINT "odds_snapshot_jogo_id_jogos_id_fk" FOREIGN KEY ("jogo_id") REFERENCES "public"."jogos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "odds_snapshot" ADD CONSTRAINT "odds_snapshot_jogador_id_jogadores_id_fk" FOREIGN KEY ("jogador_id") REFERENCES "public"."jogadores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apitos" ADD CONSTRAINT "apitos_jogo_id_jogos_id_fk" FOREIGN KEY ("jogo_id") REFERENCES "public"."jogos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apitos" ADD CONSTRAINT "apitos_jogador_id_jogadores_id_fk" FOREIGN KEY ("jogador_id") REFERENCES "public"."jogadores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assinaturas" ADD CONSTRAINT "assinaturas_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispositivos" ADD CONSTRAINT "dispositivos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preferencias_notificacao" ADD CONSTRAINT "preferencias_notificacao_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_inscricoes" ADD CONSTRAINT "push_inscricoes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_inscricoes" ADD CONSTRAINT "push_inscricoes_dispositivo_id_dispositivos_id_fk" FOREIGN KEY ("dispositivo_id") REFERENCES "public"."dispositivos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_dispositivo_id_dispositivos_id_fk" FOREIGN KEY ("dispositivo_id") REFERENCES "public"."dispositivos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "estatisticas_jogo_jogador_idx" ON "estatisticas_jogo" USING btree ("jogador_id","jogo_id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "estatisticas_quarto_1q_idx" ON "estatisticas_quarto" USING btree ("jogo_id","quarto") WHERE "estatisticas_quarto"."quarto" = 1;--> statement-breakpoint
CREATE INDEX "jogos_data_idx" ON "jogos" USING btree ("data_hora_utc","status");--> statement-breakpoint
CREATE INDEX "lesoes_escalacao_jogo_status_idx" ON "lesoes_escalacao" USING btree ("jogo_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "niveis_versao_unica_ativa" ON "niveis_versao" USING btree ("ativa") WHERE "niveis_versao"."ativa";--> statement-breakpoint
CREATE INDEX "apitos_feed_idx" ON "apitos" USING btree ("gerado_em" DESC NULLS LAST,"estrategia");--> statement-breakpoint
CREATE INDEX "sessoes_usuario_idx" ON "sessoes" USING btree ("usuario_id","encerrada_em");