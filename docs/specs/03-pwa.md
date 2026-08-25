# Spec 03 — PWA instalável e segura

**Estado:** implementada localmente; identidade final e matriz real pendentes · 21/08/2026

**Depende de:** [Spec 00](00-estabilizacao.md)

**Integra com:** [Spec 02 — Web Push](02-web-push.md)

**Destrava:** instalação pelo navegador e Web Push no iPhone/iPad

---

## Objetivo

Entregar uma PWA instalável em Android, iOS/iPadOS e desktop, com manifest,
ícones, metadata, service worker atualizável e fallback offline neutro. O v0 não
armazena conteúdo autenticado ou pago em Cache Storage.

A fundação PWA pode avançar em paralelo ao backend do Push. O fluxo E2E do Push
em iOS só fica pronto quando as duas specs estiverem integradas.

> Implementação: manifest, metadata, ícones candidatos, offline neutro, cache
> allowlisted, atualização controlada e experiência de instalação foram
> entregues no worker único da Spec 02. Produção permanece bloqueada até a
> aprovação da identidade e a certificação nos aparelhos da matriz.

---

## Escopo

### Entra

- manifest nativo do App Router;
- ícones aprovados, inclusive Apple e maskable;
- metadata/viewport/theme;
- registro e ciclo de atualização de um único service worker;
- cache apenas de assets públicos explicitamente allowlisted;
- página offline sem conteúdo do usuário;
- experiência de instalação progressiva;
- matriz de testes em aparelhos reais.

### Não entra

- cache offline de Lista Secreta, estatísticas ou Fire Live;
- loja de aplicativos;
- sincronização em background de conteúdo;
- envio Web Push, inscrição e preferências (Spec 02).

---

## Manifest e assets

Usar `src/app/manifest.ts` com `MetadataRoute.Manifest`. Ele importa os tokens do
design system, evitando hex duplicado e artefato gerado.

```ts
{
  id: '/',
  name: 'IA da NBA',
  short_name: 'IA da NBA',
  lang: 'pt-BR',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  background_color: primitivo.tinta900,
  theme_color: primitivo.tinta900,
  icons: [/* 192 any, 512 any, 512 maskable */],
}
```

O `layout.tsx` referencia manifest, theme color, Apple Web App e ícones. Há no
mínimo 192×192, 512×512, 512×512 maskable e `apple-touch-icon`. Todos são
verificados no build.

Os assets atuais são candidatos de homologação gerados a partir dos tokens do
produto, com área segura maskable e dimensões validadas automaticamente. Produção
continua bloqueada até a aprovação explícita da identidade comercial.

---

## Um único service worker

A Spec 03 é dona da fundação e do arquivo final; a Spec 02 adiciona os handlers
de Push ao mesmo worker. Não existem registros, escopos ou workers concorrentes.

Regras de ciclo de vida:

- escopo `/` e script servido sem cache longo;
- nomes de cache possuem versão;
- `activate` remove somente caches com prefixo desta aplicação;
- HTML dinâmico não usa cache-first;
- atualização disponível é sinalizada e aplicada após recarga controlada;
- `skipWaiting` silencioso não ocorre durante uma sessão ativa;
- worker novo mantém compatibilidade com o payload Push da versão anterior;
- rollback publica um worker corretivo/no-op; apagar o arquivo não desregistra
  clientes já controlados.

---

## Política de cache v0

O cache é uma allowlist, não uma regra abrangente.

| Recurso | Estratégia |
| --- | --- |
| ícones e assets públicos imutáveis | cache-first, versionado |
| página offline neutra | precache |
| navegação pública | rede; fallback offline neutro |
| HTML autenticado | nunca armazenar |
| `/api/*`, `/admin/*`, `/entrar*` | nunca armazenar |
| Lista Secreta, estatísticas e Fire Live | nunca armazenar |

Assets `_next/static` já possuem hash; o worker não conclui por isso que HTML ou
Server Components são imutáveis. Fallback diz “Sem conexão” e não reproduz dado
do assinante.

Cache offline de conteúdo pago só pode entrar em outra decisão de produto, após
a Spec 04, com modelo de expiração, revogação e ameaça explícito.

---

## Experiência de instalação

O convite surge após valor demonstrado e nunca interrompe o primeiro acesso.

- quando existir, `beforeinstallprompt` é melhoria progressiva;
- não se presume suporte nem se promete prompt automático;
- iOS usa feature detection e modo standalone, não detecção rígida de Safari;
- instruções de “Adicionar à Tela de Início” são curtas e específicas;
- depois de instalado, o convite desaparece;
- permissão de notificação permanece um segundo gesto, sob a Spec 02.

Fluxo iOS:

```text
navegador → Quero receber alertas → instrução de instalação
→ abrir pela Tela de Início → Ativar alertas → permissão + inscrição
```

A tela trata estados: não suportado, instalável, instrução manual, instalado e
atualização disponível.

---

## Segurança e privacidade

- somente contexto seguro (HTTPS; localhost no desenvolvimento);
- deep links do worker são same-origin e allowlisted;
- logout, cancelamento e troca de conta não deixam resposta privada no cache;
- o worker não intercepta request não previsto;
- nenhuma limpeza ampla de storage/caches de terceiros;
- CSP e headers existentes são preservados;
- telemetria de instalação usa eventos sem identificador sensível.

---

## Harness de validação

### Automatizado

1. manifest contém `id`, `scope`, `start_url`, `lang`, display e ícones;
2. cores vêm do token e arquivos referenciados existem/dimensões são válidas;
3. worker registra no escopo esperado e possui versionamento;
4. atualização entre duas versões não mantém asset obsoleto;
5. limpeza afeta apenas caches prefixados;
6. nenhuma resposta de HTML autenticado, API, Lista, estatísticas ou Fire Live
   aparece no Cache Storage;
7. offline mostra apenas a página neutra;
8. nenhum pedido de instalação/notificação ocorre no primeiro carregamento;
9. integração preserva handlers e contrato de Push da Spec 02.

### Aparelhos reais obrigatórios

- iPhone/iPad no menor iOS suportado e no atual;
- Chrome Android atual;
- Chrome desktop e Safari macOS;
- instalação, abertura standalone e remoção;
- online → offline → online;
- atualização entre dois deploys;
- no iOS, instalar e receber Push real com a Spec 02.

Lighthouse não é critério único de instalação. A prova é manifest/worker válidos
e instalação real nos aparelhos suportados.

### Pronto quando

- o app instala e abre em modo standalone nos alvos;
- manifest e ícones não têm erro;
- uma atualização chega sem servir build incompatível;
- offline nunca revela conteúdo autenticado;
- Fire Live nunca é servido de cache;
- o fluxo iOS orienta instalação antes de ativar alertas;
- o E2E iOS recebe Push quando a Spec 02 também estiver pronta.

---

# Plano

### Fatia 1 — Manifest e identidade

Implementar `manifest.ts`, metadata e ícones aprovados; adicionar testes de
existência, dimensão e tokens.

### Fatia 2 — Fundação do worker

Criar registro único, fallback offline, allowlist de assets, versionamento e
limpeza restrita. Validar que conteúdo dinâmico não entra no cache.

### Fatia 3 — Instalação

Construir estados de instalação Android/desktop/iOS com feature detection e
telemetria mínima.

### Fatia 4 — Integração Push

Adicionar ao mesmo worker os handlers da Spec 02, com contrato versionado e
atualização retrocompatível.

### Fatia 5 — Certificação e rollout

Preview HTTPS → matriz de aparelhos → produção sem Push público → canary integrado
→ expansão. Monitorar erro de worker, versão ativa, instalação e fallback.

Rollback publica worker compatível que deixa de cachear e limpa apenas caches da
aplicação. O manifest anterior fica disponível até os clientes migrarem.

---

## Decisões pendentes de rollout

1. aprovação do nome comercial e dos ícones candidatos;
2. menor iOS/iPadOS e Android oficialmente suportados;
3. momento exato do convite após entrega de valor;
4. copy e ilustrações das instruções de instalação.

Referências: [Web App Manifest](https://www.w3.org/TR/appmanifest/),
[Service Workers](https://www.w3.org/TR/service-workers/) e
[guia PWA do Next.js](https://nextjs.org/docs/app/guides/progressive-web-apps).
