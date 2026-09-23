import { parametrosDoPerfil } from './perfis'
import { ErroLLM, type PedidoGeracao, type PerfilLLM, type PortaLLM, type TextoGerado } from './porta'

/**
 * Porta falsa — implementação real da interface, sem rede.
 *
 * Serve a dois donos: os testes (que precisam de texto previsível) e a
 * PRODUÇÃO sem `OPENROUTER_API_KEY`, onde o app inteiro precisa continuar
 * funcionando. Por isso o texto é plausível, não um lorem ipsum.
 */
export class LLMFake implements PortaLLM {
  readonly nome = 'fake'
  readonly chamadas: { perfil: PerfilLLM; pedido: PedidoGeracao }[] = []

  constructor(
    private readonly opcoes: { falhar?: boolean; texto?: string; truncado?: boolean } = {},
  ) {}

  async gerar(perfil: PerfilLLM, pedido: PedidoGeracao): Promise<TextoGerado> {
    this.chamadas.push({ perfil, pedido })
    if (this.opcoes.falhar) {
      throw new ErroLLM('transporte', 'LLMFake configurado para falhar')
    }

    const texto = this.opcoes.texto ?? textoDeDemonstracao(perfil, pedido)
    return {
      texto,
      modelo: `fake/${perfil}`,
      tokensEntrada: Math.ceil((pedido.sistema.length + pedido.usuario.length) / 4),
      tokensSaida: Math.ceil(texto.length / 4),
      truncado: this.opcoes.truncado ?? false,
    }
  }
}

/**
 * Banco de frases por perfil. NENHUMA cita número, de propósito: o validador
 * reprova número que não esteja nos fatos, e o fake não tem como saber quais
 * são.
 *
 * `narrativa` tem várias porque é o perfil chamado uma vez POR CARD. Com uma
 * frase só, o ambiente de demonstração — que roda sem chave, portanto sempre
 * no fake — imprimia a MESMA linha em itálico embaixo das quase cinquenta
 * entradas da lista. Quem olha a tela não lê "texto de demonstração", lê
 * defeito.
 */
const BANCOS: Record<PerfilLLM, string[]> = {
  narrativa: [
    'Vem de sequência abaixo da própria média e encontra um confronto favorável — o tipo de correção que a estratégia procura.',
    'O desfalque no topo do elenco abre volume de jogo, e é nesse espaço que a leitura do CJ se apoia.',
    'Média estável na temporada e uma linha convidativa: o histórico recente sustenta o sinal.',
    'Oscilou para baixo nas últimas rodadas sem perder espaço em quadra — é a devolução que o método persegue.',
    'Ritmo alto no confronto e hierarquia de arremesso a favor: o cenário conversa com o que a estratégia pede.',
    'O sinal nasce do cruzamento entre a média do jogador e o que o adversário concede no setor dele.',
  ],
  resumo: [
    'Rodada movimentada: a lista de hoje mistura oscilações maduras e oportunidades por desfalque. Vale acompanhar de perto os confrontos com elenco desfalcado.',
  ],
  chat: [
    'Posso explicar qualquer entrada da lista de hoje a partir dos critérios do CJ. Pergunte sobre um jogador específico e eu detalho o que pesou.',
  ],
  admin: [
    'Sugestão de demonstração: confira o nome à mão antes de confirmar o vínculo — nenhuma sugestão grava sozinha.',
  ],
}

/**
 * Índice ESTÁVEL a partir do conteúdo do pedido (FNV-1a).
 *
 * Determinismo é contrato do fake: o mesmo card tem que render a mesma frase
 * em toda execução, senão o snapshot mudaria a cada publicação e nenhum teste
 * poderia afirmar nada. Sortear com `Math.random` daria variedade e perderia
 * exatamente isso.
 */
function indiceEstavel(chave: string, total: number): number {
  let h = 2166136261
  for (let i = 0; i < chave.length; i++) {
    h ^= chave.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) % total
}

/** Texto determinístico e plausível, escolhido pelos FATOS do próprio pedido. */
function textoDeDemonstracao(perfil: PerfilLLM, pedido: PedidoGeracao): string {
  const teto = parametrosDoPerfil(perfil).maxTokens
  const banco = BANCOS[perfil]
  // A chave é `usuario` (os fatos), não `sistema`: o sistema é idêntico para
  // todos os itens do mesmo perfil e daria sempre a mesma frase de volta.
  const base = banco[indiceEstavel(pedido.usuario, banco.length)]!
  return base.slice(0, teto * 4)
}
