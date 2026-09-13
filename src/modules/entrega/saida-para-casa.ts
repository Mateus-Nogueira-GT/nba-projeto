import { and, eq } from 'drizzle-orm'

import type { Db } from '../dominio/db/tipos'
import {
  campanhasAfiliados,
  linksAfiliados,
  ofertasAfiliados,
  parceirosAfiliados,
} from '../dominio/db/schema'

export type SaidaParaCasa = { codigo: string; rotulo: string }

/**
 * O link rastreado que o apito oferece como saída para a casa parceira. Só
 * existe se o admin marcou um (spec 12/09, §5.4), e só vale se o link, a
 * campanha, a oferta E o parceiro estiverem ativos — senão a tela não mostra
 * saída, nunca inventa destino. O parceiro entra aqui porque suspendê-lo
 * pelo painel NÃO desativa os links dele (achado da revisão final): sem este
 * `innerJoin`, suspender um parceiro deixava o CTA "VER NA CASA PARCEIRA"
 * desenhado em todo apito, caindo em `/oferta-indisponivel` a cada toque —
 * mesma condição que `configuracaoDoLink` (afiliados/servico.ts), usada por
 * `/ir/[codigo]`, já exige. Somente leitura (CLAUDE.md regra 4): o resultado
 * é um `<a>` para `/ir/<codigo>`, que já registra o clique.
 */
export async function saidaDoApito(db: Db): Promise<SaidaParaCasa | null> {
  const [saida] = await db
    .select({ codigo: linksAfiliados.codigo, rotulo: ofertasAfiliados.nome })
    .from(linksAfiliados)
    .innerJoin(campanhasAfiliados, eq(linksAfiliados.campanhaId, campanhasAfiliados.id))
    .innerJoin(ofertasAfiliados, eq(campanhasAfiliados.ofertaId, ofertasAfiliados.id))
    .innerJoin(parceirosAfiliados, eq(campanhasAfiliados.parceiroId, parceirosAfiliados.id))
    .where(
      and(
        eq(linksAfiliados.saidaDoApito, true),
        eq(linksAfiliados.ativo, true),
        eq(campanhasAfiliados.status, 'ATIVA'),
        eq(ofertasAfiliados.status, 'ATIVA'),
        eq(parceirosAfiliados.status, 'ATIVO'),
      ),
    )
    .limit(1)
  return saida ?? null
}
