# Modelo de dados

Postgres. Nomenclatura em português para o domínio (o vocabulário do CJ é o vocabulário
do sistema: _apito_, _nível_, _oscilação_, _OPD_, _randola_), inglês para infraestrutura.

---

## 1 · Domínio canônico (alimentado pela ingestão)

```sql
times (
  id, sigla, nome, logo_url, conferencia
)

jogadores (
  id, nome_completo, foto_url, posicao, altura_cm, numero_camisa, time_id
)

-- A ponte entre a lista do CJ e o provedor. Curadoria humana.
-- Necessária porque os elencos da lista são PROJETADOS: não correspondem
-- à NBA real (Giannis no Miami, LeBron no Philadelphia, Harden no Cleveland).
mapa_jogadores (
  id, nome_na_lista, jogador_id, provedor, provedor_player_id,
  score_similaridade, confirmado_por, confirmado_em
)

jogos (
  id, data_hora_utc, time_casa_id, time_visitante_id,
  status,              -- AGENDADO | AO_VIVO | ENCERRADO
  quarto_atual, tempo_restante, placar_casa, placar_visitante
)

-- Box score fechado, por jogo
estatisticas_jogo (
  id, jogo_id, jogador_id,
  minutos, pontos, rebotes_total, rebotes_of, rebotes_def, assistencias,
  cestas_c, cestas_t, dois_c, dois_t, tres_c, tres_t, lance_c, lance_t,
  roubos, bloqueios, turnovers, faltas, saldo_quadra
)

-- OBRIGATÓRIO para o Fire Live. Sem split por quarto não existe estratégia ao vivo.
estatisticas_quarto (
  id, jogo_id, jogador_id, quarto,
  pontos, rebotes, assistencias, minutos,
  atualizado_em
)

-- NOTA: não existe tabela de presença em quadra. O cliente confirmou que o
-- critério é DNP (fora da partida), não presença instantânea — o que dispensa
-- rastrear substituição em tempo real. Ver ADR-0006.

lesoes_escalacao (
  id, jogo_id, jogador_id,
  status,              -- ATIVO | FORA | DUVIDA | PROVAVEL
  motivo, confirmado, atualizado_em
)

medias_jogador (
  id, jogador_id, temporada, janela,   -- janela: TEMPORADA | ULTIMOS_5 | ULTIMOS_10
  jogos, ppg, rpg, apg, atualizado_em
)

-- Box score do TIME. Necessário para a aba de estatísticas (estilo Sofascore):
-- classificação, vitórias, médias e quebra por quarto.
estatisticas_time_jogo (
  id, jogo_id, time_id,
  pontos, pontos_q1, pontos_q2, pontos_q3, pontos_q4, pontos_prorrogacao,
  rebotes_total, rebotes_of, rebotes_def, assistencias,
  cestas_c, cestas_t, tres_c, tres_t, lance_c, lance_t,
  roubos, bloqueios, turnovers, faltas
)

classificacao (
  id, temporada, time_id, conferencia,
  vitorias, derrotas, posicao, aproveitamento,
  sequencia,           -- ex: V3, D2
  atualizado_em
)
```

---

## 2 · Dado editorial (vem do CJ, não do provedor)

Ciclo de vida próprio e versionado. **É o que mais muda no projeto** — precisa mudar sem
migration.

```sql
niveis_versao (
  id, versao, origem_arquivo, importado_por, importado_em, ativa
)

niveis (
  id, niveis_versao_id, jogador_id, time_id,
  atributo,            -- PONTOS | REBOTES | ASSISTENCIAS
  nivel,               -- MVP | ALL_STAR | SUPORTE | RANDOLA
  posicao_hierarquia,  -- 1..N no time — usado SÓ pela OPD
  UNIQUE (niveis_versao_id, jogador_id, atributo)
)
```

> Hoje só existe `atributo = PONTOS`. Quando o CJ mandar rebotes e assistências,
> é INSERT de uma nova versão — nada de schema muda.

---

## 3 · Odds (somente leitura — ADR-0004)

```sql
casas (
  id, nome, tipo_api, ativa
)

odds_snapshot (
  id, casa_id, jogo_id, jogador_id,
  atributo, linha, odd_over, odd_under, capturado_em
)

-- Materializada: a "média" que o cliente pediu
odds_agregada (
  id, jogo_id, jogador_id, atributo, linha,
  odd_min, odd_max, odd_mediana, qtd_casas,
  origem,              -- CASAS | TABELA_ESTATICA (fallback)
  calculado_em
)

-- Mesmo problema do mapa_jogadores, aplicado a mercados
mapa_mercados (
  id, casa_id, nome_mercado_na_casa, atributo, confirmado
)
```

Não existe tabela de conta de usuário em casa, credencial de casa ou aposta enviada.
Por decisão de escopo, **não são coletados**.

---

## 4 · Motor

```sql
rulesets (
  id, versao, conteudo_yaml, status, ativo_desde, criado_por
)

apitos (
  id, ruleset_versao,
  jogo_id, jogador_id, atributo,
  estrategia,          -- LISTA_SECRETA | FIRE_LIVE
  metodo,              -- OSCILACAO | OPD | NULL (fire live)
  nivel_apito,         -- 1 | 2 | 3
  turbo,               -- bool
  modo_fire,           -- bool (fire live)
  opd_origem_nivel,    -- cruzamento OPD pré-live × Fire Live
  linha, confianca, odd_min, odd_max,   -- "confianca", nunca "probabilidade" (P12)
  alvo_1q,             -- fire live
  gerado_em,

  UNIQUE (jogo_id, jogador_id, atributo, estrategia, linha)  -- idempotência
)

-- Feed materializado. É o que os 10k usuários leem — nunca o motor direto.
feed_snapshot (
  id, data_referencia, estrategia, conteudo_json, gerado_em, hash
)
```

A `UNIQUE` em `apitos` é a proteção contra push duplicado. Não é otimização — é
requisito funcional.

---

## 5 · Plataforma

```sql
usuarios (
  id, email, senha_hash, nome, status,    -- ATIVO | BLOQUEADO
  criado_em, ultimo_acesso
)

dispositivos (
  id, usuario_id, fingerprint, tipo,      -- MOBILE | DESKTOP
  user_agent, ip_ultimo, ativo_desde, ultimo_uso
)
-- Limite de 2 ativos. Ao entrar no 3º, encerra a sessão mais antiga.

sessoes (
  id, usuario_id, dispositivo_id, token_hash, expira_em, encerrada_em, motivo_encerramento
)

assinaturas (
  id, usuario_id, mercadopago_id, referencia_externa, produto,
  status, plano, inicio, fim, proxima_cobranca,
  ocorrido_em_origem, cancelamento_solicitado_em, cancelada_em, atualizado_em
)

cobrancas (
  id, usuario_id, assinatura_id, provedor, cobranca_externa_id,
  status, valor_centavos, moeda, aprovado_em, ocorrido_em_origem
)

direitos_acesso (
  id, usuario_id, produto, origem, referencia_origem,
  inicio, fim, revogado_em, motivo_revogacao
)

tentativas_checkout (
  id, usuario_id, produto, provedor, referencia_externa, chave_idempotencia,
  status, assinatura_externa_id, url_checkout, lease_expira_em, erro_codigo
)

push_inscricoes (
  id, usuario_id, dispositivo_id, endpoint, chave_p256dh, chave_auth
)

preferencias_notificacao (
  id, usuario_id, canal,                  -- FIRE_LIVE_APITO | GREEN | LISTA_SECRETA
  habilitado
)
```

---

## 6 · Observabilidade

```sql
saude_provedor (
  id, provedor, tipo,                     -- NBA_PRIMARIO | NBA_RESERVA | CASA
  ultima_resposta_ok, latencia_ms, status, dado_mais_recente_em
)
-- "Alerta de dado parado": dispara quando dado_mais_recente_em fica além do
-- limite esperado para a janela atual (mais rígido durante os jogos).

log_falhas (
  id, origem, severidade, mensagem, contexto_json, ocorrido_em
)
```

---

## Índices que não são opcionais

```sql
-- Oscilação varre histórico por jogador constantemente
CREATE INDEX ON estatisticas_jogo (jogador_id, jogo_id DESC);

-- Fire Live lê o 1Q dos jogos ao vivo a cada ciclo
CREATE INDEX ON estatisticas_quarto (jogo_id, quarto) WHERE quarto = 1;

-- OPD reprocessa a cada mudança de escalação
CREATE INDEX ON lesoes_escalacao (jogo_id, status);

-- Feed do dia
CREATE INDEX ON apitos (gerado_em DESC, estrategia);
```
