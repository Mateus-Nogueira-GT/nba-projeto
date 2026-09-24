// Nome do cookie que entrega o link de redefinição entre `acoes.ts` (quem
// grava, ao emitir) e a página (quem lê, para mostrar uma vez ao admin). Vive
// em arquivo à parte porque um arquivo `'use server'` só pode exportar função
// async.
export const NOME_COOKIE_LINK_REDEFINICAO = 'nip_link_redefinicao'
