import type { VercelConfig } from '@vercel/config/v1'

export const config: VercelConfig = {
  framework: 'nextjs',
  crons: [
    // De 15 em 15 min: o horário do primeiro jogo é móvel, então quem decide
    // publicar é o job, não a expressão do cron.
    { path: '/api/cron/lista-secreta', schedule: '*/15 * * * *' },
    // De minuto em minuto: quem define o tipoff é o dado, não o horário da
    // tabela — atraso de transmissão é rotina. O 1º quarto dura ~25 min, então
    // começar a observar 5 min atrasado já custa um terço da janela.
    { path: '/api/cron/fire-live', schedule: '* * * * *' },
  ],
}
