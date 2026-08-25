ALTER TABLE "estatisticas_jogo" ADD COLUMN "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "estatisticas_time_jogo" ADD COLUMN "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "jogos" ADD COLUMN "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL;