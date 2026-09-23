import { NotificadorLog, type AvisoOperacional, type NotificadorOperacional } from './notificador'

/**
 * Canal real enquanto o G8 não é decidido: um webhook genérico (Slack,
 * Discord, Zapier aceitam JSON). Sem `ALERTA_WEBHOOK_URL`, fica desligado e
 * o aviso segue para o log, como hoje. Falha do webhook nunca derruba quem
 * avisa: cai no log.
 */
export class NotificadorWebhook implements NotificadorOperacional {
  private readonly reserva = new NotificadorLog()
  constructor(
    private readonly url: string,
    private readonly buscar: typeof fetch = fetch,
  ) {}

  async enviar(aviso: AvisoOperacional): Promise<void> {
    try {
      const resposta = await this.buscar(this.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(aviso),
        signal: AbortSignal.timeout(5_000),
      })
      if (!resposta.ok) throw new Error(`webhook respondeu ${resposta.status}`)
    } catch (erro) {
      console.error(JSON.stringify({ evento: 'alerta_webhook_falhou', erro: String(erro) }))
      await this.reserva.enviar(aviso)
    }
  }
}

export function notificadorDoAmbiente(
  ambiente: Readonly<Record<string, string | undefined>> = process.env,
): NotificadorOperacional {
  const url = ambiente.ALERTA_WEBHOOK_URL
  return url ? new NotificadorWebhook(url) : new NotificadorLog()
}
