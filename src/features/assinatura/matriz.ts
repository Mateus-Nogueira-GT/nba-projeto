import type { NivelDoPlano } from '@/modules/plataforma/assinatura/nivel-do-plano'

/**
 * O QUE CADA NÍVEL ENTREGA — a vitrine, escrita uma vez.
 *
 * Os itens marcados com "(em breve)" não são entregues pela plataforma
 * hoje: Telegram é a spec seguinte; comunidade, lives e mentorias acontecem
 * fora do app; acesso antecipado a recursos novos está na lista de
 * "Funcionalidades que não existem" da spec §2 — nenhuma linha de código
 * ainda. Estão aqui porque a lista comercial de 15/09 os promete, e a
 * página de planos é onde a promessa aparece — mas o rótulo diz a
 * verdade. Nunca "probabilidade": o % é nível de confiança (CLAUDE.md).
 */
export const BENEFICIOS_POR_NIVEL: Record<NivelDoPlano, readonly string[]> = {
  GRATIS: [
    'Os jogos de cada rodada',
    'Resultados da noite anterior, com o que bateu',
    'Classificação, times e o resumo de cada jogador',
    'Histórico da sua gestão de banca',
  ],
  MVP: [
    'A Lista Secreta inteira: todos os apitos da rodada',
    'Fire Live: o 1º quarto ao vivo',
    'Base da temporada completa e estatísticas avançadas',
    'Jogo a jogo e números completos de cada jogador',
    'Nível de confiança de cada apito',
    'Gestão de banca com registro das entradas',
    'Alertas de apito no celular',
    'Assistente de IA, com cota diária',
    'Dois filtros de alerta no Telegram (em breve)',
    'Uma live mensal exclusiva (em breve)',
  ],
  ALL_STAR: [
    'Tudo do MVP',
    'Cota ampliada do assistente de IA',
    'Todos os filtros de alerta no Telegram (em breve)',
    'Sala exclusiva na comunidade (em breve)',
    'Lives semanais e uma mentoria coletiva por mês (em breve)',
    'Reprises completas e acesso aos especialistas (em breve)',
    'Acesso antecipado a recursos novos (em breve)',
    'Suporte prioritário',
  ],
}
