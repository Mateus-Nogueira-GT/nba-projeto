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
| `ODDS_BETMGM_AUTH_PREFIX` | esquema do valor; padrão `Bearer` (o espaço é o código que põe); vazio = chave nua | não |

Os dois últimos existem porque o PDF diz apenas que os mecanismos de
autenticação "permanecem inalterados", sem especificar o esquema. Se a conta
usar, por exemplo, `X-Api-Key` sem prefixo, é `ODDS_BETMGM_AUTH_HEADER=X-Api-Key`
e `ODDS_BETMGM_AUTH_PREFIX=` (vazio) — sem tocar em código. Painel e shell
costumam apagar espaço no fim do valor; por isso o esquema é gravado sem ele.

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
   confirmado=true)`. **Grave o nome exatamente como o censo imprime**: na
   Altenar o nome do mercado traz o jogador ("Total de Pontos - Stephen
   Curry") e o censo já o separa — o que se confirma é o MODELO, `Total de
   Pontos`, uma vez por casa, e vale para todos os jogadores de todas as
   noites. Prop fora do mapa não vira cotação: conta em
   `aguardando_curadoria` no resultado do job, nunca soma em silêncio.
2. **Vínculos de jogador** — vivem em `mapa_jogadores`, no namespace
   `casa:<nome>`, a MESMA tabela que o painel `/admin/mercados` lê e escreve.
   A coleta semeia sozinha, a cada noite, os nomes que a casa cotou: nome que
   casa com **exatamente um** jogador canônico nasce confirmado (assinado
   `semeadura:nome-exato` em `confirmado_por`, para ser auditável e
   reversível); ambíguo ("Murray", com dois na liga) ou desconhecido nasce
   **pendente** e não resolve cotação até um humano decidir — no painel, ou
   por SQL:

   ```sql
   SELECT nome_na_lista, provedor
   FROM mapa_jogadores
   WHERE provedor LIKE 'casa:%' AND confirmado_em IS NULL
   ORDER BY provedor, nome_na_lista;
   ```

   Um pendente cuja ambiguidade sumiu (o jogador entrou no elenco) é promovido
   sozinho na noite seguinte. Uma confirmação humana nunca é sobrescrita.

## Passo 4 · Conferir a primeira coleta

Depois do cron diário (ou de uma execução manual), o resultado do job traz,
por fonte, chaves `odds_<fonte>_…`: `vinculados`, `sem_par`, `ambiguos`,
`fora_do_dia`, `cotacoes`, `descartadas`, `sem_vinculo`,
`aguardando_curadoria`, `jogadores_confirmados`, `jogadores_pendentes`,
`jogos_com_erro`; e, do DIA (todas as casas juntas): `odds_agregadas` e
`odds_abaixo_do_minimo`. Fonte que falhou aparece como `odds_<fonte>_erro=1`
e soma em `falhas_fontes` — a execução fica **PARCIAL**, não SUCESSO.

Leitura rápida do que cada número quer dizer:

- `sem_par` alto → o nome dos times na casa não bate com o nosso (o casador
  aceita nome completo, sigla e apelido — "Lakers" —, nas duas ordens); vale
  conferir a grafia.
- `ambiguos` > 0 → dois jogos do dia com o mesmo confronto, ou dois eventos da
  casa para o mesmo jogo; ninguém vinculou, de propósito.
- `fora_do_dia` → eventos que a casa devolveu para OUTRO dia (a BetMGM manda a
  agenda inteira); esperado, não é defeito.
- `aguardando_curadoria` alto → falta `mapa_mercados` (passo 3, item 1).
- `sem_vinculo` / `jogadores_pendentes` alto → falta confirmar jogadores
  (passo 3, item 2).
- `odds_abaixo_do_minimo` alto → a linha existe, mas em menos casas do que
  `odds.casas_minimas` exige no ruleset. Não é defeito: é a regra do CJ
  segurando média de casa única. A média nasce quando a SEGUNDA casa cota a
  mesma linha na mesma noite.
- `odds_<fonte>_prazo_esgotado` → o cron ficou sem tempo para essa fonte; a
  próxima execução completa (tudo é idempotente).

E o teste final, no banco:

```sql
SELECT qtd_casas, count(*) FROM odds_agregada WHERE origem = 'CASAS' GROUP BY 1;
```

`qtd_casas` conta casas **distintas**. Com BetMGM e Altenar cotando a mesma
linha na mesma noite, `qtd_casas = 2` é a média entre casas do card existindo
de verdade.

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
