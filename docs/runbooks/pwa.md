# Runbook — PWA

## Estado de rollout

A fundação está implementada localmente. O deploy público depende da aprovação
dos ícones e da matriz real de aparelhos da Spec 03. O fluxo Push no iOS também
depende de chaves VAPID e allowlist conforme o runbook da Spec 02.

## Assets e manifest

- `npm run pwa:assets` regenera PNGs e fontes SVG a partir dos tokens.
- Não edite os PNGs manualmente.
- `npm run test:spec03` verifica manifest, arquivos e dimensões.
- O ícone maskable mantém o símbolo dentro da área segura central.
- Trocar a identidade exige aprovação visual e nova execução do harness.

## Cache e atualização

O worker usa somente caches com prefixo `ia-da-nba-pwa-`. Ao alterar qualquer
asset precacheado ou a política do worker:

1. incremente `VERSAO_CACHE` em `public/sw.js`;
2. preserve os handlers Push e o contrato V1;
3. rode `npm run test:spec02` e `npm run test:spec03`;
4. publique em preview HTTPS;
5. confirme que a UI sinaliza a versão aguardando;
6. aplique “Atualizar agora” e verifique uma única recarga controlada.

Não use `skipWaiting` no evento `install`. O worker só o executa após a mensagem
explícita da UI. A ativação apaga apenas versões antigas com o prefixo da
aplicação e preserva caches de terceiros.

## Smoke de segurança

No DevTools, em Application → Cache Storage:

1. confirme somente a página `/offline`, ícones e assets `_next/static`;
2. navegue por `/`, `/estatisticas` e `/fire-live`;
3. confirme que nenhum HTML dessas rotas apareceu no cache;
4. chame uma rota `/api/*` e confirme que não foi interceptada;
5. fique offline e abra `/`: deve aparecer apenas “Sem conexão”;
6. volte online e use “Tentar novamente”.

Nunca devem aparecer no Cache Storage respostas autenticadas, dados de sessão,
Lista Secreta, estatísticas, Fire Live ou APIs.

## Matriz antes de produção

- iPhone e iPad no menor sistema suportado e no atual;
- Chrome Android atual;
- Chrome desktop e Safari macOS;
- instalação, standalone e remoção;
- online → offline → online;
- atualização entre dois deploys;
- instalação seguida de Push real no iOS.

## Rollback

Publique um worker compatível com uma nova versão de cache. Ele deve parar de
adicionar assets, remover somente caches `ia-da-nba-pwa-*` antigos e manter os
handlers Push compatíveis ou em no-op. Não apague `/sw.js`: clientes já
controlados continuariam executando a última cópia instalada.
