// Nome do cookie que entrega o link de redefinição entre `acoes.ts` (quem
// grava, ao emitir) e `page.tsx` (quem lê, para mostrar uma vez ao admin).
// Vive em arquivo à parte porque `acoes.ts` tem `'use server'` no topo — um
// arquivo assim só pode exportar função async (Next.js recusa a build se
// exportar uma constante), e `page.tsx` precisa do mesmo nome sem virar
// Server Action.
export const NOME_COOKIE_LINK_REDEFINICAO = 'nip_link_redefinicao'
