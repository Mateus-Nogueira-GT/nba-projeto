# Tela de partida e nota da partida — o ciclo 1 do "modo Sofascore"

**Data:** 26/08/2026 · **Status:** aprovado em brainstorming, aguardando plano
**Decisor:** parceiro (Mateus) · abordagem A aprovada em chat

---

## 1 · Contexto e posicionamento

Pesquisa de 26/08 sobre o Sofascore (basquete): tela de partida rica (box score
individual ao vivo, líderes, H2H, forma, escalações), play-by-play com
momentum, rating de jogador por partida (escala 3–10, base 6.5), shot maps,
favoritos com push, rankings e comparador.

**Posicionamento decidido: stats de elite como RETENÇÃO.** O coração do
produto continua sendo a estratégia do CJ (apitos, assinatura); a aba de
estatísticas sobe de nível para o assinante viver dentro do app. Não é pivô
para live-score aberto.

**Fatias do gap, em ordem:** (1) tela de partida, (2) nota da partida —
ESTA SPEC; depois, cada uma com spec própria: favoritos + push de jogo,
rankings + comparador, play-by-play/momentum (pendente de confirmação de
dado no provedor). Shot maps estão FORA de alcance: nenhum provedor escolhido
(BALLDONTLIE GOAT, API-Sports Ultra) fornece coordenada de arremesso.

**Teste de realidade:** tudo nesta spec constrói sobre schema e demo que já
existem (`estatisticas_jogo` tem box por jogador por jogo; `estatisticas_time_jogo`
tem quartos; `lesoes_escalacao` existe; H2H e forma são consultas sobre o
histórico semeado). Nada depende de contratar provedor.

## 2 · Fronteira que governa tudo

A tela de partida é **dado canônico** — o lado real da fronteira, como a aba
de estatísticas inteira (exceção documentada no CLAUDE.md): elencos e times
vêm do box score real e de `jogadores.time_id`, nunca da lista do CJ. Nada
aqui alimenta o motor, e o motor não sabe que a tela existe.

## 3 · Tela de partida

**Rota:** `/estatisticas/jogo/[id]` · **Módulo:** `entrega/estatisticas/jogo.ts`
com `telaDoJogo(db, jogoId, { temporada })`, leitura direta no padrão de
`telaDoTime` — sem snapshot: snapshot é para feed materializado do motor,
não para consulta canônica.

Três estados pelo `jogos.status`:

| Estado | O que mostra |
| --- | --- |
| `AGENDADO` (pré-jogo) | horário, H2H (últimos 5 confrontos entre os dois times, placar e vencedor), forma recente (V/D dos últimos 5 de cada), desfalques de `lesoes_escalacao` (FORA/DÚVIDA + selo confirmado) |
| `AO_VIVO` | placar grande, parcial por quarto dos dois lados, box individual parcial, refresh automático (abaixo) |
| `ENCERRADO` | tudo acima completo + líderes da partida (PTS/REB/AST) + box score individual dos dois elencos: MIN, PTS, REB, AST, ROU, TOC, TO, FG%, 3P%, LL%, **nota** — cada linha linka ao perfil do jogador |

**Ao vivo sem WebSocket:** componente cliente `AtualizarAoVivo` que chama
`router.refresh()` a cada 30s SOMENTE quando o jogo está `AO_VIVO` (prop do
servidor). O resto do app permanece server-first. O dado ao vivo real depende
do cron `ao-vivo` (a cada minuto), que exige `CRON_COMPLETO=true` (plano Pro,
ADR-0003); na demo, o jogo ao vivo semeado já exercita o estado.

**Entradas para a tela:** os cards de jogos do dia na aba Stats e o histórico
da tela do TIME (`jogosDoTime` carrega `jogoId`; cada partida vira link).

## 4 · Nota da partida

Função **pura** em `entrega/estatisticas/nota.ts`. Calculada na leitura;
nenhuma coluna nova; o motor não a vê.

1. **Game Score de Hollinger** sobre a linha de `estatisticas_jogo`:
   `PTS + 0.4·FGM − 0.7·FGA − 0.4·(FTA−FTM) + 0.7·ORB + 0.3·DRB + STL +
   0.7·AST + 0.7·BLK − 0.4·PF − TOV` (todas as colunas existem). Fórmula
   pública — não é invenção nossa nem regra do CJ.
2. **Normalização:** `nota = clamp(3, 10, 6.5 + (gameScore − 10) × 0.15)`.
   Game score 10 (titular mediano) → 6.5; 30 → 9.5. As constantes
   (`BASE = 6.5`, `REFERENCIA = 10`, `ESCALA = 0.15`, `PISO = 3`, `TETO = 10`)
   são nomeadas e comentadas NO MÓDULO — não vão ao ruleset, porque o ruleset
   é a estratégia do CJ e a nota é dado de consulta que nunca alimenta o motor.
3. **Menos de 5 minutos → sem nota** (exibe "—"): nota de quem quase não
   jogou é ruído. `MINUTOS_MINIMOS = 5`, no módulo.
4. **Exibição:** uma casa decimal (vírgula pt-BR), badge com paleta PRÓPRIA —
   deliberadamente distinta das cores de grau de confiança do apito, para as
   duas escalas nunca se confundirem. Faixas do badge (componente
   `NotaPartida` no design system): `< 6` fraca · `6–6.9` mediana · `7–7.9`
   boa · `8–8.9` ótima · `9+` excepcional.

**Vocabulário:** sempre **"nota da partida"** (ou "nota"). Proibido "nível"
(colide com nível do jogador/nível do apito do CJ), proibido "rating de
confiança", proibida — como em todo o produto — a palavra "probabilidade".

**Nota ao CJ (não bloqueia):** registrar em `docs/specs/README.md` que a aba
de consulta passou a exibir uma nota de desempenho por partida, calculada por
fórmula pública sobre o box score, sem participação na estratégia.

## 5 · Calendário e navegação por data

`/estatisticas?data=YYYY-MM-DD`: `← dia anterior · hoje · dia seguinte →` no
topo dos jogos do dia. `telaJogosDoDia` já aceita a data; a mudança é validar
o parâmetro (formato e existência), montar os links e manter o comportamento
atual quando a query está ausente (hoje). Cada card de jogo linka para
`/estatisticas/jogo/[id]`; jogo ao vivo mantém o ponto pulsante existente.

## 6 · Erros e vazios

- Jogo inexistente → `notFound()` (404 da moldura).
- Pré-jogo sem desfalque/escalação → a seção não aparece; nunca tabela vazia
  com travessões (lição registrada no histórico do projeto).
- `AO_VIVO` com box individual ainda não sincronizado → parcial por quarto +
  linha "box score em atualização" — ausência anunciada.
- Menos de 5 min → nota "—".
- H2H vazio → "primeiro confronto da temporada".

## 7 · Testes

- `nota.ts`: bateria pura — fórmula contra casos calculados à mão, clamp nos
  dois extremos, sem-nota < 5 min, monotonicidade (mais pontos, resto igual,
  nunca baixa a nota).
- `telaDoJogo` (PGlite + `semearDemo`): ENCERRADO com dois box completos e
  líderes coerentes com as linhas; AO_VIVO com parcial e sem veredito;
  AGENDADO com pré-jogo e H2H não-vazio (o rodízio da demo garante);
  inexistente → null.
- Render (`telas-demo.test.ts`): identidade 03, nota visível no box,
  "probabilidade" ausente, pré-jogo sem tabela vazia.
- `demo:conferir`: checks da tela nas três variantes (a demo de hoje tem 1 ao
  vivo, 3 agendados, 24 encerrados).

## 8 · Fora de escopo desta spec

- Favoritos e push de jogo (fatia própria, reusa infra de push).
- Rankings da liga e comparador de jogadores (fatia própria).
- Play-by-play e momentum (pendente confirmar dado no tier GOAT).
- Shot maps/heatmaps (sem dado nos provedores escolhidos).
- Rating agregado da temporada e ranking por nota (só faria sentido com
  persistência — decisão adiada de propósito; a função pura permite adicionar
  depois sem retrabalho).
- Multi-ligas.
