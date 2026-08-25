ALTER TABLE "feed_snapshot" DROP CONSTRAINT "feed_snapshot_unico";--> statement-breakpoint
ALTER TABLE "feed_snapshot" ADD COLUMN "jogo_id" uuid;--> statement-breakpoint
ALTER TABLE "feed_snapshot" ADD CONSTRAINT "feed_snapshot_jogo_id_jogos_id_fk" FOREIGN KEY ("jogo_id") REFERENCES "public"."jogos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_snapshot" ADD CONSTRAINT "feed_snapshot_unico" UNIQUE NULLS NOT DISTINCT("data_referencia","estrategia","jogo_id");