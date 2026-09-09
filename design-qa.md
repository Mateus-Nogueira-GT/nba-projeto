# Design QA — NIP Afiliados

**Resultado final:** passed

## Fontes visuais

- Painel individual: `/Users/mateusnascimentonogueiradasilva/Desktop/Captura de tela 08.09.2026 às 18.12.24 PM.png`
- Painel administrativo: `/Users/mateusnascimentonogueiradasilva/Desktop/Captura de tela 08.09.2026 às 18.11.19 PM.png`
- Comparação normalizada em 1280 × 725 px: `/tmp/nip-afiliados-comparacao-1280.png`
- Implementação em 715 px: `/tmp/nip-afiliados-715.png`
- Implementação em 390 px: `/tmp/nip-afiliados-390.png`

Os prints foram usados como referência de hierarquia, densidade e organização. Marca,
cores de destaque, pessoas e valores do produto de referência não foram copiados. A
prévia de desenvolvimento usa dados sintéticos declarados e não grava receita.

## Verificações

| Área | Evidência | Resultado |
| --- | --- | --- |
| Navegação e identidade | Marca tipográfica NIP, navegação lateral em desktop e superior em telas estreitas | Aprovado |
| Filtros | Campos de data e ação principal acessíveis por teclado | Aprovado |
| Métricas | Quatro cards legíveis, com receita NIP e parcela dos parceiros separadas | Aprovado |
| Tabela | Cabeçalhos semânticos, linhas legíveis e rolagem apenas no conteúdo tabular em telas estreitas | Aprovado |
| Operação | Formulários de importação e estados manuais têm rótulos visíveis e mensagens explícitas | Aprovado |
| Responsividade | Comparação desktop em 1280 px; inspeções adicionais em 715 px e 390 px | Aprovado |
| Rotas públicas | Login NIP e estado de oferta indisponível renderizados sem overlay de erro | Aprovado |
| Runtime | Respostas HTTP 200 no servidor de desenvolvimento; logs sem erro de aplicação nas telas verificadas | Aprovado |

## Ajustes feitos durante a comparação

- Em aproximadamente 715 px, a barra lateral comprimida reduzia a área útil. O
  breakpoint passou para 840 px, convertendo a navegação em barra superior.
- Em 390 px, os links da navegação causavam rolagem horizontal. A barra passou a
  quebrar em múltiplas linhas e os cards/formulários ficaram em uma coluna.
- A referência exibe métricas financeiras que dependem de contratos ainda não
  definidos. A implementação mantém somente métricas sustentadas pelo domínio e
  identifica a fixture visual para evitar que demonstração pareça receita real.

## Limites desta rodada

Não foram aplicadas migrations em banco externo e nenhuma casa real foi acessada. A
validação visual usou a rota de desenvolvimento `/admin/afiliados/visual`; a rota
retorna 404 em produção. O navegador foi verificado pela árvore acessível, renderização
e logs do servidor; não houve inspeção separada pelo painel DevTools.
