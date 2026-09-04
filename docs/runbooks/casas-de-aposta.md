# Runbook — ligar uma casa de aposta (BetMGM ou Altenar)

**Data:** 28/08/2026 · implementa a seção 6 da spec
[`2026-08-28-casas-betmgm-altenar-design.md`](../superpowers/specs/2026-08-28-casas-betmgm-altenar-design.md).

O código das duas casas **já está pronto e testado**. Ligar uma delas é
preencher variáveis de ambiente e confirmar a curadoria — **nenhum código
muda**. Sem as variáveis, a fonte simplesmente não existe e o app funciona
exatamente como hoje (a tabela estática é o fallback das telas).

---

## Regra que governa este runbook

**A chave NUNCA aparece em arquivo commitado.** Nem em código, nem em doc, nem
em script "temporário" — foi assim que um token vazou para a main em 25/08. A
credencial vive em dois lugares, e só:

| Onde | Para quê |
| --- | --- |
| `.env.local` (gitignored) | censo e testes locais |
| Painel da Vercel → Environment Variables | produção |

Se uma credencial aparecer em qualquer outro lugar — inclusive numa conversa
ou num print — **rode-a**: crie outra no painel da casa e apague a exposta.

**E o limite que não é opcional:** o que estas contas dão é **leitura de
cotação pública** (ADR-0004). Nenhuma credencial de apostador, nenhum envio de
aposta, nenhuma movimentação de dinheiro — não existe tabela, rota ou campo
para isso no projeto, e não vai existir.

---

## Passo 1 · Preencher as variáveis

### BetMGM (Afiliados V2)

| Env | O que é | Obrigatório |
| --- | --- | --- |
| `ODDS_BETMGM_BASE_URL` | host da API de afiliados (o PDF não o revela — vem com a conta) | sim |
| `ODDS_BETMGM_API_KEY` | credencial da conta | sim |
| `ODDS_BETMGM_BRAND` | marca da conta; a V2 exige em 100% das chamadas | sim |
| `ODDS_BETMGM_LOCATION` | localidade da conta; idem | sim |
| `ODDS_BETMGM_LANG` | idioma; padrão `en` | não |
| `ODDS_BETMGM_AUTH_HEADER` | cabeçalho da credencial; padrão `Authorization` | não |
| `ODDS_BETMGM_AUTH_PREFIX` | prefixo do valor; padrão `Bearer ` (com o espaço) | não |

Os dois últimos existem porque o PDF diz apenas que os mecanismos de
autenticação "permanecem inalterados", sem especificar o esquema. Se a conta
usar, por exemplo, `X-Api-Key` sem prefixo, é `ODDS_BETMGM_AUTH_HEADER=X-Api-Key`
e `ODDS_BETMGM_AUTH_PREFIX=` — sem tocar em código.

### Altenar

| Env | O que é | Obrigatório |
| --- | --- | --- |
| `ODDS_ALTENAR_GATEWAY_BASE` | base do gateway (authenticate + `/api/v1/*`) | sim |
| `ODDS_ALTENAR_ORIGIN` | `Origin` registrado para a NOSSA integração | sim |
| `ODDS_ALTENAR_INTEGRATION` | nome da NOSSA integração (`x-Integration`) | sim |
| `ODDS_ALTENAR_SPORT_ID` | id interno do basquete — descoberto no passo 2 | sim |
| `ODDS_ALTENAR_CHAMP_ID` | id do campeonato (NBA), para filtrar | não |

O guia de integração que temos é de OUTRA conta. `Origin`, `integration` e os
ids são por conta: **não copie os do guia**.

**Config incompleta = fonte desligada.** Falta `brand`? A BetMGM não entra na
coleta. É de propósito: meia-config ligaria um job que falha todo dia às 9h em
silêncio.

## Passo 2 · Descobrir os ids da Altenar

O `sportId` do basquete é interno por integração. Com o token em mãos:

```
GET {ODDS_ALTENAR_GATEWAY_BASE}/api/v1/sports/top?culture=pt-BR&integration=…
```

Ache o basquete na lista e o campeonato NBA dentro dele. Fixe os dois nas
variáveis. Nunca chute — id errado devolve eventos de outro esporte, e o
casador vai (corretamente) não achar par para nenhum.

## Passo 3 · Rodar o censo e confirmar a curadoria

```bash
npx dotenv -e .env.local -- npm run odds:censo -- --fonte=altenar
npx dotenv -e .env.local -- npm run odds:censo -- --fonte=betmgm
```

O censo é **somente leitura**: não grava nada. Ele imprime todo nome de
mercado que a casa publica hoje, com a contagem de cotações ativas, e todo
nome de jogador que dá para ler. É a matéria-prima da curadoria, e existe
porque **nenhuma das duas documentações mostra como a casa grafia os props de
NBA** — adivinhar aqui é média calculada sobre o mercado errado.

Com a saída na mão:

1. **`mapa_mercados`** — para cada nome de mercado que é prop de PONTOS,
   REBOTES ou ASSISTÊNCIAS, uma linha `(casa, nome_mercado_na_casa, atributo,
   confirmado=true)`. Mercado fora do mapa não vira cotação: é descarte
   contado no resultado do job, nunca erro silencioso.
2. **`mapa_jogadores_casa`** — a coleta semeia sozinha os nomes que casam com
   **exatamente um** jogador canônico (nascem confirmados). Nome ambíguo
   ("Murray", com dois na liga) ou desconhecido nasce **pendente** e não
   resolve cotação até um humano decidir. Reveja os pendentes:

   ```sql
   SELECT m.nome_na_casa, c.nome AS casa
   FROM mapa_jogadores_casa m JOIN casas c ON c.id = m.casa_id
   WHERE m.confirmado = false ORDER BY c.nome, m.nome_na_casa;
   ```

   Confirmar é apontar o `jogador_id` certo e marcar `confirmado = true`.

## Passo 4 · Conferir a primeira coleta

Depois do cron diário (ou de uma execução manual), o resultado do job traz,
por fonte: `vinculados`, `semPar`, `ambiguos`, `cotacoes`, `agregadas`,
`descartadas`, `semVinculo`, `aguardandoCuradoria`, `abaixoDoMinimo`.

Leitura rápida do que cada número quer dizer:

- `semPar` alto → o nome dos times na casa não bate com o nosso (o casador
  aceita nome completo e sigla, nas duas ordens); vale conferir a grafia.
- `ambiguos` > 0 → dois jogos do dia com o mesmo confronto; ninguém vinculou,
  de propósito.
- `aguardandoCuradoria` alto → falta `mapa_mercados` (passo 3).
- `semVinculo` alto → falta confirmar jogadores (passo 3).
- `abaixoDoMinimo` alto → a linha existe, mas em menos casas do que
  `odds.casas_minimas` exige no ruleset. Não é defeito: é a regra do CJ
  segurando média de casa única. Com duas casas ligadas, isso cai sozinho.

E o teste final, no banco:

```sql
SELECT qtd_casas, count(*) FROM odds_agregada WHERE origem = 'CASAS' GROUP BY 1;
```

`qtd_casas` conta casas **distintas**. Com BetMGM e Altenar ligadas junto do
provedor, é aqui que a média entre casas do card começa a existir de verdade.

## Passo 5 · Considerar a fonte no ar

Só depois do passo 4 com números que fazem sentido. A partir daí o cron diário
coleta sozinho, e **uma fonte com erro não derruba as outras nem o resto da
sincronização** — o erro entra no resultado do job e a próxima execução tenta
de novo.

---

## Desligamento

Apagar (ou esvaziar) qualquer variável obrigatória da fonte e fazer Redeploy.
A fonte some da coleta; o que já foi agregado continua no banco; as telas
seguem funcionando. Não há flag separada de propósito — a configuração É o
interruptor.
