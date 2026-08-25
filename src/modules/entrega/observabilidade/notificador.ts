/**
 * Porta de notificação OPERACIONAL — avisa a equipe, nunca o assinante.
 * O canal real (e-mail, Slack, WhatsApp) aguarda decisão do cliente (G8);
 * até lá, produção usa o log estruturado e os testes contam pela memória.
 */
export type AvisoOperacional = {
  severidade: 'ALTA' | 'MEDIA'
  titulo: string
  corpo: string
}

export interface NotificadorOperacional {
  enviar(aviso: AvisoOperacional): Promise<void>
}

export class NotificadorMemoria implements NotificadorOperacional {
  readonly enviados: AvisoOperacional[] = []
  async enviar(aviso: AvisoOperacional): Promise<void> {
    this.enviados.push(aviso)
  }
}

/** Default de produção até G8: linha estruturada, sem segredo, sem endpoint. */
export class NotificadorLog implements NotificadorOperacional {
  async enviar(aviso: AvisoOperacional): Promise<void> {
    console.error(
      JSON.stringify({
        evento: 'aviso_operacional',
        severidade: aviso.severidade,
        titulo: aviso.titulo,
        corpo: aviso.corpo,
      }),
    )
  }
}
