/**
 * Deriva a migration de DESCIDA a partir da de subida.
 *
 * Drizzle Kit não gera down migration. Escrever à mão convida a drift: alguém
 * adiciona tabela na subida e esquece da descida. Derivar elimina a classe
 * inteira de erro.
 *
 * REGRA: se aparecer um comando que este script não sabe inverter, ele FALHA.
 * Emitir descida incompleta em silêncio é pior do que não emitir nada.
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const DIR = 'drizzle'
const DIR_DOWN = join(DIR, 'down')
mkdirSync(DIR_DOWN, { recursive: true })

/**
 * DROP CONSTRAINT só é inversível conhecendo a definição ANTERIOR — que o SQL
 * da subida não carrega. Dicionário explícito, por nome: quem dropar uma
 * constraint existente registra aqui como ela era. Nome ausente derruba o
 * script, como qualquer comando desconhecido.
 */
const CONSTRAINTS_ANTERIORES = {
  // Antes da 0012: uma linha por (dia, estratégia). A 0012 acrescenta jogo_id.
  feed_snapshot_unico: 'UNIQUE ("data_referencia", "estrategia")',
  // A 0020 abre espaço para ajustes negativos, preservando a validação original
  // quando ela é revertida.
  comissoes_afiliados_valores_validos:
    'CHECK ("base_nip_centavos" >= 0 and "parcela_parceiro_centavos" >= 0 and "percentual_pontos_base" between 0 and 10000)',
}

/** Comandos cuja inversão é conhecida. Qualquer outro derruba o script. */
const INVERSORES = [
  {
    reconhece: /^ALTER TABLE "([a-z_]+)" DROP CONSTRAINT "([a-z_0-9]+)"/i,
    inverte: (m) => {
      const definicao = CONSTRAINTS_ANTERIORES[m[2]]
      if (!definicao) throw new Error(`não sei recriar a constraint "${m[2]}" na descida`)
      return `ALTER TABLE "${m[1]}" ADD CONSTRAINT "${m[2]}" ${definicao};`
    },
  },
  {
    reconhece: /^CREATE TABLE(?: IF NOT EXISTS)? "([a-z_]+)"/i,
    inverte: (m) => `DROP TABLE IF EXISTS "${m[1]}" CASCADE;`,
  },
  {
    reconhece: /^CREATE TYPE "public"\."([a-z_]+)"/i,
    inverte: (m) => `DROP TYPE IF EXISTS "public"."${m[1]}" CASCADE;`,
  },
  {
    reconhece: /^ALTER TABLE "([a-z_]+)" ADD COLUMN "([a-z_]+)"/i,
    inverte: (m) => `ALTER TABLE "${m[1]}" DROP COLUMN IF EXISTS "${m[2]}";`,
  },
  {
    reconhece: /^ALTER TABLE "([a-z_]+)" ALTER COLUMN "([a-z_]+)" DROP NOT NULL/i,
    inverte: (m) => `ALTER TABLE "${m[1]}" ALTER COLUMN "${m[2]}" SET NOT NULL;`,
  },
  /**
   * Índice ganha DROP explícito.
   *
   * Até a 0005 todo índice nascia na mesma migration da sua tabela, e cair
   * junto com ela bastava. A 0006 adiciona um índice a uma tabela criada na
   * 0000 — descer só a 0006 deixaria o índice para trás, e subir de novo
   * falharia com "already exists". `IF EXISTS` mantém seguro o caso antigo,
   * em que a tabela já foi derrubada.
   */
  {
    reconhece: /^CREATE (?:UNIQUE )?INDEX (?:IF NOT EXISTS )?"([a-z_0-9]+)"/i,
    inverte: (m) => `DROP INDEX IF EXISTS "${m[1]}";`,
  },
  {
    reconhece: /^ALTER TABLE "([a-z_]+)" ADD CONSTRAINT "([a-z_0-9]+)"/i,
    inverte: (m) => `ALTER TABLE "${m[1]}" DROP CONSTRAINT IF EXISTS "${m[2]}";`,
  },
  // A coluna adicionada na mesma migration será removida na descida; desfazer
  // o NOT NULL separadamente seria redundante.
  {
    reconhece: /^ALTER TABLE "[a-z_]+" ALTER COLUMN "[a-z_]+" SET NOT NULL/i,
    inverte: () => null,
  },
  // Backfills usam apenas colunas adicionadas pela mesma migration. Ao descer,
  // essas colunas caem; não existe dado anterior a restaurar.
  { reconhece: /^UPDATE "[a-z_]+"/i, inverte: () => null },
  { reconhece: /^DO \$\$/i, inverte: () => null },
]

let falhou = false

for (const arquivo of readdirSync(DIR).filter((f) => f.endsWith('.sql'))) {
  const sql = readFileSync(join(DIR, arquivo), 'utf8')
  const comandos = sql
    .split('--> statement-breakpoint')
    .map((c) => c.trim())
    .filter((c) => c.length > 0)

  const inversoes = []

  for (const comando of comandos) {
    const inversor = INVERSORES.find((i) => i.reconhece.test(comando))

    if (!inversor) {
      console.error(`ERRO em ${arquivo}: não sei inverter\n  ${comando.split('\n')[0]}`)
      falhou = true
      continue
    }

    let invertido
    try {
      invertido = inversor.inverte(comando.match(inversor.reconhece))
    } catch (erro) {
      console.error(`ERRO em ${arquivo}: ${erro.message}\n  ${comando.split('\n')[0]}`)
      falhou = true
      continue
    }
    if (invertido) inversoes.push(invertido)
  }

  writeFileSync(
    join(DIR_DOWN, arquivo),
    [
      `-- DESCIDA de ${arquivo} — GERADO por scripts/gerar-down.mjs, não editar à mão.`,
      '',
      ...inversoes.reverse(),
      '',
    ].join('\n'),
  )
  console.log(`${arquivo}: ${inversoes.length} comandos de descida`)
}

if (falhou) {
  console.error('\nDescida INCOMPLETA. Ensine o inversor ou escreva a descida à mão.')
  process.exit(1)
}
