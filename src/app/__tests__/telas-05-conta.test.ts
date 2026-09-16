import { eq } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { gravarConferencia } from './conferencia'
import { bancoDeTeste } from '../../modules/dominio/__tests__/ajuda-banco'
import { acessoDeTeste } from '../../modules/plataforma/__tests__/acesso-de-teste'
import type { AcessoComNivel } from '../../modules/plataforma/assinatura/direito'

/**
 * PERFIL · IDENTIDADE (spec 12/09, §4.3, Task 4).
 *
 * O print de produção mostrava uma pilha de rótulos e valores — e-mail solto
 * sob o título, nada que a pessoa pudesse fazer além de ativar alertas. Esta
 * suíte prova a primeira virada: a tela ganha um cabeçalho com foto/iniciais,
 * nome e e-mail, e duas ações que funcionam sem JavaScript.
 *
 * Mesmo arnês de `telas-demo.test.ts` — o componente de servidor de verdade
 * sobre um PGlite de verdade —, mas sem `simularAte`: a tela de conta não lê
 * jogo nenhum, então semear uma temporada aqui só pagaria PGlite por nada.
 */

let banco: Awaited<ReturnType<typeof bancoDeTeste>>

const USUARIO_DEMO = '00000000-0000-4000-8000-000000000001'
// `null` por padrão: nenhum dispositivo é "este aparelho". O teste de
// dispositivos (Task 5) troca este valor antes de renderizar, para simular a
// sessão atual autenticada por aquele dispositivo — mesmo campo que
// `validarSessao` preenche de verdade em produção.
let dispositivoAtualNoTeste: string | null = null
vi.mock('../../modules/plataforma/auth/cookies', () => ({
  sessaoAtual: async () => ({
    usuarioId: USUARIO_DEMO,
    email: 'demo@teste.com',
    dispositivoId: dispositivoAtualNoTeste,
  }),
}))
// Mesmo arranjo de `dispositivoAtualNoTeste`: o direito de acesso é mutável
// para o teste do plano vencido (Task 6) trocá-lo antes de renderizar. O
// padrão é o de sempre — acesso vigente, sem data de fim.
let acessoNoTeste: AcessoComNivel = acessoDeTeste('MVP')
vi.mock('../../modules/plataforma/assinatura/direito', () => ({
  avaliarAcesso: async () => acessoNoTeste,
}))
vi.mock('../../modules/dominio/db/cliente', () => ({
  getDb: () => banco.db,
  fecharDb: async () => {},
}))

beforeAll(async () => {
  process.env.DATABASE_URL = 'postgres://demo'
  banco = await bancoDeTeste()
  const { usuarios } = await import('../../modules/dominio/db/schema')
  await banco.db
    .insert(usuarios)
    .values({ id: USUARIO_DEMO, email: 'demo@teste.com', senhaHash: 'x', nome: 'Demo Teste' })
    .onConflictDoNothing()
}, 60_000)

afterAll(async () => {
  await banco.fechar()
})

describe('perfil — a conta da pessoa, não um relatório sobre ela (spec 12/09, §4.3)', () => {
  it('o topo tem foto ou iniciais, nome e e-mail', async () => {
    const { default: Pagina } = await import('../(app)/conta/page')
    const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
    await gravarConferencia('perfil', html)
    expect(html).toContain('>DT<') // iniciais de "Demo Teste", sem foto
    expect(html).toContain('Demo Teste')
    expect(html).toContain('demo@teste.com')
  })

  it('a pessoa escolhe um dos oito avatares e troca o nome sem JavaScript', async () => {
    const { default: Pagina } = await import('../(app)/conta/page')
    const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
    // React 19 tem posição fixa para `value`/`name` num `<button>` de
    // formulário com Server Action (confirmado: mesmo resultado com os dois
    // atributos em qualquer ordem na JSX, com ou sem `<form action>` ao
    // redor) — mas essa posição é detalhe do renderer, não o requisito. O que
    // importa é que os OITO botões de avatar carreguem os dois atributos,
    // então cada checagem é independente de ordem (`.includes`/`.test`), sem
    // impor qual vem primeiro.
    const botoesDeAvatar = [...html.matchAll(/<button\b[^>]*>/g)]
      .map((m) => m[0])
      .filter(
        (tag) => tag.includes('name="fotoUrl"') && /value="\/avatares\/0[1-8]\.svg"/.test(tag),
      )
    expect(botoesDeAvatar).toHaveLength(8)
    expect(html).toContain('name="nome"')
  })
})

describe('perfil — segurança e dispositivos (spec 12/09, §4.3, Task 5)', () => {
  const DISPOSITIVO_ATUAL = '00000000-0000-4000-8000-0000000000a1'
  const DISPOSITIVO_INATIVO = '00000000-0000-4000-8000-0000000000a2'
  const DISPOSITIVO_ATIVO_OUTRO = '00000000-0000-4000-8000-0000000000a3'

  beforeAll(async () => {
    const { dispositivos, sessoes } = await import('../../modules/dominio/db/schema')
    await banco.db.insert(dispositivos).values([
      {
        id: DISPOSITIVO_ATUAL,
        usuarioId: USUARIO_DEMO,
        fingerprint: 'fp-atual',
        tipo: 'DESKTOP',
        ultimoUso: new Date('2026-09-12T10:00:00Z'),
      },
      {
        id: DISPOSITIVO_INATIVO,
        usuarioId: USUARIO_DEMO,
        fingerprint: 'fp-inativo',
        tipo: 'MOBILE',
        ultimoUso: new Date('2026-09-11T10:00:00Z'),
      },
      {
        id: DISPOSITIVO_ATIVO_OUTRO,
        usuarioId: USUARIO_DEMO,
        fingerprint: 'fp-ativo-outro',
        tipo: 'MOBILE',
        ultimoUso: new Date('2026-09-11T12:00:00Z'),
      },
    ])
    // Sessão viva só para o atual e para o "ativo-outro" — o inativo fica sem
    // linha em `sessoes`, para provar que a marcação "· ativo" (Minor 2 do
    // fix round 1) depende de sessão viva, não só de existir o dispositivo.
    await banco.db.insert(sessoes).values([
      {
        usuarioId: USUARIO_DEMO,
        dispositivoId: DISPOSITIVO_ATUAL,
        tokenHash: 'hash-dispositivo-atual-telas05',
        expiraEm: new Date('2099-01-01T00:00:00Z'),
      },
      {
        usuarioId: USUARIO_DEMO,
        dispositivoId: DISPOSITIVO_ATIVO_OUTRO,
        tokenHash: 'hash-dispositivo-ativo-outro-telas05',
        expiraEm: new Date('2099-01-01T00:00:00Z'),
      },
    ])
  })

  it('trocar senha exige a atual; trocar e-mail exige a senha; a tela diz que a confirmação por e-mail vem com o provedor', async () => {
    const { default: Pagina } = await import('../(app)/conta/page')
    const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('name="senhaAtual"')
    expect(html).toContain('name="novaSenha"')
    expect(html).toContain('name="novoEmail"')
    // React 19 serializa `minLength` no seu próprio casing de JSX (não em
    // minúsculas) — HTML não liga para caixa em nome de atributo, então a
    // checagem também não liga.
    expect(html.toLowerCase()).toContain('minlength="12"')
    expect(html.toLowerCase()).toContain('confirmação por e-mail')
  })

  it('cada dispositivo tem "encerrar sessão", o aparelho em uso está marcado, e os outros ativos dizem "ativo"', async () => {
    dispositivoAtualNoTeste = DISPOSITIVO_ATUAL
    try {
      const { default: Pagina } = await import('../(app)/conta/page')
      const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
      expect(html).toContain('name="dispositivoId"')
      expect(html).toContain('Encerrar sessão')
      expect(html.toLowerCase()).toContain('este aparelho')
      // O botão do aparelho em uso precisa dizer o que vai acontecer — não
      // faz sentido oferecer "encerrar sessão" nele sem avisar que é o
      // próprio (spec 12/09, correção 2 do Task 5).
      expect(html).toContain('Encerrar esta sessão')
      // Minor 2 do fix round 1: a marcação "· ativo" dos OUTROS dispositivos
      // com sessão viva não pode sumir por causa da marcação "este aparelho"
      // — é a única informação escrita de que existe sessão viva ali.
      expect(html).toContain('· ativo')
    } finally {
      dispositivoAtualNoTeste = null
    }
  })
})

describe('perfil — quatro blocos, assinatura e o desktop em duas colunas (spec 12/09, §4.3, Task 6)', () => {
  // A contagem regressiva é contada a partir do relógio de verdade da tela
  // (um componente de servidor chama `new Date()`), então a semente também
  // parte de agora: uma data fixa no passado daria uma contagem negativa.
  const AGORA = new Date()

  /** O bloco de assinatura recortado do HTML: do título dele até o título do bloco seguinte. */
  function blocoDeAssinatura(html: string): string {
    const inicio = html.indexOf('>ASSINATURA<')
    const fim = html.indexOf('>ALERTAS<')
    expect(inicio).toBeGreaterThanOrEqual(0)
    expect(fim).toBeGreaterThan(inicio)
    return html.slice(inicio, fim)
  }

  /** O bloco de alertas recortado do HTML: do título dele até o título do bloco seguinte. */
  function blocoDeAlertas(html: string): string {
    const inicio = html.indexOf('>ALERTAS<')
    const fim = html.indexOf('>DISPOSITIVOS<')
    expect(inicio).toBeGreaterThanOrEqual(0)
    expect(fim).toBeGreaterThan(inicio)
    return html.slice(inicio, fim)
  }

  it('sem plano não parece erro: é uma chamada com o botão de assinar, não quatro traços', async () => {
    const { default: Pagina } = await import('../(app)/conta/page')
    const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
    expect(html).not.toContain('Não contratado')
    // A asserção é sobre o BLOCO, não sobre a página: o travessão do `Selo` do
    // topo (Task 4) é o ícone de "SEM PLANO" e é legítimo. O que o print
    // mostrava e não pode voltar é o relatório de campos vazios —
    // "Sem plano · Não contratado · — · —" — dentro da assinatura.
    const bloco = blocoDeAssinatura(html)
    expect(bloco.match(/>—</g) ?? []).toHaveLength(0)
    expect(bloco).toContain('Lista Secreta antes dos jogos')
    expect(bloco).toContain('href="/assinar"')
  })

  it('os quatro blocos, nesta ordem: Conta · Assinatura · Alertas · Dispositivos — e a grade do desktop', async () => {
    const { default: Pagina } = await import('../(app)/conta/page')
    const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
    const ordem = ['>CONTA<', '>ASSINATURA<', '>ALERTAS<', '>DISPOSITIVOS<'].map((m) =>
      html.indexOf(m),
    )
    expect(ordem.every((i) => i >= 0)).toBe(true)
    // A ordem é a da spec: é ela que o celular lê de cima para baixo.
    expect([...ordem].sort((a, b) => a - b)).toEqual(ordem)
    expect(html).toContain('class="grade-conta"')
  })

  // Achado da revisão final (16/09): o grátis via "Ativar alertas", o
  // navegador pedia a permissão de notificação — que só se pede UMA VEZ por
  // origem — e só depois a API respondia 403. `AtivarAlertas` é componente
  // de cliente que nasce em `estado: 'carregando'` e não renderiza nada no
  // servidor (o efeito que o tira desse estado nunca roda em SSR); por isso
  // a prova de que o botão sumiu não está no texto dele — nunca apareceria
  // de qualquer forma —, e sim na ausência do painel de preferências que o
  // acompanha (`PainelExperiencia`, que renderiza de verdade no servidor) e
  // na presença do convite no lugar dos dois.
  it('GRATIS vê o convite no lugar do botão — mas NÃO perde as preferências', async () => {
    // O botão é o que importa esconder: ativar alertas faz o NAVEGADOR pedir a
    // permissão de notificação, uma vez só por origem, e o grátis receberia 403
    // da API logo depois — queimando uma permissão que ele não poderá conceder
    // quando assinar.
    //
    // As preferências FICAM nos dois níveis: jogadores acompanhados e
    // intensidade do ao vivo são dado DELE. Tirá-las contrariaria a regra que a
    // gestão segue (spec, decisão 8) — quem deixa de pagar não perde o que é seu.
    acessoNoTeste = acessoDeTeste('GRATIS')
    try {
      const { default: Pagina } = await import('../(app)/conta/page')
      const bloco = blocoDeAlertas(
        renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) })),
      )
      expect(bloco).toContain('Os alertas de apito')
      expect(bloco).toContain('começa no')
      expect(bloco).toMatch(/href="\/assinar\?nivel=MVP&(amp;)?voltar=%2Fconta"/)
      // O que é dele continua lá.
      expect(bloco).toContain('Movimento no Ao Vivo')
      expect(bloco).toContain('Jogadores acompanhados')
    } finally {
      acessoNoTeste = acessoDeTeste('MVP')
    }

    const { default: Pagina } = await import('../(app)/conta/page')
    const bloco = blocoDeAlertas(
      renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) })),
    )
    expect(bloco).toContain('Movimento no Ao Vivo')
    expect(bloco).not.toContain('começa no')
  })

  it('com plano vigente, a contagem regressiva para a próxima cobrança está escrita em dias', async () => {
    const { assinaturas } = await import('../../modules/dominio/db/schema')
    await banco.db.insert(assinaturas).values({
      usuarioId: USUARIO_DEMO,
      plano: 'MENSAL',
      nivelDoPlano: 'MVP',
      modalidade: 'MENSAL',
      status: 'ATIVA',
      proximaCobranca: new Date(AGORA.getTime() + 5 * 86_400_000),
      atualizadoEm: AGORA,
    })
    try {
      const { default: Pagina } = await import('../(app)/conta/page')
      const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
      expect(html).toMatch(/próxima cobrança em 5 dias/i)
      // Com plano, a chamada de quem nunca assinou seria mentira.
      expect(blocoDeAssinatura(html)).not.toContain('Sem plano ativo')
    } finally {
      await banco.db.delete(assinaturas).where(eq(assinaturas.usuarioId, USUARIO_DEMO))
    }
  })

  it('plano vencido: o bloco diz que o acesso está inativo e mostra o caminho de volta', async () => {
    const { assinaturas } = await import('../../modules/dominio/db/schema')
    await banco.db.insert(assinaturas).values({
      usuarioId: USUARIO_DEMO,
      plano: 'MENSAL',
      nivelDoPlano: 'MVP',
      modalidade: 'MENSAL',
      status: 'CANCELADA',
      proximaCobranca: null,
      atualizadoEm: AGORA,
    })
    acessoNoTeste = acessoDeTeste('GRATIS')
    try {
      const { default: Pagina } = await import('../(app)/conta/page')
      const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
      const bloco = blocoDeAssinatura(html)
      expect(bloco).toContain('MENSAL')
      expect(bloco.toLowerCase()).toContain('acesso inativo')
      expect(bloco).toContain('href="/assinar"')
      // Quem já assinou não recebe a chamada de quem nunca assinou.
      expect(bloco).not.toContain('Sem plano ativo')
      // O ícone do selo fala do ACESSO: com o plano fora de validade, um "✓"
      // ao lado do nome do plano diria "confirmado" sobre o que não vale mais.
      expect(html.slice(0, html.indexOf('>CONTA<'))).toContain(
        '<span aria-hidden="true">—</span>MENSAL',
      )
    } finally {
      acessoNoTeste = acessoDeTeste('MVP')
      await banco.db.delete(assinaturas).where(eq(assinaturas.usuarioId, USUARIO_DEMO))
    }
  })

  it('assinatura sem NOME de plano ainda é uma assinatura: nada de chamada, e o cancelar continua lá', async () => {
    // `plano` é anulável e o Mercado Pago devolve `reason` vazio em contrato
    // sem nome (`nomePlano: recurso.reason ?? null`). Quem paga não pode
    // receber a chamada de quem nunca assinou — nem perder o botão de
    // cancelar, que é o único caminho de saída dentro do app.
    const { assinaturas } = await import('../../modules/dominio/db/schema')
    await banco.db.insert(assinaturas).values({
      usuarioId: USUARIO_DEMO,
      mercadopagoId: 'mp-contrato-sem-nome-de-plano',
      plano: null,
      nivelDoPlano: 'MVP',
      modalidade: 'MENSAL',
      status: 'ATIVA',
      atualizadoEm: AGORA,
    })
    try {
      const { default: Pagina } = await import('../(app)/conta/page')
      const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
      const bloco = blocoDeAssinatura(html)
      expect(bloco).not.toContain('Sem plano ativo')
      expect(bloco).toContain('Cancelar assinatura')
      expect(bloco).toContain('ATIVA')
      // O rótulo do selo do topo ramifica pelo MESMO contrato que o bloco.
      // Escrever "SEM PLANO" duas linhas acima de "Situação · ATIVA" seria a
      // tela se contradizendo; sem nome de plano, o selo mostra o status.
      const topo = html.slice(0, html.indexOf('>CONTA<'))
      expect(topo).not.toContain('SEM PLANO')
      expect(topo).toContain('<span aria-hidden="true">✓</span>ATIVA')
    } finally {
      await banco.db.delete(assinaturas).where(eq(assinaturas.usuarioId, USUARIO_DEMO))
    }
  })

  it('contrato cancelado e sem nome de plano: o selo diz "CANCELADA" e o ícone não dá confirmado', async () => {
    // O cruzamento dos dois casos-limite. O ícone do selo fala do ACESSO, não
    // de existir linha na tabela: "✓ CANCELADA" seria um confirmado colado num
    // rótulo que diz o contrário — a mesma contradição que "✓ SEM PLANO" já
    // tinha custado uma correção na Task 4.
    const { assinaturas } = await import('../../modules/dominio/db/schema')
    await banco.db.insert(assinaturas).values({
      usuarioId: USUARIO_DEMO,
      plano: null,
      nivelDoPlano: 'MVP',
      modalidade: 'MENSAL',
      status: 'CANCELADA',
      canceladaEm: AGORA,
      atualizadoEm: AGORA,
    })
    acessoNoTeste = acessoDeTeste('GRATIS')
    try {
      const { default: Pagina } = await import('../(app)/conta/page')
      const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
      const topo = html.slice(0, html.indexOf('>CONTA<'))
      expect(topo).toContain('<span aria-hidden="true">—</span>CANCELADA')
      expect(topo).not.toContain('✓')
      expect(topo).not.toContain('SEM PLANO')
      // E o bloco continua coerente com o selo.
      const bloco = blocoDeAssinatura(html)
      expect(bloco).toContain('CANCELADA')
      expect(bloco.toLowerCase()).toContain('acesso inativo')
      expect(bloco).not.toContain('Sem plano ativo')
    } finally {
      acessoNoTeste = acessoDeTeste('MVP')
      await banco.db.delete(assinaturas).where(eq(assinaturas.usuarioId, USUARIO_DEMO))
    }
  })

  it('trocar senha e trocar e-mail ficam à vista: só nome e avatar continuam dobrados', async () => {
    const { default: Pagina } = await import('../(app)/conta/page')
    const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
    // Equilibrar a altura das colunas é razão que só existe acima de 900px, e
    // a dobra valeria em toda largura: em 390px, onde está a maioria de um
    // PWA, duas ações sensíveis da conta perderiam visibilidade sem ganho
    // nenhum de layout. O `<details>` de nome/avatar veio assim da Task 4.
    const blocoConta = html.slice(html.indexOf('>CONTA<'), html.indexOf('>ASSINATURA<'))
    expect(blocoConta.match(/<details/g) ?? []).toHaveLength(1)
    const dobrado = blocoConta.slice(
      blocoConta.indexOf('<details'),
      blocoConta.indexOf('</details>'),
    )
    expect(dobrado).toContain('name="fotoUrl"')
    expect(dobrado).not.toContain('name="novaSenha"')
    expect(dobrado).not.toContain('name="novoEmail"')
  })

  it('a contagem regressiva fala no singular, e para de contar no dia e depois dele', async () => {
    const { proximaCobrancaEmTexto } = await import('../(app)/conta/blocos')
    const fuso = 'America/Sao_Paulo'
    const agora = new Date('2026-09-12T12:00:00Z')
    expect(proximaCobrancaEmTexto(new Date('2026-09-13T12:00:00Z'), agora, fuso)).toBe(
      'Próxima cobrança em 1 dia · 13/09/2026',
    )
    // "em 0 dias" seria ruído sobre um dado que o provedor ainda não
    // atualizou: chegada a data, sobra a data escrita, que continua verdadeira.
    expect(proximaCobrancaEmTexto(agora, agora, fuso)).toBe('Próxima cobrança · 12/09/2026')
    expect(proximaCobrancaEmTexto(new Date('2026-09-01T12:00:00Z'), agora, fuso)).toBe(
      'Próxima cobrança · 01/09/2026',
    )
    expect(proximaCobrancaEmTexto(null, agora, fuso)).toBeNull()
  })

  it('estatísticas e como funciona saem do corpo e viram o rodapé da tela', async () => {
    const { default: Pagina } = await import('../(app)/conta/page')
    const html = renderToStaticMarkup(await Pagina({ searchParams: Promise.resolve({}) }))
    // A lista "Explorar" era um bloco de navegação no meio da conta. Os dois
    // links continuam alcançáveis — depois do último bloco, onde um rodapé
    // fica — porque não são conta.
    expect(html).not.toContain('>Explorar<')
    const rodape = html.slice(html.indexOf('>DISPOSITIVOS<'))
    expect(rodape).toContain('href="/estatisticas"')
    expect(rodape).toContain('href="/como-funciona"')
  })

  // ACHADO 4 DA REVISÃO FINAL: `?erro=` passava a frase inteira pela URL, sem
  // dicionário — ao contrário de `?aviso=`. `/conta?erro=<frase do atacante>`
  // caía direto num `role="alert"` desta tela, num app que leva a uma casa de
  // apostas. Agora só um código do dicionário vira texto; qualquer outra
  // coisa na URL não aparece.
  it('?erro= passa por dicionário: código conhecido vira texto em português, texto forjado não aparece', async () => {
    const { default: Pagina } = await import('../(app)/conta/page')
    const comCodigoConhecido = renderToStaticMarkup(
      await Pagina({ searchParams: Promise.resolve({ erro: 'senha-atual-incorreta' }) }),
    )
    expect(comCodigoConhecido).toContain('Senha atual incorreta.')

    const fraseDoAtacante = 'sua conta foi comprometida, ligue agora para 0800-000-000'
    const comTextoForjado = renderToStaticMarkup(
      await Pagina({ searchParams: Promise.resolve({ erro: fraseDoAtacante }) }),
    )
    expect(comTextoForjado).not.toContain(fraseDoAtacante)
  })
})
