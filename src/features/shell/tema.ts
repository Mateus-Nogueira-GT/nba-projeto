/**
 * TEMA DO APP — a pessoa escolhe no topo, como no GPM (23/09/2026):
 * marinho (padrão), aço ou claro. A escolha mora num cookie para o servidor
 * já desenhar a página no tema certo, sem piscar o tema errado no início.
 */
export const COOKIE_TEMA = 'nip-tema'
export const TEMAS = ['marinho', 'aco', 'claro'] as const
export type Tema = (typeof TEMAS)[number]
export const TEMA_PADRAO: Tema = 'marinho'

/**
 * O `--fundo` do Marinho (`src/ui/tokens.css`), para o que NÃO lê CSS: o
 * `themeColor` do layout raiz, a cor da barra do sistema no celular. O layout
 * raiz é estático e sai sempre no Marinho, então a barra acompanha o padrão.
 * O valor mora no CSS; `tema.test.ts` trava que os dois são o mesmo.
 */
export const FUNDO_DO_TEMA_PADRAO = '#0b1a36'

export const ROTULO_DO_TEMA: Record<Tema, string> = { marinho: 'Marinho', aco: 'Aço', claro: 'Claro' }

export function temaDoCookie(valor: string | undefined): Tema {
  return TEMAS.find((t) => t === valor) ?? TEMA_PADRAO
}

/**
 * Script inline do <head> do layout raiz (ajuste nosso sobre o v2, 23/09).
 *
 * O v2 lia o cookie com `cookies()` no layout raiz, e isso tornava TODA rota
 * dinâmica — até o 404: cada URL inexistente virava invocação de função, um
 * vetor barato de varredura para quem quer derrubar o lançamento. Aqui o HTML
 * sai estático com o Marinho, e este script, síncrono no <head>, troca o
 * atributo ANTES da primeira pintura (guia "preventing flash before hydration"
 * do Next). A lista válida sai de `TEMAS` e o nome do cookie de `COOKIE_TEMA`:
 * uma fonte só. Qualquer falha — cookie bloqueado, `%` malformado — fica no
 * Marinho que o servidor já pôs.
 */
export function scriptDoTema(): string {
  const temas = JSON.stringify(TEMAS)
  const prefixo = JSON.stringify(`${COOKIE_TEMA}=`)
  return (
    '(function(){try{' +
    `var p=${prefixo},c=document.cookie.split(';');` +
    'for(var i=0;i<c.length;i++){var s=c[i].trim();' +
    'if(s.indexOf(p)===0){var t=decodeURIComponent(s.slice(p.length));' +
    `if(${temas}.indexOf(t)>=0)document.documentElement.dataset.tema=t;return}}` +
    '}catch(e){}})()'
  )
}
