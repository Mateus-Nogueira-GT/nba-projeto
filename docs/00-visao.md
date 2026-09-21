# Visão do produto — IA da NBA v0

## O que é

PWA (Android, iOS e web — instalável pelo navegador, sem loja) que lê dados da NBA,
aplica os critérios definidos pelo CJ e apresenta **entradas sugeridas** em cards.
Assinatura via Mercado Pago. Escopo v0 fechado conforme a proposta comercial.

## As duas estratégias

|         | Lista Secreta                                        | Fire Live                                    |
| ------- | ---------------------------------------------------- | -------------------------------------------- |
| Momento | pré-live, 1h antes do 1º jogo                        | ao vivo, **só no 1º quarto**                 |
| Métodos | oscilação + OPD                                      | alvo por atributo no 1Q                      |
| Filtros | nº de vítimas (1/2/5/todas), todas do dia, ordenação | todos, por time, por jogo, excluir jogadores |

Atributos: **pontos, rebotes e assistências**. Desde 21/09/2026, todos têm classificação no banco; `niveis.atributos` (ruleset) aguarda as tabelas de % e odds dos dois novos para ativação. (Nota: os dois novos atributos estão **fora do contrato v0** — ver "Escopo apareceu depois" abaixo.)

## O que sustenta

- 10.000 usuários simultâneos
- 2 dispositivos por conta (3º encerra a sessão mais antiga)
- Duas fontes NBA com failover automático + backup diário
- Alerta de dado parado — a equipe descobre antes do usuário
- WAF, HTTPS, senha cifrada, rate limit no login, credenciais em cofre

## Cadência de dados

| Dado                               | Frequência                          |
| ---------------------------------- | ----------------------------------- |
| Jogadores, times, tabela           | 1×/dia                              |
| Classificação e box score por time | 1×/dia, após a rodada               |
| Lesões e desfalques                | 6h (escalação oficial até 1h antes) |
| Lista Secreta                      | 1×/dia, 1h antes do 1º jogo         |
| Fire Live e estatísticas ao vivo   | ciclo curto, durante os jogos       |

Toda tela informa o horário da última atualização.

## Fora do v0

Publicação nas lojas · definição das estratégias (vem do CJ) · emissão de nota fiscal ·
abertura da conta Mercado Pago (do cliente) · produção de conteúdo e tráfego.

## Aba de estatísticas — incluída no v0

Área de consulta no estilo Sofascore, além do card de entrada: **jogos do dia**,
classificação e vitórias por time, médias, **quebra por quarto** e histórico. Chega por
dois caminhos — pelo menu (por jogador e por time, com busca e filtro) e pelo nome do
jogador dentro de qualquer card.

Não passa pelo motor de estratégias: é exibição de dado.

## Escopo apareceu depois e ainda não está contratado

Integração com casas · aba Gestão · aba teórica · construtor de aposta · rebotes e
assistências completos. Ver `05-perguntas-abertas.md`.
