/**
 * A METODOLOGIA DO CJ EM PROSA, PARA O PROMPT.
 *
 * Os dois prompts (narrativa e chat) prometiam "o texto fixo da metodologia"
 * (spec §4.1 e §5) e nenhum dos dois o mandava. Sem isso o chat não tinha como
 * responder "o que é OPD?" a não ser inventando — e inventar regra do CJ é
 * exatamente o que a regra 3 do projeto proíbe.
 *
 * NÃO é a mesma coisa que `teoria/conteudo.ts`. Aquele módulo LÊ o ruleset e
 * devolve estrutura com os números (deltas, multiplicadores, marcos) para a
 * aba teórica desenhar tabelas. Aqui a exigência é o oposto: o texto precisa
 * ser SEM NÚMERO NENHUM. O validador reprova qualquer número que não esteja
 * nos fatos daquele item, e um número que entra pela metodologia — "modo fire
 * é 75% da média" — é um número que o modelo repete e que o validador não
 * reconhece. A resposta correta seria descartada.
 *
 * Por isso a versão para prompt é constante escrita à mão, e fala de
 * "percentual definido pelo ruleset" onde a aba teórica imprime o número. O
 * teste `metodologia.test.ts` trava a ausência de dígitos.
 */
export const METODOLOGIA = [
  'METODOLOGIA DO CJ — use para interpretar os termos que aparecem nos fatos; não a repita inteira.',
  '- Nível do JOGADOR (por atributo, não por jogador): MVP, All Star, Suporte e Randola. Randola é o jogador de poucas aparições, majoritariamente reserva.',
  '- Nível do APITO, que é a força do sinal, do mais fraco ao mais forte: amarelo, laranja, verde e turbo (azul). Nível do jogador e nível do apito são coisas diferentes; nunca troque um pelo outro.',
  '- OSCILAÇÃO: o jogador vem produzindo abaixo da própria média e, por isso, tende a voltar ao patamar dele.',
  '- OPD, Oportunidade Por Desfalque: um desfalque no topo da hierarquia do time libera volume de jogo para quem vem logo abaixo. Só vale quando o desfalque está no prefixo da hierarquia — se falta o segundo e o primeiro joga, não há apito.',
  '- TURBO: destaque que atravessa os dois métodos, quando oscilação e desfalque se reforçam no mesmo jogador.',
  '- MODO FIRE: jogador do bloco de topo que já alcançou, no primeiro quarto, a fatia da média definida no ruleset. Fire Live existe apenas no primeiro quarto, em nenhuma outra hipótese.',
  '- O PERCENTUAL exibido é NOTA DE CONFIANÇA da análise do CJ. Não é chance de acerto e não é estatística de acerto histórico.',
  '- A classificação por nível é curadoria do CJ e muda com o mercado; os elencos da lista são projetados e não espelham necessariamente o time real do jogador.',
].join('\n')
