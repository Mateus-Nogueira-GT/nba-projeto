# Correções do pente fino de 09/10

**Origem:** [docs/auditorias/2026-10-09-pente-fino.md](../../auditorias/2026-10-09-pente-fino.md), 17
achados. **Pedido do parceiro:** spec e plano para corrigir.

## 1. Escopo

Entram os achados 1 a 15. Ficam fora, por serem decisão e não defeito: 16 (termos de uso no
cadastro: perguntar ao cliente) e 17 (clique não deduplicado: decisão da spec de afiliados).

## 2. Decisões de desenho

### 2.1 Indicação consumada não se perde (achado 1, ALTO)

Uma atribuição com `usuario_id` preenchido **e** evento `CADASTRO_NIP` está **fechada**. O uso
posterior do mesmo cookie por outra conta:
- não rebaixa a atribuição fechada para `CONFLITO`;
- não associa a conta nova a ela (a conta nova fica sem indicador, como hoje acontece com quem já
  tem conta e faz login com cookie alheio);
- registra o ocorrido numa linha nova de atribuição em estado `CONFLITO`, ligada ao mesmo link,
  para o admin enxergar o aparelho compartilhado sem perder o dado original.

O estado `CONFLITO` continua existindo para atribuição **anônima** que recebe duas contas antes de
qualquer cadastro. Teste-âncora: "a indicação consumada sobrevive ao login de um terceiro e ao
segundo cadastro no mesmo navegador, e a assinatura do indicado continua atribuída".

### 2.2 Cancelar cancela o contrato vigente (achado 2, ALTO)

`cancelarAssinaturaDoUsuario` passa a escolher com o **mesmo critério da tela**: `cancelada_em IS
NULL`, depois `atualizado_em` mais recente. Sem contrato vigente, a action devolve
`/conta?cancelamento=erro` com motivo "nenhuma assinatura ativa para cancelar", sem chamar o
Mercado Pago. O formulário de `/conta` passa a enviar o `assinaturaId`, e a action só aceita um id
que pertença ao usuário da sessão; o id é a fonte, o critério acima é a defesa quando ele falta.

### 2.3 Fire Live não congela por causa do matchup (achado 3, MÉDIO)

`calculadoraDeMatchup` apaga a chave do memo quando a promessa rejeita. Na materialização do
Fire Live, falha ao ler o matchup vira `matchup: null` em todos os itens daquele ciclo, com um
log `matchup_indisponivel`, e o ciclo segue. A Lista Secreta e o retroativo continuam lançando:
lá o custo de parar é zero e o dado tem de estar certo.

### 2.4 Posição guardada com a estrela (achado 9, BAIXO)

`MatchupDoItem.motivos` passa de `Metrica[]` para `{ metrica, posicao }[]`. O painel imprime só
o que veio com o item; o cache de perfis deixa de ser consultado para a frase. Snapshots antigos
(motivos como texto) continuam válidos: o leitor aceita os dois formatos.

### 2.5 Lista e resumo sem "—" em Confiança (achado 10, BAIXO)

Onde a confiança é `null` por o atributo não ter nota (`temNotaDeConfianca` false), a Lista e o
resumo da rodada mostram a mesma marca do painel, "N{x}" na cor do apito, no lugar de "—". O
cabeçalho da coluna continua "Confiança". Fire Live mantém "—": lá a ausência é de dado, não de
regra.

### 2.6 Temporada com dado de verdade (achado 8, BAIXO)

A resolução de grafias por média só considera uma temporada com `jogos >= N`. **N vai para o
ruleset** (`niveis.resolucao_por_media.jogos_minimos`), proposta: **5**. O parceiro confirma o
número; o código só lê a chave. O script `lista-cj:restaurar` também aceita `--temporada=` para
fixar a temporada quando o operador quiser.

### 2.7 Destino pós-login por forma (achado 6, MÉDIO)

`DESTINOS_POS_LOGIN_POR_FORMA` ganha as telas que o portão manda: `/fire-live`, `/gestao`,
`/estatisticas`, `/estatisticas/<segmentos>`, `/resultados/<AAAA-MM-DD>` e `/apito/<id>`, só com
caracteres `[A-Za-z0-9_-/]` e sem `..`, `?`, `#` ou controle. O mesmo filtro vale no aceite da
metodologia. O comentário do portão passa a dizer o que acontece.

### 2.8 Scripts da demo com a mesma guarda do cron (achado 5, MÉDIO)

`demo:seed`, `demo:temporada` e `demo:limpar` chamam `motivoParaNaoSemear` e abortam com a mesma
mensagem do cron. `demo:limpar` em banco com checkpoint de ingestão real só roda com a flag
adicional `--apagar-dado-real`, e imprime antes o que vai apagar.

### 2.9 Fila de push com segredo próprio (achado 4, MÉDIO, reforço)

As duas rotas da fila exigem o cabeçalho `x-nip-fila` igual a `FILA_PUSH_SECRET`, comparado com
`timingSafeEqual`, **antes** do `handleCallback`; sem a variável, 503 como os crons. O
`PublicadorFanoutVercel` envia o cabeçalho no `send()`. A Vercel já esconde a rota; isto é a
segunda camada. **Exige a variável em produção** (o parceiro cria; sem ela a fila para).

### 2.10 Pequenos

- **Cookie de visitante inválido (7):** `/r` e `/ir` validam o valor lido pela mesma regra de
  `hashVisitante`; inválido vira `novoTokenVisitante()`.
- **Cortesia (11):** `conceder-cortesia` usa `intervaloDoDia(ate, rodada.fuso).fim`.
- **Log do cadastro (13):** `console.error` com `{ evento, erro: erro.name }`, como `/r`.
- **Comentário de `exigirNivel` (15):** descreve o comportamento real (bloqueado cai em `/entrar`).
- **Dependências (14):** `next` para a última 16.3.x. O `workflow` fica: o fix é major.
- **Enumeração de e-mail (12):** **não muda agora.** Sem provedor de e-mail, a mensagem única
  obrigaria a esconder o resultado do cadastro; o limite de 5/h por e-mail e 30/h por IP contém o
  abuso. Fica registrado para quando houver e-mail transacional.

## 3. Fora do escopo

Termos de uso (16), dedupe de clique (17), `workflow` major (14), e-mail transacional (12).
