import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * OS AGREGADOS DA TEMPORADA EM CACHE (auditoria de 23/09, reescrito na
 * temporada retroativa de 25/09).
 *
 * Toda suíte de tela mocka `next/cache`, então o cache em si nunca roda nos
 * testes: este fixa a FORMA — toda leitura cacheada usa a mesma tag e tem
 * revalidação — e que a leitura que decide a temporada exibida só chega ao
 * banco por um caminho cacheado, como `lateral/__tests__/cache-forma` faz com
 * a lateral.
 *
 * O arquivo cresceu de 2 para 5 leitores cacheados com a temporada
 * retroativa (25/09): a taxa e a lista de "com dados" ganharam a versão
 * retroativa, e o cálculo de hiato entrou. Um total fixo (`toHaveLength(2)`)
 * quebraria a cada leitor novo sem dizer nada sobre o que quebrou — por isso
 * a prova aqui é por CONTAGEM RELATIVA (toda chamada tem tag e revalidate) e
 * por NOME (a lista alerta se um leitor for renomeado, removido ou trocado
 * por um sem cache).
 */
const semComentarios = (f: string) =>
  f.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

/**
 * Isola o corpo de uma função pelo nome, por profundidade de chaves — não por
 * um `indexOf('\n}')` sortudo, que quebraria se o corpo ganhasse um objeto ou
 * array multilinha (o `Promise.all([...])` de `temporadasDaTelaCacheadas` já
 * tem um `])` que não é chave, mas não custa ser exato).
 */
function corpoDaFuncao(fonte: string, nomeDaFuncao: string): string {
  const marcador = `function ${nomeDaFuncao}(`
  const inicioAssinatura = fonte.indexOf(marcador)
  if (inicioAssinatura === -1) throw new Error(`função ${nomeDaFuncao} não encontrada no arquivo`)
  const inicioCorpo = fonte.indexOf('{', inicioAssinatura)
  let profundidade = 0
  for (let i = inicioCorpo; i < fonte.length; i++) {
    if (fonte[i] === '{') profundidade++
    else if (fonte[i] === '}') {
      profundidade--
      if (profundidade === 0) return fonte.slice(inicioCorpo, i + 1)
    }
  }
  throw new Error(`chave de fechamento de ${nomeDaFuncao} não encontrada`)
}

/**
 * Os nomes importados de UM módulo específico, por arquivo — inclui os de
 * `import type { ... }` (não custa) e resolve `X as Y` pelo nome ORIGINAL
 * (`X`), que é o que importa para saber se a função crua entrou na tela.
 */
function especificadoresDoModulo(fonte: string, modulo: string): string[] {
  const moduloEscapado = modulo.replace(/[/]/g, '\\/')
  const regex = new RegExp(
    `import\\s+(?:type\\s+)?\\{([^}]*)\\}\\s+from\\s+'${moduloEscapado}'`,
    'g',
  )
  const nomes: string[] = []
  for (const m of fonte.matchAll(regex)) {
    for (const parte of (m[1] ?? '').split(',')) {
      const nome = parte.trim().split(/\s+as\s+/)[0]?.trim()
      if (nome) nomes.push(nome)
    }
  }
  return nomes
}

/** As funções CRUAS — sem cache — que decidem a temporada exibida ou o rol de temporadas com dado. */
const FUNCOES_CRUAS_DE_TEMPORADA = [
  'temporadaParaExibirNoCalendario',
  'temporadasComDados',
  'temporadaParaExibir',
]
const MODULO_CRU = '@/modules/entrega/estatisticas/temporadas'

describe('agregados da temporada em cache', () => {
  it('todo unstable_cache do arquivo tem a tag compartilhada e revalidate, e a lista é conhecida', () => {
    const fonte = semComentarios(readFileSync('src/app/_cache/temporada.ts', 'utf8'))

    const chamadas = fonte.match(/unstable_cache\(/g) ?? []
    // Cada leitura em cache precisa da MESMA tag (é o que a lateral invalida)
    // e de um `revalidate` — não importa quantas existam, tem que ser 1 para
    // 1 com as chamadas de `unstable_cache(`.
    const comTagERevalidate = fonte.match(/\{ tags: \[TAG_LATERAL\], revalidate: \d+ \}/g) ?? []
    expect(comTagERevalidate).toHaveLength(chamadas.length)

    // A lista nomeada é o que torna a contagem significativa: se um leitor
    // cacheado for renomeado, apagado ou trocado por um sem cache, é aqui
    // que este teste aponta QUAL.
    const nomeados = [...fonte.matchAll(/(?:export )?const (\w+) = unstable_cache\(/g)].map(
      (m) => m[1],
    )
    expect(nomeados).toEqual([
      'temporadaExibidaCacheada',
      'taxaDaTemporadaCacheada',
      'temporadasComDadosCacheadas',
      'calendarioComecouCacheado',
      'taxaRetroativaCacheada',
    ])

    // Nenhum `getDb()` solto: os únicos que existem no arquivo são os de
    // dentro dos leitores cacheados acima — um por leitor.
    const getDbs = fonte.match(/getDb\(/g) ?? []
    expect(getDbs).toHaveLength(chamadas.length)
  })

  it('temporadasDaTelaCacheadas só chega à temporada exibida pelo leitor cacheado', () => {
    const fonte = semComentarios(readFileSync('src/app/_cache/temporada.ts', 'utf8'))
    const corpo = corpoDaFuncao(fonte, 'temporadasDaTelaCacheadas')

    // É a peça que decide o padrão das telas (Resultados, Lista,
    // Estatísticas): tem que vir do cache, nunca de uma consulta direta.
    expect(corpo).toContain('temporadaParaExibirCacheada(')
    expect(corpo).not.toMatch(/getDb\(/)
  })

  it('os carregadores das telas usam os leitores cacheados, nunca as funções cruas', () => {
    // Quem hoje decide a temporada de cada tela: o carregador compartilhado
    // de Estatísticas (`indice`/`jogador`/`time` chamam este, não o cache
    // direto) e os dois carregadores do v2 que leem a temporada por conta
    // própria (Resultados e Lista).
    const carregadores = [
      'src/features/estatisticas/temporada.ts',
      'src/features/resultados/carregar.ts',
      'src/features/lista/carregar.ts',
    ]
    for (const arquivo of carregadores) {
      const fonte = semComentarios(readFileSync(arquivo, 'utf8'))
      // Usa pelo menos um dos leitores cacheados — não fica sem cache nenhum.
      expect(fonte, arquivo).toMatch(/\b(temporadaParaExibirCacheada|temporadasDaTelaCacheadas)\(/)
      // E nunca importa a versão crua por baixo do pano — isso reintroduziria
      // a mesma consulta por visita que o cache existe para evitar.
      const cruas = especificadoresDoModulo(fonte, MODULO_CRU).filter((n) =>
        FUNCOES_CRUAS_DE_TEMPORADA.includes(n),
      )
      expect(cruas, arquivo).toEqual([])
    }

    // As telas puras de Estatísticas (`indice`/`jogador`/`time`) delegam a
    // temporada ao carregador acima — nenhuma delas importa a função crua
    // diretamente, nem para "só uma consulta rápida".
    for (const arquivo of [
      'src/features/estatisticas/indice.ts',
      'src/features/estatisticas/jogador.ts',
      'src/features/estatisticas/time.ts',
    ]) {
      const fonte = semComentarios(readFileSync(arquivo, 'utf8'))
      const cruas = especificadoresDoModulo(fonte, MODULO_CRU).filter((n) =>
        FUNCOES_CRUAS_DE_TEMPORADA.includes(n),
      )
      expect(cruas, arquivo).toEqual([])
    }
  })
})
