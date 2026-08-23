import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  autenticar: vi.fn(),
  encerrarSessaoPorToken: vi.fn(),
  gravarCookieDeSessao: vi.fn(),
  limparCookieDeSessao: vi.fn(),
  tokenDaSessaoAtual: vi.fn(),
  ipDaRequisicao: vi.fn(),
  redirect: vi.fn(),
  db: { nome: 'db-de-teste' },
}))

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
}))
vi.mock('@/modules/dominio/db/cliente', () => ({
  getDb: () => mocks.db,
}))
vi.mock('@/modules/plataforma/auth/sessao', () => ({
  autenticar: mocks.autenticar,
  encerrarSessaoPorToken: mocks.encerrarSessaoPorToken,
}))
vi.mock('@/modules/plataforma/auth/cookies', () => ({
  gravarCookieDeSessao: mocks.gravarCookieDeSessao,
  limparCookieDeSessao: mocks.limparCookieDeSessao,
  tokenDaSessaoAtual: mocks.tokenDaSessaoAtual,
}))
vi.mock('@/modules/plataforma/auth/requisicao', () => ({
  destinoInternoSeguro: (valor: string) =>
    valor === '/' || valor === '/admin/usuarios' ? valor : '/',
  ipDaRequisicao: mocks.ipDaRequisicao,
}))

import { entrar, sair } from '../acoes'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.ipDaRequisicao.mockResolvedValue('203.0.113.42')
  mocks.autenticar.mockResolvedValue({
    ok: true,
    token: 'token-secreto',
    sessaoId: 'sessao-1',
    dispositivoId: 'dispositivo-1',
    encerrouSessoes: 0,
  })
  mocks.redirect.mockImplementation((destino: string) => {
    throw new Error(`REDIRECT:${destino}`)
  })
})

describe('Server Actions de autenticação', () => {
  it('leva o IP confiável do App Router ao serviço e recusa redirect externo', async () => {
    const formulario = new FormData()
    formulario.set('email', 'assinante@exemplo.com')
    formulario.set('senha', 'senha')
    formulario.set('dispositivo', 'fingerprint')
    formulario.set('ua', 'Mozilla/5.0')
    formulario.set('destino', 'https://malicioso.example/roubar')

    await expect(entrar(null, formulario)).rejects.toThrow('REDIRECT:/')

    expect(mocks.autenticar).toHaveBeenCalledWith(
      mocks.db,
      { email: 'assinante@exemplo.com', senha: 'senha' },
      expect.objectContaining({ ip: '203.0.113.42' }),
      expect.any(Date),
      expect.any(Object),
    )
    expect(mocks.redirect).toHaveBeenCalledWith('/')
  })

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
