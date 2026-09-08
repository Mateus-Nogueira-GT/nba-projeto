CREATE TABLE "acordos_afiliados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parceiro_id" uuid NOT NULL,
	"oferta_id" uuid NOT NULL,
	"percentual_pontos_base" integer NOT NULL,
	"inicio" timestamp with time zone NOT NULL,
	"fim" timestamp with time zone,
	"criado_por_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "acordos_afiliados_versao_unica" UNIQUE("parceiro_id","oferta_id","inicio"),
	CONSTRAINT "acordos_afiliados_percentual_valido" CHECK ("acordos_afiliados"."percentual_pontos_base" between 0 and 10000),
	CONSTRAINT "acordos_afiliados_intervalo_valido" CHECK ("acordos_afiliados"."fim" is null or "acordos_afiliados"."fim" > "acordos_afiliados"."inicio")
);
--> statement-breakpoint
CREATE TABLE "alocacoes_repasses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repasse_id" uuid NOT NULL,
	"liberacao_id" uuid NOT NULL,
	"valor_centavos" integer NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alocacoes_repasses_unica" UNIQUE("repasse_id","liberacao_id"),
	CONSTRAINT "alocacoes_repasses_valor_valido" CHECK ("alocacoes_repasses"."valor_centavos" > 0)
);
--> statement-breakpoint
CREATE TABLE "atribuicoes_afiliados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visitante_hash" text NOT NULL,
	"usuario_id" uuid,
	"parceiro_id" uuid NOT NULL,
	"link_origem_id" uuid NOT NULL,
	"inicio" timestamp with time zone NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"estado" text DEFAULT 'ATIVA' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "atribuicoes_afiliados_intervalo_valido" CHECK ("atribuicoes_afiliados"."expira_em" > "atribuicoes_afiliados"."inicio"),
	CONSTRAINT "atribuicoes_afiliados_estado_valido" CHECK ("atribuicoes_afiliados"."estado" in ('ATIVA', 'EXPIRADA', 'CONFLITO'))
);
--> statement-breakpoint
CREATE TABLE "auditoria_afiliados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ator_usuario_id" uuid,
	"acao" text NOT NULL,
	"entidade" text NOT NULL,
	"entidade_id" uuid,
	"motivo" text,
	"contexto" jsonb,
	"ocorrido_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campanhas_afiliados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parceiro_id" uuid NOT NULL,
	"oferta_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"canal" text NOT NULL,
	"status" text DEFAULT 'ATIVA' NOT NULL,
	"criado_por_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campanhas_afiliados_nome_unico" UNIQUE("parceiro_id","nome"),
	CONSTRAINT "campanhas_afiliados_status_valido" CHECK ("campanhas_afiliados"."status" in ('ATIVA', 'PAUSADA', 'ENCERRADA'))
);
--> statement-breakpoint
CREATE TABLE "comissoes_afiliados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_importacao_id" uuid NOT NULL,
	"parceiro_id" uuid NOT NULL,
	"acordo_id" uuid NOT NULL,
	"moeda" text NOT NULL,
	"base_nip_centavos" integer NOT NULL,
	"percentual_pontos_base" integer NOT NULL,
	"parcela_parceiro_centavos" integer NOT NULL,
	"estado" text DEFAULT 'CONFIRMADA' NOT NULL,
	"ajuste_de_id" uuid,
	"motivo_ajuste" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comissoes_afiliados_item_importacao_id_unique" UNIQUE("item_importacao_id"),
	CONSTRAINT "comissoes_afiliados_valores_validos" CHECK ("comissoes_afiliados"."base_nip_centavos" >= 0 and "comissoes_afiliados"."parcela_parceiro_centavos" >= 0 and "comissoes_afiliados"."percentual_pontos_base" between 0 and 10000),
	CONSTRAINT "comissoes_afiliados_estado_valido" CHECK ("comissoes_afiliados"."estado" in ('PENDENTE', 'CONFIRMADA', 'AJUSTADA', 'CANCELADA'))
);
--> statement-breakpoint
CREATE TABLE "convites_afiliados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"nome_publico" text NOT NULL,
	"token_hash" text NOT NULL,
	"criado_por_id" uuid NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"consumido_em" timestamp with time zone,
	"parceiro_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "convites_afiliados_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "convites_afiliados_expiracao_valida" CHECK ("convites_afiliados"."expira_em" > "convites_afiliados"."criado_em")
);
--> statement-breakpoint
CREATE TABLE "eventos_afiliados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visitante_hash" text NOT NULL,
	"usuario_id" uuid,
	"link_id" uuid NOT NULL,
	"atribuicao_id" uuid,
	"tipo" text NOT NULL,
	"automatizado" boolean DEFAULT false NOT NULL,
	"ocorrido_em" timestamp with time zone NOT NULL,
	CONSTRAINT "eventos_afiliados_tipo_valido" CHECK ("eventos_afiliados"."tipo" in ('CLIQUE', 'VISITA_NIP', 'SAIDA_CASA', 'CADASTRO_NIP'))
);
--> statement-breakpoint
CREATE TABLE "itens_importacao_afiliados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lote_id" uuid NOT NULL,
	"casa_id" uuid NOT NULL,
	"oferta_id" uuid NOT NULL,
	"parceiro_id" uuid,
	"campanha_id" uuid,
	"link_id" uuid,
	"id_externo" text NOT NULL,
	"indicado_mascarado" text,
	"ocorrido_em" timestamp with time zone NOT NULL,
	"tipo" text NOT NULL,
	"moeda" text NOT NULL,
	"cpa_centavos" integer,
	"revshare_centavos" integer,
	"total_centavos" integer,
	"base_confirmada_centavos" integer NOT NULL,
	"estado" text DEFAULT 'PENDENTE' NOT NULL,
	"motivo_pendencia" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "itens_importacao_evento_unico" UNIQUE("casa_id","id_externo"),
	CONSTRAINT "itens_importacao_tipo_valido" CHECK ("itens_importacao_afiliados"."tipo" in ('CPA', 'REVSHARE', 'HIBRIDO')),
	CONSTRAINT "itens_importacao_moeda_valida" CHECK ("itens_importacao_afiliados"."moeda" ~ '^[A-Z]{3}$'),
	CONSTRAINT "itens_importacao_base_valida" CHECK ("itens_importacao_afiliados"."base_confirmada_centavos" >= 0),
	CONSTRAINT "itens_importacao_estado_valido" CHECK ("itens_importacao_afiliados"."estado" in ('PENDENTE', 'VALIDO', 'REJEITADO', 'DUPLICADO'))
);
--> statement-breakpoint
CREATE TABLE "liberacoes_repasses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"comissao_id" uuid NOT NULL,
	"valor_centavos" integer NOT NULL,
	"estado" text DEFAULT 'ABERTA' NOT NULL,
	"liberado_por_id" uuid,
	"motivo" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "liberacoes_repasses_valor_valido" CHECK ("liberacoes_repasses"."valor_centavos" > 0),
	CONSTRAINT "liberacoes_repasses_estado_valido" CHECK ("liberacoes_repasses"."estado" in ('ABERTA', 'CONSUMIDA', 'CANCELADA'))
);
--> statement-breakpoint
CREATE TABLE "links_afiliados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campanha_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"tipo_destino" text NOT NULL,
	"caminho_nip" text,
	"utms" jsonb,
	"parametros_casa" jsonb,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "links_afiliados_codigo_unique" UNIQUE("codigo"),
	CONSTRAINT "links_afiliados_tipo_destino_valido" CHECK ("links_afiliados"."tipo_destino" in ('NIP', 'CASA')),
	CONSTRAINT "links_afiliados_caminho_nip_valido" CHECK ("links_afiliados"."tipo_destino" <> 'NIP' or "links_afiliados"."caminho_nip" is not null)
);
--> statement-breakpoint
CREATE TABLE "lotes_importacao_afiliados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"casa_id" uuid NOT NULL,
	"oferta_id" uuid NOT NULL,
	"arquivo_nome" text NOT NULL,
	"checksum" text NOT NULL,
	"estado" text DEFAULT 'PREVIA' NOT NULL,
	"importado_por_id" uuid,
	"confirmado_por_id" uuid,
	"confirmado_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lotes_importacao_checksum_unico" UNIQUE("casa_id","checksum"),
	CONSTRAINT "lotes_importacao_estado_valido" CHECK ("lotes_importacao_afiliados"."estado" in ('PREVIA', 'CONFIRMADO', 'REJEITADO'))
);
--> statement-breakpoint
CREATE TABLE "ofertas_afiliados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"casa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"modalidade" text NOT NULL,
	"moeda" text NOT NULL,
	"url_destino" text NOT NULL,
	"host_destino" text NOT NULL,
	"status" text DEFAULT 'RASCUNHO' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ofertas_afiliados_casa_nome_unico" UNIQUE("casa_id","nome"),
	CONSTRAINT "ofertas_afiliados_modalidade_valida" CHECK ("ofertas_afiliados"."modalidade" in ('CPA', 'REVSHARE', 'HIBRIDO')),
	CONSTRAINT "ofertas_afiliados_moeda_valida" CHECK ("ofertas_afiliados"."moeda" ~ '^[A-Z]{3}$'),
	CONSTRAINT "ofertas_afiliados_status_valido" CHECK ("ofertas_afiliados"."status" in ('RASCUNHO', 'ATIVA', 'PAUSADA', 'ENCERRADA'))
);
--> statement-breakpoint
CREATE TABLE "parceiros_afiliados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid,
	"codigo" text NOT NULL,
	"nome_publico" text NOT NULL,
	"status" text DEFAULT 'ATIVO' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "parceiros_afiliados_usuario_id_unique" UNIQUE("usuario_id"),
	CONSTRAINT "parceiros_afiliados_codigo_unique" UNIQUE("codigo"),
	CONSTRAINT "parceiros_afiliados_status_valido" CHECK ("parceiros_afiliados"."status" in ('ATIVO', 'SUSPENSO'))
);
--> statement-breakpoint
CREATE TABLE "recebimentos_casas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"casa_id" uuid NOT NULL,
	"moeda" text NOT NULL,
	"valor_centavos" integer NOT NULL,
	"recebido_em" timestamp with time zone NOT NULL,
	"referencia_externa" text NOT NULL,
	"registrado_por_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recebimentos_casas_referencia_unica" UNIQUE("casa_id","referencia_externa"),
	CONSTRAINT "recebimentos_casas_valor_valido" CHECK ("recebimentos_casas"."valor_centavos" > 0)
);
--> statement-breakpoint
CREATE TABLE "repasses_afiliados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parceiro_id" uuid NOT NULL,
	"moeda" text NOT NULL,
	"valor_centavos" integer NOT NULL,
	"pago_em" timestamp with time zone NOT NULL,
	"referencia_externa" text NOT NULL,
	"comprovante_chave" text,
	"registrado_por_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "repasses_afiliados_referencia_unica" UNIQUE("parceiro_id","referencia_externa"),
	CONSTRAINT "repasses_afiliados_valor_valido" CHECK ("repasses_afiliados"."valor_centavos" > 0)
);
--> statement-breakpoint
ALTER TABLE "acordos_afiliados" ADD CONSTRAINT "acordos_afiliados_parceiro_id_parceiros_afiliados_id_fk" FOREIGN KEY ("parceiro_id") REFERENCES "public"."parceiros_afiliados"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acordos_afiliados" ADD CONSTRAINT "acordos_afiliados_oferta_id_ofertas_afiliados_id_fk" FOREIGN KEY ("oferta_id") REFERENCES "public"."ofertas_afiliados"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acordos_afiliados" ADD CONSTRAINT "acordos_afiliados_criado_por_id_usuarios_id_fk" FOREIGN KEY ("criado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alocacoes_repasses" ADD CONSTRAINT "alocacoes_repasses_repasse_id_repasses_afiliados_id_fk" FOREIGN KEY ("repasse_id") REFERENCES "public"."repasses_afiliados"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alocacoes_repasses" ADD CONSTRAINT "alocacoes_repasses_liberacao_id_liberacoes_repasses_id_fk" FOREIGN KEY ("liberacao_id") REFERENCES "public"."liberacoes_repasses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atribuicoes_afiliados" ADD CONSTRAINT "atribuicoes_afiliados_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atribuicoes_afiliados" ADD CONSTRAINT "atribuicoes_afiliados_parceiro_id_parceiros_afiliados_id_fk" FOREIGN KEY ("parceiro_id") REFERENCES "public"."parceiros_afiliados"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atribuicoes_afiliados" ADD CONSTRAINT "atribuicoes_afiliados_link_origem_id_links_afiliados_id_fk" FOREIGN KEY ("link_origem_id") REFERENCES "public"."links_afiliados"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auditoria_afiliados" ADD CONSTRAINT "auditoria_afiliados_ator_usuario_id_usuarios_id_fk" FOREIGN KEY ("ator_usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campanhas_afiliados" ADD CONSTRAINT "campanhas_afiliados_parceiro_id_parceiros_afiliados_id_fk" FOREIGN KEY ("parceiro_id") REFERENCES "public"."parceiros_afiliados"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campanhas_afiliados" ADD CONSTRAINT "campanhas_afiliados_oferta_id_ofertas_afiliados_id_fk" FOREIGN KEY ("oferta_id") REFERENCES "public"."ofertas_afiliados"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campanhas_afiliados" ADD CONSTRAINT "campanhas_afiliados_criado_por_id_usuarios_id_fk" FOREIGN KEY ("criado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comissoes_afiliados" ADD CONSTRAINT "comissoes_afiliados_item_importacao_id_itens_importacao_afiliados_id_fk" FOREIGN KEY ("item_importacao_id") REFERENCES "public"."itens_importacao_afiliados"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comissoes_afiliados" ADD CONSTRAINT "comissoes_afiliados_parceiro_id_parceiros_afiliados_id_fk" FOREIGN KEY ("parceiro_id") REFERENCES "public"."parceiros_afiliados"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comissoes_afiliados" ADD CONSTRAINT "comissoes_afiliados_acordo_id_acordos_afiliados_id_fk" FOREIGN KEY ("acordo_id") REFERENCES "public"."acordos_afiliados"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "convites_afiliados" ADD CONSTRAINT "convites_afiliados_criado_por_id_usuarios_id_fk" FOREIGN KEY ("criado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "convites_afiliados" ADD CONSTRAINT "convites_afiliados_parceiro_id_parceiros_afiliados_id_fk" FOREIGN KEY ("parceiro_id") REFERENCES "public"."parceiros_afiliados"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos_afiliados" ADD CONSTRAINT "eventos_afiliados_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos_afiliados" ADD CONSTRAINT "eventos_afiliados_link_id_links_afiliados_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."links_afiliados"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos_afiliados" ADD CONSTRAINT "eventos_afiliados_atribuicao_id_atribuicoes_afiliados_id_fk" FOREIGN KEY ("atribuicao_id") REFERENCES "public"."atribuicoes_afiliados"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itens_importacao_afiliados" ADD CONSTRAINT "itens_importacao_afiliados_lote_id_lotes_importacao_afiliados_id_fk" FOREIGN KEY ("lote_id") REFERENCES "public"."lotes_importacao_afiliados"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itens_importacao_afiliados" ADD CONSTRAINT "itens_importacao_afiliados_casa_id_casas_id_fk" FOREIGN KEY ("casa_id") REFERENCES "public"."casas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itens_importacao_afiliados" ADD CONSTRAINT "itens_importacao_afiliados_oferta_id_ofertas_afiliados_id_fk" FOREIGN KEY ("oferta_id") REFERENCES "public"."ofertas_afiliados"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itens_importacao_afiliados" ADD CONSTRAINT "itens_importacao_afiliados_parceiro_id_parceiros_afiliados_id_fk" FOREIGN KEY ("parceiro_id") REFERENCES "public"."parceiros_afiliados"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itens_importacao_afiliados" ADD CONSTRAINT "itens_importacao_afiliados_campanha_id_campanhas_afiliados_id_fk" FOREIGN KEY ("campanha_id") REFERENCES "public"."campanhas_afiliados"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itens_importacao_afiliados" ADD CONSTRAINT "itens_importacao_afiliados_link_id_links_afiliados_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."links_afiliados"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liberacoes_repasses" ADD CONSTRAINT "liberacoes_repasses_comissao_id_comissoes_afiliados_id_fk" FOREIGN KEY ("comissao_id") REFERENCES "public"."comissoes_afiliados"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liberacoes_repasses" ADD CONSTRAINT "liberacoes_repasses_liberado_por_id_usuarios_id_fk" FOREIGN KEY ("liberado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "links_afiliados" ADD CONSTRAINT "links_afiliados_campanha_id_campanhas_afiliados_id_fk" FOREIGN KEY ("campanha_id") REFERENCES "public"."campanhas_afiliados"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lotes_importacao_afiliados" ADD CONSTRAINT "lotes_importacao_afiliados_casa_id_casas_id_fk" FOREIGN KEY ("casa_id") REFERENCES "public"."casas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lotes_importacao_afiliados" ADD CONSTRAINT "lotes_importacao_afiliados_oferta_id_ofertas_afiliados_id_fk" FOREIGN KEY ("oferta_id") REFERENCES "public"."ofertas_afiliados"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lotes_importacao_afiliados" ADD CONSTRAINT "lotes_importacao_afiliados_importado_por_id_usuarios_id_fk" FOREIGN KEY ("importado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lotes_importacao_afiliados" ADD CONSTRAINT "lotes_importacao_afiliados_confirmado_por_id_usuarios_id_fk" FOREIGN KEY ("confirmado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ofertas_afiliados" ADD CONSTRAINT "ofertas_afiliados_casa_id_casas_id_fk" FOREIGN KEY ("casa_id") REFERENCES "public"."casas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parceiros_afiliados" ADD CONSTRAINT "parceiros_afiliados_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recebimentos_casas" ADD CONSTRAINT "recebimentos_casas_casa_id_casas_id_fk" FOREIGN KEY ("casa_id") REFERENCES "public"."casas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recebimentos_casas" ADD CONSTRAINT "recebimentos_casas_registrado_por_id_usuarios_id_fk" FOREIGN KEY ("registrado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repasses_afiliados" ADD CONSTRAINT "repasses_afiliados_parceiro_id_parceiros_afiliados_id_fk" FOREIGN KEY ("parceiro_id") REFERENCES "public"."parceiros_afiliados"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repasses_afiliados" ADD CONSTRAINT "repasses_afiliados_registrado_por_id_usuarios_id_fk" FOREIGN KEY ("registrado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "acordos_afiliados_vigencia_idx" ON "acordos_afiliados" USING btree ("parceiro_id","oferta_id","inicio","fim");--> statement-breakpoint
CREATE INDEX "alocacoes_repasses_liberacao_idx" ON "alocacoes_repasses" USING btree ("liberacao_id");--> statement-breakpoint
CREATE INDEX "atribuicoes_afiliados_visitante_idx" ON "atribuicoes_afiliados" USING btree ("visitante_hash","inicio");--> statement-breakpoint
CREATE INDEX "atribuicoes_afiliados_usuario_idx" ON "atribuicoes_afiliados" USING btree ("usuario_id","inicio");--> statement-breakpoint
CREATE INDEX "auditoria_afiliados_entidade_idx" ON "auditoria_afiliados" USING btree ("entidade","entidade_id","ocorrido_em");--> statement-breakpoint
CREATE INDEX "comissoes_afiliados_parceiro_idx" ON "comissoes_afiliados" USING btree ("parceiro_id","moeda","criado_em");--> statement-breakpoint
CREATE INDEX "convites_afiliados_email_idx" ON "convites_afiliados" USING btree ("email","expira_em");--> statement-breakpoint
CREATE INDEX "eventos_afiliados_link_data_idx" ON "eventos_afiliados" USING btree ("link_id","ocorrido_em");--> statement-breakpoint
CREATE INDEX "eventos_afiliados_atribuicao_idx" ON "eventos_afiliados" USING btree ("atribuicao_id","ocorrido_em");--> statement-breakpoint
CREATE INDEX "itens_importacao_parceiro_idx" ON "itens_importacao_afiliados" USING btree ("parceiro_id","ocorrido_em");--> statement-breakpoint
CREATE INDEX "liberacoes_repasses_comissao_idx" ON "liberacoes_repasses" USING btree ("comissao_id","estado");