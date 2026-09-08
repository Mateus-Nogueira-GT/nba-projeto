# UX do Ao Vivo: identidade dos times e jogadores

Pedido de 08/09/2026, a partir dos três prints do Fire Live: nomes completos,
logos dos times, fotos dos jogadores, mini quadra e hover no Modo Fire.

## Entrega

- `IdentidadeTime` e catálogo de apresentação dos 30 times, com SVGs oficiais
  locais em `public/times` (fontes e hashes no README desse diretório).
- `CabecalhoJogo` e `CardEntrada` mostram nomes completos e logos, preservando
  visitante/mandante, placares, estados e cores existentes. Nomes quebram linha.
- `QuadraAoVivo` é uma ilustração exclusiva da tela quente, solicitada pelo Fire
  Live. Não simula posse, posição de jogadores ou arremessos: o feed não fornece
  esses eventos. Placar e status continuam vindo da entrega.
- Modo Fire responde a hover e foco com elevação, brilho e uma animação curta no
  selo. `prefers-reduced-motion` remove movimento, mantendo feedback de foco.
- `FotoJogador` retorna ao monograma se uma imagem falhar; `LogoTime` retorna à
  sigla. As dimensões ficam estáveis e uma nova URL/time permite recuperação.
- `demo:fotos` tolera falhas isoladas de URL, aplica timeout e informa pendências.
  Somente `fotoUrl` muda; nenhuma identidade, regra, migração ou seed foi alterado.

## Fotos do cadastro publicado

O comando `demo:fotos`, usando o banco já configurado da demonstração, gravou 228
fotos verificadas no CDN. Nenhuma URL foi pulada. O nome Wiggins é ambíguo no mapa
curado e permanece sem foto. Conferência posterior: 228/229 no cadastro, 21/21 nos
cards da rodada; todos os checks de `demo:conferir` passaram.

## Validação

- 1.379 testes em 118 arquivos passaram (`npm test -- --maxWorkers=4`).
- Typecheck, lint, boundaries, formatação e `git diff --check` passaram.
- Build Next passou com `npm run build -- --webpack`; essa opção contorna a
  restrição do Turbopack local com o node_modules compartilhado por symlink.
- 16 capturas de telas reais renderizadas sobre fixtures PGlite, a 320, 390,
  768 e 1280 px: sem overflow horizontal ou imagens ausentes. As capturas finais
  usam o otimizador público real do app; o acesso direto ao CDN no primeiro
  harness apresentou `ERR_HTTP2_PROTOCOL_ERROR` no Chrome.
- Harness HTTP com componentes React reais: 12/12 verificações de foto real,
  HTTP 404, recuperação, dimensões, hover, foco e movimento reduzido. Sem erros JS.
- Evidências locais em `.superpowers/ux-ao-vivo/`, incluindo
  `capturas-otimizadas`, `capturas-bordas`, `browser/resultado.json` e logs.

## Limite da conferência

A skill `frontend-page-builder` exige: “Se `$playwright-interactive` não estiver
 disponível, declarar a validação visual como pendente”. Essa skill não está
instalada. O requisito formal permanece pendente; as capturas Chrome/CDP e o
harness HTTP acima são evidência complementar. A navegação autenticada completa
no preview não foi exercitada neste ajuste.
