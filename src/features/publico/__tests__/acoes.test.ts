import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * SERVER ACTIONS PÚBLICAS DO V2 (entrar, sair, cadastrar, concluirNovaSenha)
 * — herdeira de `src/app/(publico)/entrar/__tests__/acoes.test.ts`.
 *
 * Só mocks: o que se trava aqui é a COLA entre a ação e o módulo do back —
 * qual função é chamada, com o quê, e em que ordem. O comportamento de
 * verdade (scrypt, limite, cookie, token) fica com `fumaca.test.tsx`, sobre
 * PGlite. As três invariantes antigas ficaram (IP confiável ao serviço,
 * redirect externo recusado, revogar antes de apagar o cookie); as novas
 * marcam "Front v2 (Tarefa 8)".
 */

const mocks = vi.hoisted(() => ({
  autenticar: vi.fn(),
  abrirSessao: vi.fn(),
  encerrarSessaoPorToken: vi.fn(),
  gravarCookieDeSessao: vi.fn(),
  limparCookieDeSessao: vi.fn(),
  tokenDaSessaoAtual: vi.fn(),
  ipDaRequisicao: vi.fn(),
  cadastrarUsuario: vi.fn(),
  concluirRedefinicao: vi.fn(),
  associarVisitanteAoUsuario: vi.fn(),
  redirect: vi.fn(),
  db: { nome: 'db-de-teste' },
  origem: null as string | null,
  cookieVisitante: undefined as string | undefined,
}))

vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (nome: string) =>
      nome === 'nip_afiliado_visitante' && mocks.cookieVisitante
        ? { name: nome, value: mocks.cookieVisitante }
        : undefined,
  }),
  headers: async () => new Headers(mocks.origem ? { origin: mocks.origem } : {}),
}))
vi.mock('@/modules/dominio/db/cliente', () => ({ getDb: () => mocks.db }))
vi.mock('@/modules/plataforma/auth/sessao', () => ({
  autenticar: mocks.autenticar,
  abrirSessao: mocks.abrirSessao,
  encerrarSessaoPorToken: mocks.encerrarSessaoPorToken,
}))
vi.mock('@/modules/plataforma/auth/cookies', () => ({
  gravarCookieDeSessao: mocks.gravarCookieDeSessao,
  limparCookieDeSessao: mocks.limparCookieDeSessao,
  tokenDaSessaoAtual: mocks.tokenDaSessaoAtual,
}))
// A allowlist é a DE VERDADE (`destinoInternoSeguro` original): a antiga
// suíte a substituía por uma lista de dois itens, e um destino fora dela
// passaria despercebido. Só o IP é simulado.
vi.mock('@/modules/plataforma/auth/requisicao', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/plataforma/auth/requisicao')>()),
  ipDaRequisicao: mocks.ipDaRequisicao,
}))
vi.mock('@/modules/plataforma/assinatura/cadastro', () => ({
  cadastrarUsuario: mocks.cadastrarUsuario,
}))
vi.mock('@/modules/plataforma/auth/redefinicao', () => ({
  concluirRedefinicao: mocks.concluirRedefinicao,
}))
vi.mock('@/modules/plataforma/afiliados/servico', () => ({
  associarVisitanteAoUsuario: mocks.associarVisitanteAoUsuario,
}))

import { cadastrar, concluirNovaSenha, entrar, sair } from '../acoes'

const LOGIN_OK = {
  ok: true,
  token: 'token-secreto',
  usuarioId: '00000000-0000-4000-8000-000000000001',
  sessaoId: 'sessao-1',
  dispositivoId: 'dispositivo-1',
  encerrouSessoes: 0,
}

function formularioDeLogin(destino?: string) {
  const f = new FormData()
  f.set('email', 'assinante@exemplo.com')
  f.set('senha', 'senha')
  f.set('dispositivo', 'fingerprint')
  f.set('ua', 'Mozilla/5.0')
  if (destino !== undefined) f.set('destino', destino)
  return f
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('APP_PUBLIC_URL', 'https://app.example.com')
  mocks.origem = 'https://app.example.com'
  mocks.cookieVisitante = undefined
  mocks.ipDaRequisicao.mockResolvedValue('203.0.113.42')
  mocks.autenticar.mockResolvedValue(LOGIN_OK)
  mocks.abrirSessao.mockResolvedValue(LOGIN_OK)
  mocks.cadastrarUsuario.mockResolvedValue({ ok: true, usuarioId: LOGIN_OK.usuarioId })
  mocks.concluirRedefinicao.mockResolvedValue({ ok: true })
  mocks.redirect.mockImplementation((destino: string) => {
    throw new Error(`REDIRECT:${destino}`)
  })
})

describe('entrar', () => {
  it('leva o IP confiável do App Router ao serviço e recusa redirect externo', async () => {
    await expect(entrar(null, formularioDeLogin('https://malicioso.example/roubar'))).rejects.toThrow(
      'REDIRECT:/abrir',
    )
    expect(mocks.autenticar).toHaveBeenCalledWith(
      mocks.db,
      { email: 'assinante@exemplo.com', senha: 'senha' },
      expect.objectContaining({ ip: '203.0.113.42', fingerprint: 'fingerprint', tipo: 'DESKTOP' }),
      expect.any(Date),
      expect.any(Object),
    )
    // Externo cai no PADRÃO da porta da frente (/abrir), nunca no destino pedido.
    expect(mocks.redirect).toHaveBeenCalledWith('/abrir')
  })

  it('sem destino vai para /abrir; destino da allowlist é respeitado', async () => {
    await expect(entrar(null, formularioDeLogin())).rejects.toThrow('REDIRECT:/abrir')
    await expect(entrar(null, formularioDeLogin('/conta'))).rejects.toThrow('REDIRECT:/conta')
  })

  it('grava o cookie ANTES de redirecionar e associa o visitante de afiliado, se houver', async () => {
    mocks.cookieVisitante = 'visitante-de-teste-0123456789'
    await expect(entrar(null, formularioDeLogin())).rejects.toThrow('REDIRECT:/abrir')
    expect(mocks.gravarCookieDeSessao).toHaveBeenCalledWith('token-secreto', expect.any(Date))
    expect(mocks.associarVisitanteAoUsuario).toHaveBeenCalledWith(
      mocks.db,
      'visitante-de-teste-0123456789',
      LOGIN_OK.usuarioId,
      expect.any(Date),
      'LOGIN',
    )
  })

  it('cada motivo de recusa tem a sua frase — e credenciais erradas nunca dizem qual campo errou', async () => {
    mocks.autenticar.mockResolvedValue({ ok: false, motivo: 'credenciais' })
    expect(await entrar(null, formularioDeLogin())).toBe('E-mail ou senha incorretos.')
    mocks.autenticar.mockResolvedValue({ ok: false, motivo: 'excesso-de-tentativas' })
    expect(await entrar(null, formularioDeLogin())).toBe('Muitas tentativas. Aguarde alguns minutos.')
    mocks.autenticar.mockResolvedValue({ ok: false, motivo: 'bloqueado' })
    expect(await entrar(null, formularioDeLogin())).toBe('Conta bloqueada. Fale com o suporte.')
    expect(mocks.gravarCookieDeSessao).not.toHaveBeenCalled()
    expect(mocks.redirect).not.toHaveBeenCalled()
  })
})

describe('sair', () => {
  it('revoga a sessão persistida antes de apagar o cookie', async () => {
    const ordem: string[] = []
    mocks.tokenDaSessaoAtual.mockResolvedValue('token-atual')
    mocks.encerrarSessaoPorToken.mockImplementation(async () => {
      ordem.push('banco')
      return true
    })
    mocks.limparCookieDeSessao.mockImplementation(async () => {
      ordem.push('cookie')
    })

    await expect(sair()).rejects.toThrow('REDIRECT:/entrar')

    expect(mocks.encerrarSessaoPorToken).toHaveBeenCalledWith(
      mocks.db,
      'token-atual',
      'logout solicitado pelo usuário',
      expect.any(Date),
    )
    expect(ordem).toEqual(['banco', 'cookie'])
  })

  it('não apaga o cookie se a revogação persistida falhar', async () => {
    mocks.tokenDaSessaoAtual.mockResolvedValue('token-atual')
    mocks.encerrarSessaoPorToken.mockRejectedValue(new Error('banco indisponível'))

    await expect(sair()).rejects.toThrow('banco indisponível')
    expect(mocks.limparCookieDeSessao).not.toHaveBeenCalled()
    expect(mocks.redirect).not.toHaveBeenCalled()
  })
})

describe('cadastrar — Front v2 (Tarefa 8)', () => {
  function formularioDeCadastro() {
    const f = new FormData()
    f.set('nome', 'Pessoa Nova')
    f.set('email', 'nova@exemplo.com')
    f.set('senha', 'senha-forte-123')
    f.set('dispositivo', 'fingerprint')
    f.set('ua', 'Mozilla/5.0 (iPhone)')
    return f
  }

  it('abre a sessão da conta recém-criada com abrirSessao — sem um segundo scrypt via autenticar', async () => {
    // Auditoria 23/09: a conta acabou de ser criada COM esta senha; conferi-la
    // de novo é um scrypt a mais por cadastro, no pico do lançamento.
    await expect(cadastrar(null, formularioDeCadastro())).rejects.toThrow('REDIRECT:/assinar')
    expect(mocks.cadastrarUsuario).toHaveBeenCalledWith(
      mocks.db,
      expect.objectContaining({ cadastroPublicoHabilitado: true }),
      { email: 'nova@exemplo.com', senha: 'senha-forte-123', nome: 'Pessoa Nova' },
      { ip: '203.0.113.42', agora: expect.any(Date) },
    )
    expect(mocks.autenticar).not.toHaveBeenCalled()
    expect(mocks.abrirSessao).toHaveBeenCalledWith(
      mocks.db,
      LOGIN_OK.usuarioId,
      expect.objectContaining({ fingerprint: 'fingerprint', tipo: 'MOBILE', ip: '203.0.113.42' }),
      expect.any(Date),
      expect.any(Object),
    )
    expect(mocks.gravarCookieDeSessao).toHaveBeenCalledWith('token-secreto', expect.any(Date))
  })

  it('recusa origem ausente ou de fora antes de tocar o banco', async () => {
    mocks.origem = null
    expect(await cadastrar(null, formularioDeCadastro())).toBe('Origem da solicitação inválida.')
    mocks.origem = 'https://evil.example'
    expect(await cadastrar(null, formularioDeCadastro())).toBe('Origem da solicitação inválida.')
    expect(mocks.cadastrarUsuario).not.toHaveBeenCalled()
    expect(mocks.abrirSessao).not.toHaveBeenCalled()
  })

  it('cada recusa do cadastro tem a sua frase, e nenhuma abre sessão', async () => {
    mocks.cadastrarUsuario.mockResolvedValue({ ok: false, motivo: 'indisponivel' })
    expect(await cadastrar(null, formularioDeCadastro())).toBe('Cadastro temporariamente indisponível.')
    mocks.cadastrarUsuario.mockResolvedValue({ ok: false, motivo: 'limite' })
    expect(await cadastrar(null, formularioDeCadastro())).toBe('Muitas tentativas. Aguarde antes de repetir.')
    // "E-mail em uso" não é dito com essas palavras: entregaria a base.
    mocks.cadastrarUsuario.mockResolvedValue({ ok: false, motivo: 'email-em-uso' })
    expect(await cadastrar(null, formularioDeCadastro())).toBe('Não foi possível criar a conta com esses dados.')
    expect(mocks.abrirSessao).not.toHaveBeenCalled()
    expect(mocks.gravarCookieDeSessao).not.toHaveBeenCalled()
  })

  it('associa o visitante de afiliado com origem CADASTRO', async () => {
    mocks.cookieVisitante = 'visitante-de-teste-0123456789'
    await expect(cadastrar(null, formularioDeCadastro())).rejects.toThrow('REDIRECT:/assinar')
    expect(mocks.associarVisitanteAoUsuario).toHaveBeenCalledWith(
      mocks.db,
      'visitante-de-teste-0123456789',
      LOGIN_OK.usuarioId,
      expect.any(Date),
      'CADASTRO',
    )
  })
})

describe('concluirNovaSenha — Front v2 (Tarefa 8)', () => {
  function formularioDeSenha(token: string) {
    const f = new FormData()
    f.set('token', token)
    f.set('novaSenha', 'nova-senha-forte-12')
    return f
  }

  it('sucesso volta para /entrar com o aviso', async () => {
    await expect(concluirNovaSenha(formularioDeSenha('abc'))).rejects.toThrow(
      'REDIRECT:/entrar?aviso=senha-redefinida',
    )
    expect(mocks.concluirRedefinicao).toHaveBeenCalledWith(mocks.db, {
      token: 'abc',
      novaSenha: 'nova-senha-forte-12',
      agora: expect.any(Date),
    })
  })

  it('?erro= leva o CÓDIGO do conjunto fechado, nunca frase; motivo desconhecido vira "token"', async () => {
    for (const motivo of ['token', 'expirada', 'usada', 'senha']) {
      mocks.concluirRedefinicao.mockResolvedValue({ ok: false, motivo })
      await expect(concluirNovaSenha(formularioDeSenha('abc'))).rejects.toThrow(
        `REDIRECT:/redefinir/abc?erro=${motivo}`,
      )
    }
    mocks.concluirRedefinicao.mockResolvedValue({ ok: false, motivo: 'sua conta foi comprometida' })
    await expect(concluirNovaSenha(formularioDeSenha('abc'))).rejects.toThrow(
      'REDIRECT:/redefinir/abc?erro=token',
    )
  })

  it('o token volta para o PATH codificado — um token com caracteres de URL não vira outra rota', async () => {
    mocks.concluirRedefinicao.mockResolvedValue({ ok: false, motivo: 'token' })
    await expect(concluirNovaSenha(formularioDeSenha('a/b?c'))).rejects.toThrow(
      'REDIRECT:/redefinir/a%2Fb%3Fc?erro=token',
    )
  })
})
