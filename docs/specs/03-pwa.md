# Spec 03 — PWA instalável

**Estado:** proposta · 19/08/2026
**Depende de:** spec 02 (mesmo service worker)
**Destrava:** push no iPhone — Safari só entrega para PWA instalado

---

## Problema

A primeira linha de `docs/00-visao.md` define o produto:

> PWA (Android, iOS e web — **instalável pelo navegador, sem loja**)

Hoje não existe nem o diretório `public/`. Sem manifest, sem ícones, sem service
worker. `layout.tsx` tem quatro linhas úteis:

```tsx
export const metadata = { title: 'IA da NBA' }
```

Sem viewport, sem cor de tema, sem metadata de instalação. O navegador não oferece
"adicionar à tela inicial" porque não há o que instalar.

**A consequência mais dura é no iOS:** Safari só entrega Web Push para PWA já
adicionado à tela inicial. Sem esta spec, metade dos assinantes não recebe apito
nenhum, por mais correta que a spec 02 esteja.

---

## Escopo

### Entra

- `public/` com manifest, ícones e assets
- Metadata completa em `layout.tsx`: viewport, tema, Apple
- Registro do service worker da spec 02
- Cache offline do feed já baixado
- Convite de instalação, no momento certo

### Não entra

- Push (spec 02) — este documento só **registra** o service worker que ela escreve
- Loja de aplicativos: fora do v0 por decisão explícita da visão

---

## Contrato

### Manifest

```
public/manifest.webmanifest
  name             "IA da NBA"
  short_name       "IA da NBA"
  display          "standalone"
  start_url         "/"
  background_color  #080D16   ← primitivo.tinta900
  theme_color       #080D16
  icons             192, 512, e um maskable 512
```

As cores saem de `src/design-system/tokens/primitivo.ts`, o único arquivo do
projeto onde hex pode existir. **O manifest é JSON e não importa TypeScript** —
então ele é a única exceção viável à regra, e por isso precisa ser gerado a
partir do token, não escrito à mão.

> **Proposta:** um script `npm run manifest` que lê o primitivo e escreve o
> `.webmanifest`, no mesmo espírito de `npm run tokens`, que já gera o CSS. Um
> teste confere que o arquivo em disco bate com o token — igual ao que já existe
> para os tokens CSS.

### Ícones

Não existem. É trabalho de design, não de código, e **bloqueia a instalação** —
um manifest apontando para ícone inexistente faz o navegador recusar a instalação
inteira.

Mínimo: 192×192, 512×512 e um 512×512 *maskable* com margem de segurança para o
recorte circular do Android.

### Cache offline

O feed é snapshot cacheado por desenho (ADR-0003). Isso combina com offline:

| Recurso | Estratégia | Por quê |
| --- | --- | --- |
| Shell do app | cache-first | não muda entre deploys |
| Feed da Lista Secreta | stale-while-revalidate | ver a lista de ontem é melhor que tela branca |
| Estatísticas | network-first | número velho apresentado como atual é o defeito que a aba existe para evitar |
| Fire Live | **nunca cachear** | alvo do 1º quarto tem validade de minutos |

> A regra do Fire Live não é otimização: um apito servido do cache 20 minutos
> depois manda o assinante para uma janela de aposta que já fechou.

A tela de estatísticas já mostra o horário do dado. Offline, esse horário é o que
impede o cache de mentir — e é por isso que ele foi feito obrigatório por tipo,
não por convenção.

---

## Regras que isto toca

- **Regra 1** — cor de tema é token, não literal. O manifest é gerado.
- **ADR-0003** — o feed é snapshot; o cache reforça a decisão, não a contorna
- **Requisito de frescor** (`docs/00-visao.md`) — toda tela informa o horário do
  dado. O cache **não pode** apagar isso: a tela servida do cache exibe o horário
  do dado cacheado, não o da renderização.

---

## Perguntas antes de codar

1. **Os ícones existem?** É a única dependência externa desta spec. Sem eles o
   PWA não instala.
2. **Nome curto na tela inicial.** "IA da NBA" tem 10 caracteres e cabe; confirmar
   com o cliente se é o nome comercial.
3. **O app funciona offline sem sessão?** O paywall da spec 04 muda a resposta:
   se o feed exige assinatura, o cache offline serve conteúdo pago sem checagem.
   Decidir junto com a spec 04.

---

## Pronto quando

- Chrome no Android oferece instalar, e o app abre em janela própria
- Safari no iPhone adiciona à tela inicial e **recebe push** (fecha a spec 02)
- Lighthouse aponta o app como instalável, sem erro de manifest
- Sem rede, a Lista Secreta já vista abre e informa o horário do dado cacheado
- Sem rede, a tela de Fire Live **não** serve conteúdo de cache
- O manifest em disco bate com `primitivo.ts`, verificado por teste

---

# Plano

### Fatia 1 · Manifest gerado

1. `scripts/gerar-manifest.mts`, no molde de `gerar-tokens-css.mts`
2. `npm run manifest`
3. Teste: o arquivo bate com o token, como o teste de tokens CSS já faz

### Fatia 2 · Metadata

1. `layout.tsx` ganha `viewport`, `themeColor`, `appleWebApp`, `manifest`
2. `lang="pt-BR"` já está correto

### Fatia 3 · Ícones

Depende de design. Enquanto não vierem, um placeholder gerado a partir do token
mantém a instalação funcionando — **com issue aberta**, nunca silenciosamente.

### Fatia 4 · Service worker

1. Estender o `public/sw.js` da spec 02 com as estratégias de cache da tabela
2. Registrar no cliente, depois do primeiro carregamento
3. Versionar o cache pelo hash do build; limpar os antigos no `activate`

### Fatia 5 · Convite de instalação

1. Capturar `beforeinstallprompt`
2. Oferecer depois de valor entregue — nunca no primeiro carregamento
3. iOS não tem esse evento: instrução manual, detectando Safari

---

## Riscos

**Service worker mal versionado serve build velho para sempre.** É o defeito
clássico de PWA. Mitigação: cache nomeado pelo hash do build e limpeza no
`activate`; nunca `cache-first` no HTML.

**Cache e paywall se contradizem.** Conteúdo pago em cache continua acessível
depois do cancelamento. Resolver junto com a spec 04 — provavelmente não cachear
nada de assinante fora do shell.

**iOS é irregular.** Push em PWA iOS existe desde o 16.4, mas o comportamento
varia por versão. Testar em aparelho real, não só no simulador.
