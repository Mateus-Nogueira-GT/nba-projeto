/**
 * FONTE ÚNICA da configuração da Vercel.
 *
 * `@vercel/config` compila este arquivo para `vercel.json` durante
 * `vercel build`, `vercel dev` e `vercel deploy`. Ter os dois versionados é
 * erro declarado ("One config file only") e, na prática, foi o que deixou o
 * cron de reconciliação de pagamento existir em um e faltar no outro.
 * Por isso `vercel.json` é artefato gerado e está no .gitignore.
 */
import type { VercelConfig } from '@vercel/config/v1'

export const config: VercelConfig = {
  framework: 'nextjs',
  functions: {
    'src/app/api/fila/push/route.ts': {
      experimentalTriggers: [
        {
          type: 'queue/v2beta',
          topic: 'push-eventos',
          retryAfterSeconds: 30,
          maxDeliveries: 20,
          maxConcurrency: 2,
        },
      ],
    },
    'src/app/api/fila/push/entregas/route.ts': {
      experimentalTriggers: [
        {
          type: 'queue/v2beta',
          topic: 'push-entregas',
          retryAfterSeconds: 30,
          maxDeliveries: 20,
          maxConcurrency: 5,
        },
      ],
    },
  },
  crons: [
    { path: '/api/cron/sincronizar-elenco', schedule: '0 9 * * *' },
    { path: '/api/cron/sincronizar-rodada', schedule: '0 11 * * *' },
    { path: '/api/cron/sincronizar-escalacao', schedule: '0 */6 * * *' },
    { path: '/api/cron/ao-vivo', schedule: '* * * * *' },
    { path: '/api/cron/lista-secreta', schedule: '*/15 * * * *' },
    { path: '/api/cron/reconciliar-pagamentos', schedule: '*/10 * * * *' },
  ],
}
