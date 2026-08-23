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
  crons: cronsDoPlano(),
}

/**
 * O plano Hobby da Vercel aceita NO MÁXIMO dois crons, ambos diários — e o
 * produto depende de crons sub-diários: `ao-vivo` a cada minuto é o gatilho
 * do Fire Live, a reconciliação de pagamento roda a cada 10 min e a saúde a
 * cada 5. Ou seja: EM PRODUÇÃO, o plano Pro é requisito, não luxo (ADR-0003).
 *
 * `CRON_SOMENTE_DIARIO=true` existe só para a fase de homologação numa conta
 * Hobby: o deploy passa com os dois jobs diários e o resto é disparado à mão
 * com o Bearer do CRON_SECRET (ver docs/runbooks). Crons nem rodam em
 * Preview — a variável destrava apenas o deploy. NUNCA a deixe ligada num
 * projeto Pro de produção: ela desligaria o Fire Live inteiro.
 */
function cronsDoPlano(): VercelConfig['crons'] {
  const cronsCompletos = [
    { path: '/api/cron/sincronizar-elenco', schedule: '0 9 * * *' },
    { path: '/api/cron/sincronizar-rodada', schedule: '0 11 * * *' },
    { path: '/api/cron/sincronizar-escalacao', schedule: '0 */6 * * *' },
    { path: '/api/cron/ao-vivo', schedule: '* * * * *' },
    { path: '/api/cron/lista-secreta', schedule: '*/15 * * * *' },
    { path: '/api/cron/reconciliar-pagamentos', schedule: '*/10 * * * *' },
    { path: '/api/cron/saude', schedule: '*/5 * * * *' },
  ]
  if (process.env.CRON_SOMENTE_DIARIO !== 'true') return cronsCompletos

  return cronsCompletos.filter((c) =>
    ['/api/cron/sincronizar-elenco', '/api/cron/sincronizar-rodada'].includes(c.path),
  )
}
