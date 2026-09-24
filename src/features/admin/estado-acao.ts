import { ZodError } from 'zod'

/**
 * O retorno de toda ação do painel. A ação que falha DIZ que falhou — antes,
 * um campo inválido derrubava a tela inteira (zod `.parse` sem captura) ou a
 * ação voltava calada e o admin achava que tinha gravado.
 */
export type EstadoAcao = { erro: string | null; ok: string | null }

export const ESTADO_INICIAL: EstadoAcao = { erro: null, ok: null }

export const sucesso = (mensagem: string): EstadoAcao => ({ erro: null, ok: mensagem })
export const falha = (mensagem: string): EstadoAcao => ({ erro: mensagem, ok: null })

/** Rótulos dos campos, para o erro de validação falar a língua do formulário. */
const ROTULO_DO_CAMPO: Record<string, string> = {
  nome: 'nome',
  nomePublico: 'nome público',
  codigo: 'código',
  email: 'e-mail',
  casaId: 'casa',
  parceiroId: 'parceiro',
  ofertaId: 'oferta',
  modalidade: 'modalidade',
  moeda: 'moeda (3 letras, ex. BRL)',
  urlDestino: 'URL HTTPS',
  hostDestino: 'host exato',
  percentual: 'percentual (0 a 100)',
  canal: 'canal',
  tipoDestino: 'destino',
  valorCentavos: 'valor em centavos',
  referenciaExterna: 'referência externa',
  comissaoId: 'comissão',
  comissaoOriginalId: 'comissão original',
  baseNipCentavos: 'diferença da base (diferente de zero)',
  motivo: 'motivo (mín. 3 caracteres)',
  liberacaoId: 'liberação',
  comprovanteChave: 'chave do comprovante',
  loteId: 'lote',
  id: 'registro',
  status: 'status',
  linkId: 'link',
  homologado: 'confirmação da homologação',
  motivoHomologacao: 'registro da homologação (10 a 500 caracteres)',
}

export function mensagemDeErro(erro: unknown): string {
  if (erro instanceof ZodError) {
    const campos = [
      ...new Set(
        erro.issues.map((i) => {
          const chave = String(i.path[0] ?? '')
          return ROTULO_DO_CAMPO[chave] ?? (chave || 'valor')
        }),
      ),
    ]
    return `Confira ${campos.length === 1 ? 'o campo' : 'os campos'}: ${campos.join(', ')}.`
  }
  if (erro instanceof Error && erro.message) return erro.message
  return 'Não foi possível concluir. Tente de novo.'
}
