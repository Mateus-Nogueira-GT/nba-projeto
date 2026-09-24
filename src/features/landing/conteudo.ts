/**
 * O TEXTO DA LANDING, escrito uma vez.
 *
 * Regras que valem aqui como no app: o % é NOTA DE CONFIANÇA, nunca
 * probabilidade; nada de número de usuários, depoimento ou taxa de acerto que
 * não exista de verdade; o que ainda não é entregue diz "em breve".
 * Estilo: frase curta, vocabulário de basquete, sem travessão.
 */

export type Icone =
  | 'lista'
  | 'aoVivo'
  | 'alvo'
  | 'tendencia'
  | 'barras'
  | 'carteira'
  | 'trofeu'
  | 'robo'
  | 'sino'
  | 'raio'
  | 'filtro'
  | 'escudo'

/**
 * A faixa corrida logo abaixo do herói. A cor é um TOKEN de `src/ui/tokens.css`,
 * nunca um hex solto: a marca mora num lugar só, e o teste de fonte da marca
 * (Tarefa 11b) varre isto. E é um token da LANDING (`--l-*`, fixo), não o da
 * peça correspondente no app: o Claro escurece `--apito-turbo`, `--ao-vivo`…,
 * e a landing tem fundo escuro nos três temas — o ícone sumia.
 */
export const FAIXA: readonly { icone: Icone; texto: string; cor: string }[] = [
  { icone: 'lista', texto: 'Lista Secreta', cor: 'var(--l-icone-lista)' },
  { icone: 'aoVivo', texto: 'Fire Live no 1º quarto', cor: 'var(--l-icone-ao-vivo)' },
  { icone: 'alvo', texto: 'Nota de confiança', cor: 'var(--l-icone-alvo)' },
  { icone: 'tendencia', texto: 'Oscilação e desfalques', cor: 'var(--l-icone-tendencia)' },
  { icone: 'carteira', texto: 'Gestão de banca', cor: 'var(--l-icone-carteira)' },
  { icone: 'sino', texto: 'Alerta no celular', cor: 'var(--l-icone-sino)' },
  { icone: 'robo', texto: 'Sixth Man AI', cor: 'var(--l-icone-robo)' },
  { icone: 'trofeu', texto: 'Resultado conferido', cor: 'var(--l-icone-trofeu)' },
]

export const CHECKS_DO_HEROI: readonly string[] = [
  'Pontos, rebotes e assistências',
  'Os 30 times da NBA',
  'Alerta ao vivo no 1º quarto',
  'Resultado conferido toda noite',
]

export const CHECKS_DO_APITO: readonly string[] = [
  'Média da temporada',
  'Últimos 5 e 10 jogos',
  'Desfalques do jogo',
  'Odds por casa',
  'Minutos por jogo',
  'Alvo do 1º quarto',
]

export type Ferramenta = { titulo: [string, string]; texto: string; pontos: readonly string[]; imagem: string; url: string }

export const FERRAMENTAS: readonly Ferramenta[] = [
  {
    titulo: ['A lista da rodada,', 'pronta antes do jogo'],
    texto:
      'Os apitos do dia agrupados por jogo ou por nível. Em cada linha: o mercado, a odd nas casas, a nota de confiança e os últimos 5 jogos contra a linha.',
    pontos: ['Pontos, rebotes e assistências', 'Filtro por método, nível, time e posição', 'Hierarquia do elenco a um toque'],
    imagem: '/landing/app-lista.jpg',
    url: 'nip.app/entradas',
  },
  {
    titulo: ['Fire Live:', 'o 1º quarto ao vivo'],
    texto:
      'Placar, quadra e cada jogador apitado correndo atrás do alvo do 1º quarto. Apareceu apito novo no meio do jogo? Chega no seu celular.',
    pontos: ['Progresso até o alvo, lance a lance', 'Modo fire quando o jogador dispara', 'Som e alerta de apito'],
    imagem: '/landing/app-aovivo.jpg',
    url: 'nip.app/ao-vivo',
  },
  {
    titulo: ['Estatística da liga', 'inteira, sem planilha'],
    texto:
      'Jogos do dia, classificação por conferência e a ficha de cada jogador e de cada time, com hierarquia do elenco e quem está fora.',
    pontos: ['Jogo a jogo e box score', 'Hierarquia por atributo', 'Classificação Leste e Oeste'],
    imagem: '/landing/app-estatisticas.jpg',
    url: 'nip.app/estatisticas',
  },
  {
    titulo: ['Gestão de banca', 'do tamanho da sua'],
    texto:
      'Informe a banca e a NIP monta o plano do dia: unidade, teto por entrada, stop win e stop loss. No fim, registre o que você entrou.',
    pontos: ['Plano do dia pela sua banca', 'Stop win, stop loss e teto', 'Registro das entradas'],
    imagem: '/landing/app-gestao.jpg',
    url: 'nip.app/gestao',
  },
  {
    titulo: ['Resultado conferido,', 'o que bateu e o que não'],
    texto:
      'Toda noite a NIP confere o que apitou, jogo a jogo. Taxa da noite, taxa da temporada e o apito da noite, com os erros na mesma tela dos acertos.',
    pontos: ['Conferência por jogo e por jogador', 'Taxa da noite e da temporada', 'Aberto em todos os planos'],
    imagem: '/landing/app-resultados.jpg',
    url: 'nip.app/resultados',
  },
]

export type Passo = { icone: Icone; titulo: string; texto: string }

export const PASSOS: readonly Passo[] = [
  { icone: 'escudo', titulo: 'Crie a conta', texto: 'Sem cartão. No Grátis você já vê os jogos, os resultados e a classificação.' },
  { icone: 'raio', titulo: 'Escolha o plano', texto: 'MVP ou All-Star, por mês ou pela temporada, pagando no Mercado Pago.' },
  { icone: 'lista', titulo: 'Abra a lista', texto: 'Antes da bola subir, a Lista Secreta. No 1º quarto, o Fire Live.' },
  { icone: 'alvo', titulo: 'Decida com contexto', texto: 'Linha, odd, forma, desfalques e tamanho da entrada na mesma tela.' },
]

export type LinhaComparativo = { icone: Icone; criterio: string; nip: string; manual: string }

export const COMPARATIVO: readonly LinhaComparativo[] = [
  { icone: 'lista', criterio: 'Quem entra na rodada', nip: 'Lista pronta antes do jogo', manual: 'Horas abrindo box score' },
  { icone: 'tendencia', criterio: 'Desfalques e hierarquia', nip: 'Cruzados na hora', manual: 'Notícia por notícia' },
  { icone: 'barras', criterio: 'Jogador abaixo da média', nip: 'Detectado por nível', manual: 'Conta de cabeça' },
  { icone: 'aoVivo', criterio: '1º quarto', nip: 'Progresso até o alvo, ao vivo', manual: 'Placar e feeling' },
  { icone: 'filtro', criterio: 'Odd entre casas', nip: 'Na linha do apito', manual: 'Uma aba por casa' },
  { icone: 'carteira', criterio: 'Tamanho da entrada', nip: 'Plano pela sua banca', manual: 'Valor no chute' },
  { icone: 'robo', criterio: 'Tirar dúvida', nip: 'Sixth Man AI', manual: 'Grupo de Telegram' },
]

export type Pergunta = { pergunta: string; resposta: string }

export const PERGUNTAS: readonly Pergunta[] = [
  {
    pergunta: 'Como funciona a NIP?',
    resposta:
      'A NIP lê os números de cada jogador da NBA, aplica a metodologia e aponta quem tem oportunidade na rodada, os jogadores "apitados", em pontos, rebotes e assistências. Antes dos jogos sai a Lista Secreta. Durante o 1º quarto, o Fire Live.',
  },
  {
    pergunta: 'Qual a diferença entre MVP e All-Star?',
    resposta:
      'O MVP tem a metodologia inteira: Lista Secreta, Fire Live, estatística completa, gestão de banca, alertas e o assistente de IA. O All-Star soma cota maior do assistente, suporte prioritário e os benefícios de comunidade que estão chegando.',
  },
  {
    pergunta: 'Tem plano grátis?',
    resposta:
      'Tem. O Grátis mostra os jogos de cada rodada, os resultados da noite anterior, a classificação e o resumo de cada jogador. A lista de apitos fica nos planos pagos.',
  },
  {
    pergunta: 'A porcentagem do apito é a chance de acertar?',
    resposta:
      'Não. É a nota de confiança da análise: quanto mais alta, mais forte a leitura. Não é probabilidade de acerto nem promessa de resultado.',
  },
  {
    pergunta: 'Que horas sai a Lista Secreta?',
    resposta:
      'Antes dos jogos de cada rodada. As escalações oficiais saem até 1 hora antes da bola subir, então a lista se atualiza durante o dia quando um desfalque é confirmado.',
  },
  {
    pergunta: 'Como eu sei se a NIP acerta?',
    resposta:
      'Toda noite a NIP confere o que apitou, e o Placar do NIP é aberto, sem login: mostra quanto cada faixa da nota de confiança e cada nível de jogador acertou de verdade, com os erros junto. O link está no menu, em "Placar".',
  },
  {
    pergunta: 'A NIP é casa de apostas?',
    resposta:
      'Não. A NIP não recebe aposta nem mexe com dinheiro de aposta. Ela entrega a análise e você decide, na casa que preferir.',
  },
  {
    pergunta: 'Como eu pago?',
    resposta:
      'Pelo Mercado Pago. Dá para escolher mensal ou temporada, e o plano de temporada vale até o fim da temporada da NBA.',
  },
  {
    pergunta: 'Preciso instalar alguma coisa?',
    resposta:
      'Não. A NIP roda no navegador do computador e do celular. Se quiser, coloque na tela inicial como app para receber os alertas de apito.',
  },
]
