import type { VercelConfig } from '@vercel/config/v1'

export const config: VercelConfig = {
  framework: 'nextjs',
  crons: [
    // De 15 em 15 min: o horário do primeiro jogo é móvel, então quem decide
    // publicar é o job, não a expressão do cron.
    { path: '/api/cron/lista-secreta', schedule: '*/15 * * * *' },
  ],
}
