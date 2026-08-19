import type { MensagemPush, PortaFila } from './porta'

/**
 * Fila em memória — usada nos testes de aceitação do Fire Live.
 *
 * É ela que torna verificável o critério "o replay produz exatamente N pushes,
 * e o replay do mesmo jogo produz zero". Contra a fila real, contar seria
 * chute.
 */
export class FilaEmMemoria implements PortaFila {
  readonly enviadas: MensagemPush[] = []

  /** Simula falha do serviço de fila, para exercitar o retry do workflow. */
  falharNaProxima = false

  async enfileirar(mensagens: MensagemPush[]): Promise<void> {
    if (this.falharNaProxima) {
      this.falharNaProxima = false
      throw new Error('fila indisponível (simulado)')
    }
    this.enviadas.push(...mensagens)
  }

  limpar(): void {
    this.enviadas.length = 0
  }

  doCanal(canal: MensagemPush['canal']): MensagemPush[] {
    return this.enviadas.filter((m) => m.canal === canal)
  }
}
