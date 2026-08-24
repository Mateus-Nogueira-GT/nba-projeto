import { z } from 'zod'
import { NIVEIS, ATRIBUTOS } from '../tipos'

/**
 * Schema do config/ruleset.v1.yaml.
 *
 * O ruleset É a estratégia do CJ. Se um valor existe aqui, ele NÃO pode existir
 * também no código — ver CLAUDE.md, regra 1.
 */

const nivel = z.enum(NIVEIS)
const atributo = z.enum(ATRIBUTOS)

/** YAML converte chave numérica em string. `{ 20: 95 }` vira `{ "20": 95 }`. */
const porLinha = z.record(z.string(), z.number())
const porLinhaFaixa = z.record(z.string(), z.tuple([z.number(), z.number()]))
const porNivel = <T extends z.ZodTypeAny>(valor: T) => z.record(nivel, valor)

/**
 * Bloco POR ATRIBUTO — as tabelas de rebotes e assistências.
 *
 * PONTOS nunca aparece aqui: continua nos blocos homologados de topo. Este
 * bloco existe porque as escalas são incomparáveis — 25 é uma linha de pontos
 * plausível e uma linha de assistências impossível — e porque o CJ ainda não
 * enviou os números. Cada atributo declara sua `origem`, e a UI mostra o aviso
 * quando ela é `demonstracao`.
 *
 * Tudo é opcional: atributo sem bloco simplesmente não gera apito, que é
 * exatamente o comportamento de hoje.
 */
const blocoAtributo = z.object({
  origem: z.enum(['homologado', 'demonstracao']),
  oscilacao: z
    .object({
      delta: porNivel(z.number()),
    })
    .optional(),
  confianca: z
    .object({
      base: porNivel(porLinha),
      bonus_por_nivel_apito: porNivel(porLinha),
    })
    .optional(),
  odds: porNivel(porLinhaFaixa).optional(),
  marcos_green: porNivel(z.array(z.number())).optional(),
})

export type BlocoAtributo = z.infer<typeof blocoAtributo>

export const rulesetSchema = z.object({
  version: z.number().int().positive(),
  status: z.enum(['provisorio', 'homologado']),
  homologado_em: z.union([z.string(), z.date()]).optional(),

  media: z.object({
    janela: z.enum(['temporada', 'ultimos_5', 'ultimos_10']),
    modo: z.enum(['movel', 'congelada_na_rodada']),
  }),

  /** Rótulo da temporada. Calendário da liga, não estratégia — ver o YAML. */
  temporada: z.object({
    mes_inicio: z.number().int().min(1).max(12),
    formato: z.enum(['dois_anos', 'ano_inicial']),
  }),

  /**
   * Fuso que decide a que dia um jogo pertence e em que horário ele aparece.
   * Calendário e apresentação, não estratégia — mas vive aqui pela mesma razão
   * que `temporada`: nenhum valor de calendário solto no código.
   */
  rodada: z.object({
    fuso: z.string().min(1),
  }),

  arredondamento: z.object({
    politica: z.literal('precisao_cheia_arredonda_no_fim'),
    regra: z.literal('meio_para_cima'),
  }),

  niveis: z.object({
    ordem: z.array(nivel),
    atributos: z.array(atributo),
  }),

  oscilacao: z.object({
    delta: porNivel(z.number()),
    excecoes_por_jogador: z.record(z.string(), z.number()).default({}),
    criterio_sequencia: z.enum(['limiar', 'media_pura']),
    dnp: z.enum(['quebra', 'ignora']),
    nivel_minimo_apito: porNivel(z.number().int().min(1).max(3)),
    turbo: z.object({
      aplica_a: z.array(nivel),
      exige_nivel: z.number().int().min(1).max(3),
      acumula_bonus: z.boolean(),
    }),
  }),

  opd: z.object({
    janela: z.number().int().positive(),
    /**
     * Não é opção: o documento do CJ estabelece isso como regra absoluta
     * ("obrigatoriamente o desfalque tem que ser de cima pra baixo").
     * z.literal(true) impede que o YAML sugira uma alternativa inexistente.
     */
    exige_prefixo_hierarquia: z.literal(true),
    /** distância do desfalque -> nível do apito */
    mapa_nivel: z.record(z.string(), z.number().int().min(1).max(3)),
    turbo: z.object({
      exige_opd_nivel: z.number().int().min(1).max(3),
      exige_oscilacao_nivel: z.number().int().min(1).max(3),
    }),
  }),

  fire_live: z.object({
    quarto: z.number().int().positive(),
    quartos_por_jogo: z.number().int().positive(),
    multiplicadores: z.object({
      pontos_classificado: z.number(),
      pontos_randola: z.number(),
      pontos_nao_classificado: z.number(),
      rebotes: z.number(),
    }),
    assistencias: z.object({
      operacao: z.literal('soma'),
      valor: z.number(),
      media_minima: z.number(),
    }),
    travas: z.object({
      /** alvo válido se >= este valor */
      pontos_alvo_minimo: z.number(),
      /** alvo válido se > este valor (note a assimetria com pontos) */
      rebotes_alvo_minimo: z.number(),
    }),
    /** Cadência do loop do 1Q. Operacional, não estratégico — ver ADR-0003. */
    observacao: z.object({
      intervalo_segundos: z.number().int().positive(),
      limite_minutos: z.number().int().positive(),
    }),
    modo_fire: z.object({
      aplica_a: z.array(nivel),
      percentual_media: z.number().min(0).max(1),
    }),
    presenca_topo: z.object({
      criterio: z.enum(['dnp', 'em_quadra']),
      bloqueia_niveis: z.array(nivel),
      times_isentos: z.array(z.string()),
      bloco_topo: z.object({
        com_mvp: z.literal('todos_os_mvps'),
        sem_mvp: z.literal('jogador_1'),
      }),
    }),
  }),

  confianca: z.object({
    base: porNivel(porLinha),
    bonus_por_nivel_apito: porNivel(porLinha),
  }),

  odds: z.object({
    fonte: z.literal('casas'),
    agregacao: z.enum(['mediana', 'media']),
    casas_minimas: z.number().int().positive(),
    exibicao: z.literal('faixa'),
    fallback: z.literal('tabela_estatica'),
    tabela_estatica: porNivel(porLinhaFaixa),
  }),

  push: z.object({
    marcos_green: porNivel(z.array(z.number())),
    canais_independentes: z.array(z.string()),
  }),

  publicacao: z.object({
    lista_secreta: z.object({
      antecedencia_minutos: z.number().int().positive(),
    }),
  }),

  avisos: z.object({
    /** Alerta de dado parado — operação, não estratégia. Ver o YAML. */
    dado_parado: z.object({
      fora_de_jogo_minutos: z.number().positive(),
      em_janela_segundos: z.number().positive(),
      janela_antecedencia_minutos: z.number().positive(),
      realerta_minutos: z.number().positive(),
    }),
    blowout: z.object({
      quarto: z.number().int().positive(),
      diferenca_pontos: z.number(),
      aplica_a: z.string(),
      local: z.string(),
    }),
  }),

  /** Rebotes e assistências. Ausente = só pontos, o estado homologado. */
  por_atributo: z.partialRecord(atributo, blocoAtributo).default({}),

  /**
   * Gestão de banca. Opcional: o modelo do CJ ainda não chegou, e um ruleset
   * sem este bloco é um ruleset válido — a tela avisa que está sem modelo em
   * vez de inventar um número na hora de renderizar.
   */
  gestao_banca: z
    .object({
      origem: z.enum(['homologado', 'demonstracao']),
      unidade_percentual_banca: z.number().positive(),
      unidades_por_nivel_apito: z.record(z.string(), z.number().nonnegative()),
      bonus_turbo_unidades: z.number().nonnegative(),
      teto_por_entrada_percentual: z.number().positive(),
      stop_win_percentual: z.number().positive(),
      stop_loss_percentual: z.number().positive(),
    })
    .optional(),

  matchup: z.object({
    habilitado: z.boolean(),
    liberar_apos_dias_de_competicao: z.number().int().nonnegative(),
  }),
})

export type Ruleset = z.infer<typeof rulesetSchema>
