import type { MensagemPushV1 } from './contrato'
import type { InscricaoPush, PortaEnvioPush, ResultadoEnvioPush } from './porta'

export type EnvioPushRegistrado = {
  inscricao: InscricaoPush
  mensagem: MensagemPushV1
}

export class EnvioPushFake implements PortaEnvioPush {
  readonly envios: EnvioPushRegistrado[] = []
  private proximo = 0

  constructor(
    private readonly resultados: ResultadoEnvioPush[] | ((indice: number) => ResultadoEnvioPush) = [
      { tipo: 'ENVIADO', statusCode: 201 },
    ],
  ) {}

  async enviar(inscricao: InscricaoPush, mensagem: MensagemPushV1): Promise<ResultadoEnvioPush> {
    const indice = this.proximo
    this.proximo += 1
    this.envios.push({ inscricao, mensagem })

    if (typeof this.resultados === 'function') return this.resultados(indice)
    const resultado = this.resultados[indice] ?? this.resultados.at(-1)
    if (!resultado) throw new Error('EnvioPushFake sem resultado configurado')
    return resultado
  }
}
