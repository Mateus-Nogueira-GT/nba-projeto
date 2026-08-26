# ADR-0009 — A LLM narra; ela nunca decide

**Status:** aceito · 25/08/2026 · implementa a spec de LLM routing

## Contexto

O produto ganhou geração de texto por LLM em quatro frentes (narrativa do card,
resumo do dia, chat do assinante, sugestão de vínculos no admin). A tentação
óbvia — e o erro que este ADR fecha — seria deixar a LLM opinar sobre QUEM
apita.

## Decisão

A LLM recebe fatos que o motor já decidiu e produz texto sobre eles. Ela não
decide, não consulta banco e não bloqueia o produto.

Quatro mecanismos sustentam isso:

1. **A porta é de ingestão (L0)**, não do motor. `src/modules/motor/**` não
   importa nada de LLM, e a fronteira é verificada pelo dependency-cruiser.
2. **O validador** (`validador.ts`) reprova texto com a palavra "probabilidade"
   e com qualquer número que não esteja nos fatos de entrada. Alucinação de
   estatística morre antes da tela.
3. **A publicação nunca espera a LLM.** O snapshot é gravado primeiro, SEM
   narrativa — a lista já está no ar a partir desse insert. Só depois roda o
   enriquecimento, e o resultado volta com um UPDATE que toca somente
   `conteudo_json`; `hash` e `geradoEm` não mudam, porque nada na estratégia
   mudou. Se o provedor de LLM travar ou estourar o timeout, essa segunda
   etapa morre e a lista fica publicada sem narrativa — estado normal, não
   incidente. O inverso (esperar a LLM antes de publicar) não é aceitável: o
   cron tem `maxDuration` finito, e um provedor lento faria a função morrer
   antes do insert — a lista simplesmente não sairia.
4. **A narrativa é anexada depois do hash** do snapshot. Texto de LLM não é
   determinístico; se entrasse no hash, cada execução do cron republicaria a
   lista e dispararia push repetido.

## Consequências

- Reexecutar a publicação com os mesmos fatos **não chama a LLM** — idempotente
  e sem custo.
- Falha da LLM degrada a feature, nunca o produto: card sem narrativa, chat
  indisponível, sugestão de vínculo ausente.
- Sem `OPENROUTER_API_KEY` o app funciona inteiro com o adapter fake.
- O custo real é observável em `llm_chamadas` sem depender do painel do
  provedor.
- `ItemFeed`/`ConteudoFeed` moram em `tipos-feed.ts`, um módulo-folha, e não em
  `lista-secreta.ts`. A publicação (`lista-secreta.ts`) chama
  `enriquecerComNarrativas` (`narrativa.ts`) em tempo de execução, e a
  narrativa precisa dos tipos de item/conteúdo; importá-los de volta de
  `lista-secreta.ts` fecharia um ciclo que a guarda
  `sem-dependencia-circular` do dependency-cruiser proíbe. `lista-secreta.ts`
  continua sendo o ponto de importação público — reexporta os dois tipos —
  então nada fora desses dois módulos precisa saber onde eles moram.

## Alternativas descartadas

**LLM sugerindo entradas.** Viola a regra 3 do projeto: regra de estratégia é
do CJ, e apito inventado vira push errado no celular de assinante pagante.

**Gerar narrativa na tela, sob demanda.** Custo por usuário em vez de por
evento, e a tela passaria a chamar rede — quebra `tela-nao-chama-o-motor`.
