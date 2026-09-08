# UX de transmissão e identidade oficial — spec

**Data:** 08/09/2026. **Estado:** decisões de produto aprovadas no brainstorming;
implementação desta rodada ainda pendente. As propostas técnicas e os pontos
comerciais não definidos estão identificados abaixo.

**Plano:** [Implementação por etapas](../plans/2026-09-08-ux-transmissao-e-identidade-oficial.md).

## 1. Objetivo e base

Dar presença aos jogadores e aos acontecimentos do jogo, mantendo a leitura dos
alvos simples. O Ao Vivo assume uma linguagem de transmissão esportiva; as outras
abas usam movimento contido para orientar navegação e mudanças de estado.

Base inspecionada: `c49c96d`, branch `codex/ux-ao-vivo-identidade`. Já existem nomes
completos/logos dos times em cabeçalhos e cartões, fotos com fallback, quadra
ilustrativa e hover/foco do Modo Fire. Reutilizar essas peças; não recomeçar o design
system. A base não equivale a afirmar que toda essa branch está na produção.

Esta spec sucede as restrições visuais antigas de siglas sem logos e ausência de
movimento **apenas nos pontos alterados pelo brainstorming**. Permanecem as regras
de estratégia, identidade editorial, acesso e integridade de dados do `CLAUDE.md`.

## 2. Decisões aprovadas

| ID | Decisão |
| --- | --- |
| D01 | Nome oficial de apresentação da NBA, foto e logo consistentes nas telas. |
| D02 | Ao Vivo mostra um jogo por vez, escolhido em seletor no topo. |
| D03 | Placar e quadra sempre visíveis enquanto os cartões rolam. |
| D04 | Um cartão separado por alvo no Ao Vivo, inclusive para o mesmo jogador. |
| D05 | Movimento discreto durante o jogo; destaque intenso em alvo atingido e ativação do Modo Fire. |
| D06 | Acompanhar o jogador inteiro, abrangendo seus alvos; não selecionar acompanhamento por alvo individual. |
| D07 | Stats abre nos últimos 10 jogos, com alternativas últimos 5 e temporada. |
| D08 | Gestão apresenta resumo da banca, Planejadas/Registradas/Encerradas, atualização dos totais e desfazer. |
| D09 | Perfil reúne jogadores/times acompanhados, alertas, animações, assinatura e dispositivos. |
| D10 | Animações no padrão e som de apito ligado por padrão, com volume, teste e silenciamento. |
| D11 | Resultados tem resumo, jogador de destaque, linha prevista versus resultado, filtros e histórico por data. |

A confirmação de D04 é exclusiva do Ao Vivo. A Lista e os Resultados preservam seu
agrupamento existente por jogador e abas de atributo. Não propagar uma mudança de
cardinalidade para todas as telas.

## 3. Identidade oficial dos jogadores

### 3.1 Contrato

- Exibir o nome esportivo oficial da NBA, com grafia, diacríticos e sufixos corretos.
  Não exigir nome civil completo nem expandir uma inicial que a NBA usa oficialmente.
- Nome, foto e identidade externa devem apontar para o mesmo jogador canônico.
- Aplicar em Lista, Ao Vivo, Stats/busca/perfis, detalhe do apito, Gestão, Resultados,
  acompanhados e novas notificações. Não reescrever notificações já entregues.
- Buscar tanto pelo nome oficial quanto pelos aliases/grafias do CJ. A interface
  mostra o oficial; a curadoria continua podendo consultar a grafia original.
- Preservar UUIDs, URLs, níveis por atributo, registros históricos e chaves de apito.
  Corrigir apresentação não pode mudar quem o motor avalia.
- O time dos apitos continua vindo da lista editorial do CJ. Stats continua usando
  o time canônico do provedor. Nome oficial não é autorização para transferir elenco.
- Sem identidade confirmada, manter a identificação conhecida e registrar pendência
  no admin. Não associar rosto/nome por semelhança sem evidência.

### 3.2 Migração e ambiguidade

Hoje `jogadores.nomeCompleto`, `mapa_jogadores` e o seed não são intercambiáveis:
`semearCadastro` compara nomes e `mapa_jogadores` tem unicidade em nome/provedor.
Renomear diretamente pode duplicar jogadores no próximo seed ou import.

Preparar um catálogo curado por identidade externa com nome oficial e aliases;
resolver vínculos antes de atualizar apresentação. A decisão de estender coluna ou
usar projeção de leitura deve preservar o contrato canônico existente e leituras em
lote. Não importar `ingestao/demo/fotos.ts` em componentes de interface.

**Wiggins:** existe colisão de duas pessoas em um cadastro. Separar Andrew/Aaron
exige evidência por identidade externa e contexto editorial, com inventário de
referências em níveis, mapas, jogos, estatísticas, snapshots e preferências. A migração
não pode duplicar estatísticas para ambos nem atribuir história por palpite. Casos
sem evidência ficam em relatório de reconciliação e exigem curadoria antes da escrita
correspondente. Esse ponto não bloqueia os nomes inequivocamente identificados.

## 4. Entradas

- Reutilizar a organização por confronto, filtros e lentes já existentes.
- Nome oficial, foto e time completo visíveis, sem cortar nomes longos.
- Botão “Acompanhar jogador” com estado “Acompanhando”; ação sobre o jogador inteiro.
- Apitos realmente novos podem receber selo “Novo” e entrada curta. Atualizar o
  snapshot não recoloca os cartões antigos como novos nem muda a rolagem.
- Preservar links para perfil/detalhe, filtros na URL e ordem escolhida pelo usuário.
- Estados: carregamento, sem entradas, filtro sem resultado e falha de atualização
  com última leitura disponível identificada.

## 5. Ao Vivo: composição e navegação

### 5.1 Seletor de um jogo

Faixa horizontal no topo com identificação das duas equipes, logos, placar quando
conhecido e estado do 1º quarto. Somente um painel de jogo é renderizado como ativo.
Acessível por teclado, com seleção escrita/programática e foco visível; rolagem
horizontal tem indicação de continuação e não move a página inteira lateralmente.

**Regra técnica proposta de seleção:**

1. `jogo` válido explicitamente informado na URL.
2. Escolha manual atual, mantida nos refreshes e na volta à tela na mesma rodada.
3. Primeiro jogo em 1Q que tenha jogador acompanhado.
4. Primeiro em 1Q; depois próximo agendado; depois último com 1Q encerrado.
5. Empates seguem horário e ID estáveis. Sem jogos, mostrar o vazio existente.

O filtro de estado existente continua compatível: a seleção é resolvida dentro dos
jogos elegíveis. Jogo inválido/indisponível usa fallback e aviso curto. Ao mudar
filtros, preservar os demais parâmetros válidos e o funcionamento de voltar/avançar.

Novo apito em outro jogo gera indicador no seletor; nunca troca automaticamente a
partida que o usuário está lendo. Encerramento do Q1 mantém o jogo selecionado com
seu estado final; a pessoa escolhe o próximo.

### 5.2 Painel sempre visível

Seletor, placar e quadra formam um painel compacto sticky; cartões rolam abaixo.
Integrar com a moldura, faixa de demonstração, barras do PWA e safe areas. O painel
não pode esconder foco, links ou conteúdo sob a navegação inferior.

Em celular e paisagem, reduzir espaçamentos, dimensão dos logos e altura da quadra,
sem esconder quadra/placar nem oferecer recolhimento. Validar que há espaço útil para
ler e operar um cartão em 320×568 e 844×390; dimensões finais são decisão visual da
implementação, não uma altura rígida herdada do desktop.

A quadra representa o confronto. Pode receber uma iluminação breve do lado cujo
placar recebido aumentou. Não desenhar bola em movimento, posse, jogadores em
coordenadas, arremessos ou relógio correndo sem dados de origem correspondentes.

### 5.3 Cartões, estados e linha do tempo

- Manter um cartão por identidade de alvo existente (jogo, jogador, atributo e
  demais campos da chave de domínio). Dois alvos nunca compartilham progresso.
- Cada cartão tem nome oficial, foto, equipe, atributo, alvo, observado, progresso,
  estado e links existentes. Nível do jogador e do apito permanecem distintos.
- Acompanhar destaca todos os cartões daquele jogador; filtro “Meus jogadores”
  limita a leitura. Nenhum acompanhado mostra vazio com acesso à Lista.
- Manter AGUARDANDO, EM_1Q e FIM_1Q. O produto continua exclusivo do 1º quarto:
  ao encerrar, congela o recorte Q1 e cessa os efeitos de jogo em andamento.
- Valores nulos não viram zero; alvo zero/ausente não gera barra nem celebração.
- Linha do tempo contém apenas eventos comprovados: apito, transição conhecida
  para Modo Fire e fim de Q1. Sem horário de origem, usar “detectado nesta
  atualização”; não inventar instante exato nem histórico anterior à sessão.
- Selecionar jogo sem apito continua mostrando placar/quadra e o vazio apropriado.
- Dado atrasado/offline conserva a última leitura com aviso. Suspender efeitos que
  sugerem atualidade, sem apagar alvos ou fabricar atividade.

## 6. Motion e áudio

### 6.1 Reações a dados

| Gatilho | Resposta | Limite |
| --- | --- | --- |
| Trocar jogo/filtro | Transição curta de conteúdo | Não marcar os cartões carregados como novos. |
| Placar recebido aumentou | Transição do número + luz breve no lado correspondente | Correção para baixo atualiza sem comemorar. |
| Observado do alvo aumentou | Barra suave e diferença, como “+1 AST” | É diferença entre leituras, não descrição de uma jogada. |
| Novo alvo atingido confirmado | Destaque luminoso no cartão individual | Uma vez por evento; manter texto redundante. |
| Transição confirmada para Modo Fire | Ativação da borda e do selo | Não reativar em todo polling/hover/montagem. |
| Hover/foco no Modo Fire | Reutilizar elevação e brilho atuais | Sem tornar cartão comum animado. |
| Fim de Q1 | Transição para estado encerrado | Sem apagar o apito nem simular próximo quarto. |

A primeira leitura é baseline silenciosa. Refresh, navegação, troca de jogo,
reconexão e retorno do background não reproduzem uma sequência de eventos antigos.
Usar chaves estáveis, timestamp/versão e registro limitado de eventos apresentados
por conta/rodada. Dados repetidos ou fora de ordem não geram novo efeito; correções
atualizam o valor com feedback neutro. Não mudar a deduplicação do motor/outbox.

Manter o polling/refresh existente como ponto de partida. Nenhum polling por cartão,
WebSocket por espectador ou chamada externa por nome renderizado. Comparar snapshots
no cliente em uma fronteira estável, sem remontar tudo no `router.refresh()`.

### 6.2 Preferências e acessibilidade

- Intensidade: Reduzidas / Padrão / Intensas. Padrão é o default aprovado.
- Os três níveis mantêm a mesma informação. Intensas aumenta o destaque de eventos;
  não significa uma página inteira piscando continuamente.
- `prefers-reduced-motion` tem precedência sobre intensidade escolhida: retirar
  deslocamento, escala, chama/partículas e transições extensas; preservar texto e foco.
- Preferir animações finitas, transform/opacity e tokens centralizados. Durações
  técnicas iniciais propostas: navegação 180–240 ms, progresso 250–400 ms,
  destaque de evento até 900 ms; validar no navegador, sem tratar esses tempos como
  regra de estratégia. Efeitos contínuos, se adotados, precisam de pausa explícita.
- Não depender de hover no touch, cor, som ou movimento como único sinal.

### 6.3 Som ligado por padrão

Som de apito habilitado na preferência para novos usuários; preservar silenciamento
já salvo. Disponibilizar volume, silenciar e “Testar som” no Perfil e atalho de mute
no Ao Vivo. Volume inicial técnico proposto: 50%, editável.

A preferência ligada não supera bloqueio de autoplay. Habilitar o canal de áudio
após gesto permitido pelo navegador; se bloquear, mostrar “Ativar som” sem travar
feed ou simular sucesso. Teste de som é explícito e distinto de evento esportivo.

Tocar em novos apitos elegíveis, não em todo ponto, refresh, hover ou cartão aberto.
Agrupar um lote simultâneo em um único sinal curto, sem sons sobrepostos. Limitar
repetição por evento entre abas; limpar o estado por usuário ao sair/trocar conta.

Foreground usa áudio do app; background usa Web Push/OS conforme suporte. Não
prometer som customizado com app fechado nem tocar uma fila de apitos ao voltar.
Preferência de som não solicita nem concede permissão de notificações do sistema.

### 6.4 Contrato proposto de elegibilidade dos controles

Compartilhar os filtros explícitos de alerta entre áudio local e push, distinguindo
preferência do usuário de capacidade técnica do dispositivo. Silenciar um jogador
não deve deixá-lo tocando no app, nem remover seu cartão.

| Controle/estado | Som local de novo apito | Web Push | Cartão |
| --- | --- | --- | --- |
| Som silenciado ou volume zero | Não toca | Mantém preferência de envio | Continua visível |
| Jogador/atributo excluído dos alertas | Não toca para esse alvo | Não envia para esse alvo | Continua visível |
| Canal de apito desabilitado na preferência | Não toca para esse canal | Não envia para esse canal | Continua visível |
| Apenas acompanhar/deixar de acompanhar | Mantém política escolhida | Mantém política escolhida | Muda destaque/filtro |
| Permissão de push negada ou sem inscrição | Pode tocar após gesto e com som ligado | Indisponível nesse dispositivo | Continua visível |
| Aba em background | Não toca áudio do app | Segue capacidade do OS e elegibilidade | Atualiza ao retornar, sem replay |
| Movimento reduzido | Mantém preferência de som | Mantém preferência de envio | Sem motion não essencial |

“Testar som” é uma ação explícita e pode pré-escutar o volume sem reativar alertas
silenciados ou alterar as preferências salvas. Não usar disponibilidade de inscrição
push como pré-requisito para áudio local. Identificar esses alcances nos rótulos dos
controles, preservando opt-outs legados.

## 7. Acompanhamento e preferências de alertas

Acompanhamento positivo de jogador é novo. `jogadores_ocultos` representa exclusão
visual e não altera push hoje; não converter todo jogador visível em favorito.
Preservar exclusões existentes. A ação explícita de acompanhar pode reexibir o
jogador na mesma transação; deixar de acompanhar não equivale a ocultar ou silenciar.

Persistir acompanhados e preferências por conta; URLs guardam navegação/filtros.
Alterações otimistas precisam reverter com mensagem em caso de falha e sobreviver
à recarga/dispositivo seguinte. Toda escrita exige sessão e ownership no servidor.

Perfil expõe jogadores/times acompanhados e alertas por jogador/atributo. O ato de
acompanhar destaca/favorece a leitura; **não muda silenciosamente quem recebe push**.
Manter política atual por default; usuário ativa explicitamente “apenas acompanhados”
ou exclusões de alerta. Opt-outs de canais e exclusões explícitas de alerta prevalecem.
Aplicar filtros de entrega no fan-out e novamente antes do envio quando necessário,
preservando assinatura, dispositivos válidos, opt-out e idempotência.

Os times acompanhados são atalhos de consulta; não significam automaticamente
acompanhar todos os atletas ou liberar notificações de todo o elenco.

## 8. Stats

- Perfil com nome oficial, foto, time canônico e posição; busca também por aliases.
- Alternar Pontos / Rebotes / Assistências e Últimos 5 / Últimos 10 / Temporada.
  Ausência de preferência/URL abre últimos 10; essa mudança não altera a lente
  ULT5 da Lista nem a janela de médias usada pelo motor.
- Gráfico e resumo usam o mesmo recorte e exibem datas/valores legíveis. Menos de
  dez partidas mostra a quantidade disponível, sem completar zeros. Preservar
  distinção entre DNP, zero real, dado pendente e histórico truncado.
- Linha do alvo somente quando existir um alvo contextual identificado. Uma linha
  atual não pode ser apresentada como aposta histórica de todas as partidas.
  Alvo de 1Q não deve ser sobreposto a estatísticas de jogo inteiro sem distinguir
  os períodos. Sem contexto, gráfico de desempenho sem linha inventada.
- Abrir detalhes de uma partida e voltar preserva jogador, atributo e período.
- Transições finitas ao trocar recortes; dados continuam acessíveis em texto/tabela.

## 9. Gestão

**Aprovado:** resumo de banca disponível, planejado e comprometido; grupos
Planejadas / Registradas / Encerradas; edição com totais imediatos; salvar e desfazer.

**Base real:** `planoDoDia` calcula sugestões por ruleset e retorna `totalExposto`;
a tela usa banca na URL. Não existe um livro persistente desses três estados.
Essa fase exige contrato e persistência próprios antes da interface editável.

**Proposta de interpretação para homologação da fase:** Planejada é organização de
uma sugestão; Registrada é anotação manual confirmada pelo usuário; Encerrada é
registro com encerramento conhecido. Nenhum desses termos autoriza enviar aposta,
vincular casa, custodiar ou movimentar dinheiro. O app continua somente leitura de
odds e conserva a indicação de modelo de demonstração quando aplicável.

**Decisões comerciais ainda necessárias:** momento de comprometimento/liberação,
tratamento de cancelamento/DNP, fonte do encerramento e significado de “disponível”
quando há registro encerrado. Não foram definidos lucro, liquidação ou atualização
automática da banca. Não inventar fórmulas para preencher o resumo. Essas decisões
bloqueiam apenas a persistência/transições financeiras desta fase; identidade,
Ao Vivo e demais telas podem avançar.

Após fechar o contrato: registrar revisão/valor anterior, atualizar totais coerentes
no servidor, impedir dupla gravação e conflito entre abas. Desfazer é operação
compensatória validada, não apenas remover um toast ou voltar estado visual.
Preservar estados/dados legados com migração rastreável e opção de reversão.

## 10. Perfil e Resultados

**Perfil:** reunir acompanhados, preferências de alertas, motion e áudio com assinatura
e dispositivos existentes. Mostrar salvando/salvo/erro, permitir nova tentativa e
não afirmar que som/push foi ativado sem sucesso real.

**Resultados:** reutilizar recap, destaque da noite, datas e conferência já existentes.
Acrescentar filtros por estratégia, atributo e time, mantendo nomes oficiais e
identidade editorial do apito. Linha prevista e realizado aparecem lado a lado, com
período explícito; alvo Q1 e linha do jogo não são a mesma régua. Filtros recalculam
os totais apresentados ou deixam explícito quando um resumo é da rodada inteira.
Preservar pendente, DNP/neutro e correções oficiais; não premiar dado ausente como zero.
Animação curta de entrada do resumo não reencena eventos antigos nem toca som.

## 11. Fora desta rodada

Comparação de dois jogadores, chat novo, gamificação/rankings, odds transacionais,
bola/posse/shotmap ao vivo, expansão do Fire Live além do Q1, alteração de estratégias,
reseed destrutivo e atualização especulativa do elenco. Comparação foi sugerida,
mas não entrou no fechamento aprovado. O pedido atual produz spec e plano; não
executa migração, alteração de código de produto ou publicação.

## 12. Critérios de aceite e rastreabilidade

| Aceite | Comportamento verificável | Decisões |
| --- | --- | --- |
| AC01 | Nome/foto resolvem o mesmo ID; busca aceita aliases; seed reexecutado não duplica; histórico/níveis permanecem atribuídos. | D01 |
| AC02 | Somente um jogo ativo; URL/voltar/refresh preservam escolha; apito em outro jogo só marca seletor. | D02 |
| AC03 | Seletor, placar e quadra continuam visíveis na rolagem sem ocultar cartões, foco ou barra inferior. | D03 |
| AC04 | Dois alvos do mesmo jogador ficam em cartões distintos, cada qual com progresso e evento próprios. | D04 |
| AC05 | Baseline/reconexão/correção/refresh não repetem efeitos; Q1 encerrado não simula atividade. | D05 |
| AC06 | Acompanhar afeta todos os alvos; não muda motor/push sem escolha de alerta; isolamento por conta. | D06 |
| AC07 | Perfil Stats abre 10, aceita 5/temporada e mantém gráfico/resumo/participação coerentes. | D07 |
| AC08 | Gestão obedece contrato homologado, persiste estados sem dupla gravação e desfaz com totais corretos. | D08 |
| AC09 | Preferências sincronizam, falhas revertem UI e usuário não altera preferência de outra conta. | D09 |
| AC10 | Som default ligado respeita mute/autoplay/volume; um evento/lote não toca várias vezes; movimento reduzido vence efeitos. | D10 |
| AC11 | Filtros e recap mantêm denominadores, período, DNP e pendências corretos. | D11 |

Validar jornadas completas no navegador autenticado, teclado/touch, reduced motion,
audio bloqueado/permitido, offline/reconexão e duas abas. Matriz mínima: 320×568,
390×844, 768×1024, 1280×900 e 844×390; incluir zoom de 200%. Capturas SSR são evidência
complementar e não substituem hidratação, áudio e ações reais. Registrar limitações
de ambiente/skills disponíveis de forma explícita, sem marcar etapas não executadas.
