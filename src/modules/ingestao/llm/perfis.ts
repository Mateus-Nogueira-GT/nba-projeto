import type { PerfilLLM } from './porta'

/**
 * MAPA PERFIL → MODELOS. Config versionada, não decisão espalhada no código.
 *
 * A ordem é a cadeia de fallback: o OpenRouter tenta o primeiro e cai para o
 * seguinte quando o modelo está fora, sem saldo ou em limite de taxa. Por isso
 * todo perfil tem mais de um — um modelo indisponível não pode derrubar a
 * feature (é o motivo de existir o roteador).
 *
 * Id de modelo APODRECE: em 14/09/2026 dois ids desta tabela já não existiam
 * mais no catálogo, e os três perfis que os traziam na frente rodavam com um
 * único modelo vivo — a cadeia era decorativa. `npm run chat:sondar` confere o
 * catálogo; ele depende de rede e por isso não roda no CI.
 *
 * Os ids são detalhe trocável; o que a spec fixa é a CLASSE de cada perfil:
 * narrativa/resumo baratos e rápidos, chat intermediário, admin o melhor
 * (volume mínimo, custo irrelevante).
 */
export const PERFIS: Record<
  PerfilLLM,
  { modelos: string[]; maxTokens: number; temperatura: number }
> = {
  narrativa: {
    modelos: ['google/gemini-2.5-flash', 'openai/gpt-4o-mini', 'anthropic/claude-haiku-4.5'],
    maxTokens: 160,
    temperatura: 0.7,
  },
  resumo: {
    modelos: ['google/gemini-2.5-flash', 'openai/gpt-4o-mini', 'anthropic/claude-haiku-4.5'],
    maxTokens: 320,
    temperatura: 0.7,
  },
  chat: {
    // O suporte é o perfil de MAIOR volume (uma chamada por mensagem) e o de
    // contexto mais gordo: o V4 Flash custa cerca de um quarentavo do
    // gpt-4o-mini por token de entrada, com 1M de janela.
    modelos: ['deepseek/deepseek-v4-flash', 'openai/gpt-4o-mini', 'anthropic/claude-haiku-4.5'],
    maxTokens: 700,
    temperatura: 0.4,
  },
  admin: {
    modelos: ['anthropic/claude-sonnet-4', 'openai/gpt-4o'],
    maxTokens: 1200,
    temperatura: 0,
  },
}

export function modelosDoPerfil(perfil: PerfilLLM): string[] {
  return PERFIS[perfil].modelos
}

export function parametrosDoPerfil(perfil: PerfilLLM): {
  maxTokens: number
  temperatura: number
} {
  const { maxTokens, temperatura } = PERFIS[perfil]
  return { maxTokens, temperatura }
}
