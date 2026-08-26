import type { PerfilLLM } from './porta'

/**
 * MAPA PERFIL → MODELOS. Config versionada, não decisão espalhada no código.
 *
 * A ordem é a cadeia de fallback: o OpenRouter tenta o primeiro e cai para o
 * seguinte quando o modelo está fora, sem saldo ou em limite de taxa. Por isso
 * todo perfil tem mais de um — um modelo indisponível não pode derrubar a
 * feature (é o motivo de existir o roteador).
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
    modelos: [
      'google/gemini-2.0-flash-001',
      'openai/gpt-4o-mini',
      'anthropic/claude-3-5-haiku',
    ],
    maxTokens: 160,
    temperatura: 0.7,
  },
  resumo: {
    modelos: [
      'google/gemini-2.0-flash-001',
      'openai/gpt-4o-mini',
      'anthropic/claude-3-5-haiku',
    ],
    maxTokens: 320,
    temperatura: 0.7,
  },
  chat: {
    modelos: ['anthropic/claude-3-5-haiku', 'openai/gpt-4o-mini', 'google/gemini-2.0-flash-001'],
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
