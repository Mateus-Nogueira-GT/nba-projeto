import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { destinoInternoSeguro } from '@/modules/plataforma/auth/requisicao'

/**
 * O PORTÃO DO PAINEL, NA FONTE.
 *
 * O v2 foi escrito contra uma fachada SEMPRE logada como ADMIN: nada nele
 * precisou provar que recusa um usuário comum. Aqui cada página de
 * `(app)/admin` e cada ação de `features/admin` são lidas como texto — se
 * alguém copiar uma tela nova sem a guarda, este teste acusa antes do deploy.
 *
 * Procura a CHAMADA (`await exigirAdmin()` / `await negarSeNaoForAdmin()`),
 * não o identificador: a linha de import sozinha satisfazia a versão anterior
 * (plataforma.test.ts) e uma guarda trocada por objeto falso passava batida.
 * A fumaça em tempo de execução (`fumaca.test.tsx`) prova o outro lado: um
 * USUARIO de verdade não vê a página nem grava pela ação.
 */

const RAIZ_ADMIN = 'src/app/(app)/admin'
const CHAMADA_DA_GUARDA = /await (exigirAdmin|negarSeNaoForAdmin)\(\)/

const paginas = (d: string): string[] =>
  readdirSync(d).flatMap((n) => {
    const p = join(d, n)
    return statSync(p).isDirectory() ? paginas(p) : n === 'page.tsx' ? [p] : []
  })

const arquivosDeAcao = (d: string): string[] =>
  readdirSync(d).flatMap((n) => {
    const p = join(d, n)
    return statSync(p).isDirectory() ? arquivosDeAcao(p) : n === 'acoes.ts' ? [p] : []
  })

describe('todo o admin exige ADMIN no servidor', () => {
  it('as oito telas do painel do v2 existem em (app)/admin — e o grupo (admin) antigo saiu', () => {
    for (const tela of ['', 'usuarios', 'afiliados', 'afiliados/visual', 'backtest', 'galeria', 'mapeamento', 'mercados']) {
      expect(existsSync(join(RAIZ_ADMIN, tela, 'page.tsx')), tela || '(índice)').toBe(true)
    }
    // Duas árvores para a mesma URL seria o Next recusando o build — ou pior,
    // uma tela antiga sem a guarda nova respondendo em produção.
    expect(existsSync('src/app/(admin)')).toBe(false)
  })

  it('cada página do admin passa pela guarda (regex do brief)', () => {
    for (const p of paginas(RAIZ_ADMIN)) {
      const fonte = readFileSync(p, 'utf8')
      expect(fonte, p).toMatch(/exigirAdmin\(|GuardaAdmin|guarda/)
    }
  })

  it('cada página do admin CHAMA a guarda, não só a importa', () => {
    for (const p of paginas(RAIZ_ADMIN)) {
      expect(readFileSync(p, 'utf8'), `${p} não confere ADMIN`).toMatch(CHAMADA_DA_GUARDA)
    }
  })

  it('a guarda vem antes de qualquer leitura do banco na página', () => {
    // `getDb()` depois da guarda: uma tela que consulta e SÓ DEPOIS pergunta
    // o papel já gastou a consulta — e, num erro de render, já vazou o dado.
    for (const p of paginas(RAIZ_ADMIN)) {
      const fonte = readFileSync(p, 'utf8')
      const guarda = fonte.search(CHAMADA_DA_GUARDA)
      const corpo = fonte.indexOf('export default')
      const leitura = fonte.indexOf('getDb()', corpo)
      if (leitura === -1) continue
      expect(guarda, `${p}: getDb() antes da guarda`).toBeLessThan(leitura)
    }
  })

  it('toda server action do painel confere o papel — proteger a página não protege o POST', () => {
    // No App Router a server action é um endpoint POST chamável direto.
    // `entrar/acoes.ts` é o LOGIN do painel: quem chega ali ainda não é
    // ninguém, e exigir ADMIN antes de autenticar seria trancar a porta por
    // dentro. É a única exceção, e é nomeada.
    const acoes = arquivosDeAcao('src/features/admin').filter((p) => !p.endsWith('entrar/acoes.ts'))
    expect(acoes.length).toBeGreaterThanOrEqual(5)
    for (const p of acoes) {
      expect(readFileSync(p, 'utf8'), `${p} não confere ADMIN`).toMatch(/await exigirAdmin\(\)/)
    }
  })

  it('a prévia visual de afiliados continua notFound() em produção — antes da guarda', () => {
    const fonte = readFileSync(join(RAIZ_ADMIN, 'afiliados/visual/page.tsx'), 'utf8')
    expect(fonte).toMatch(/process\.env\.NODE_ENV === 'production'\) notFound\(\)/)
    expect(fonte.indexOf('notFound()')).toBeLessThan(fonte.search(CHAMADA_DA_GUARDA))
  })

  it('mapeamento e mercados consultam pelo drizzle-orm, nunca pela consulta-falsa da fachada', () => {
    for (const tela of ['mapeamento', 'mercados']) {
      const fonte = readFileSync(join(RAIZ_ADMIN, tela, 'page.tsx'), 'utf8')
      expect(fonte).not.toContain('consulta-falsa')
      expect(fonte).toMatch(/from 'drizzle-orm'/)
    }
  })
})

describe('o login do painel termina no índice /admin', () => {
  it('/admin está na allowlist do redirect pós-login (e /admin/usuarios continua)', () => {
    // Fora da allowlist o destino cai em `/` em silêncio — o admin entraria
    // e apareceria na Lista do assinante, sem erro nenhum para explicar.
    expect(destinoInternoSeguro('/admin')).toBe('/admin')
    expect(destinoInternoSeguro('/admin/usuarios')).toBe('/admin/usuarios')
    expect(destinoInternoSeguro('/admin/../conta')).toBe('/')
  })

  it('página e ação de entrar apontam para /admin', () => {
    const pagina = readFileSync('src/app/(acesso-admin)/admin/entrar/page.tsx', 'utf8')
    expect(pagina).toContain('destino="/admin"')
    const acao = readFileSync('src/features/admin/entrar/acoes.ts', 'utf8')
    expect(acao).toContain("?? '/admin')")
  })

  it('o formulário de entrar usa a impressão de dispositivo do app, não uma cópia', () => {
    // Mesma chave `ia_nba_dispositivo`; duas funções iguais é a receita para
    // uma delas mudar a chave um dia e todo aparelho conhecido virar novo.
    const fonte = readFileSync('src/features/admin/entrar/FormularioEntrarAdmin.tsx', 'utf8')
    expect(fonte).toContain("from '@/features/publico/dispositivo'")
    expect(fonte).not.toMatch(/function impressaoDoDispositivo/)
    expect(fonte).not.toContain('ia_nba_dispositivo')
  })
})
