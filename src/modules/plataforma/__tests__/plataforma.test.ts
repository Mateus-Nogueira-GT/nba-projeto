import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { and, eq, isNull } from 'drizzle-orm'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import {
  assinaturas,
  dispositivos,
  eventosConta,
  eventosPagamento,
  sessoes,
  tentativasLogin,
  usuarios,
} from '../../dominio/db/schema'

import { conferirSenha, gerarHash } from '../auth/senha'
import { excedeuTentativas, registrarTentativa } from '../auth/rate-limit'
import {
  autenticar,
  detectarUsoSimultaneo,
  MAX_DISPOSITIVOS,
  validarSessao,
  type DadosAcesso,
} from '../auth/sessao'
import { PagamentoFake } from '../assinatura/fake'
import { PagamentoMercadoPago, configDoAmbiente } from '../assinatura/mercadopago'
import { processarNotificacao } from '../assinatura/webhook'
import {
  adicionarUsuario,
  bloquearUsuario,
  desbloquearUsuario,
  dispositivosDoUsuario,
  excluirUsuario,
  listarUsuarios,
} from '../admin/usuarios'

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let usuarioId: string

const SENHA = 'senha-de-teste-123'
const T0 = new Date('2026-08-19T20:00:00.000Z')

function acesso(fingerprint: string, ip: string, tipo: 'MOBILE' | 'DESKTOP' = 'MOBILE'): DadosAcesso {
  return { fingerprint, tipo, userAgent: 'teste', ip }
}

beforeAll(async () => {
  banco = await bancoDeTeste()
})
afterAll(async () => {
  await banco.fechar()
})

beforeEach(async () => {
  await banco.db.delete(eventosPagamento)
  await banco.db.delete(eventosConta)
  await banco.db.delete(tentativasLogin)
  await banco.db.delete(assinaturas)
  await banco.db.delete(sessoes)
  await banco.db.delete(dispositivos)
  await banco.db.delete(usuarios)

  const { id } = await adicionarUsuario(banco.db, {
    email: 'assinante@exemplo.com',
    senha: SENHA,
    nome: 'Assinante',
  })
  usuarioId = id
})

// ===========================================================================
// 1 · SENHA E RATE LIMIT
// ===========================================================================

describe('hash de senha', () => {
  it('não guarda a senha, e o hash muda a cada gravação (sal aleatório)', async () => {
    const a = await gerarHash(SENHA)
    const b = await gerarHash(SENHA)

    expect(a).not.toContain(SENHA)
    expect(a).not.toBe(b)
    expect(a.startsWith('scrypt$16384$8$1$')).toBe(true)
  })

  it('confere a senha certa e recusa a errada', async () => {
    const hash = await gerarHash(SENHA)

    expect(await conferirSenha(SENHA, hash)).toBe(true)
    expect(await conferirSenha('outra', hash)).toBe(false)
  })

  it('hash corrompido recusa em vez de estourar', async () => {
    expect(await conferirSenha(SENHA, 'lixo')).toBe(false)
    expect(await conferirSenha(SENHA, 'bcrypt$a$b$c$d$e')).toBe(false)
  })
})

describe('rate limit do login', () => {
  it('bloqueia após 5 falhas na janela', async () => {
    for (let i = 0; i < 4; i++) {
      await registrarTentativa(banco.db, {
        identificador: 'alvo@exemplo.com',
        ip: '1.1.1.1',
        sucesso: false,
        agora: T0,
      })
    }
    expect(await excedeuTentativas(banco.db, 'alvo@exemplo.com', T0)).toBe(false)

    await registrarTentativa(banco.db, {
      identificador: 'alvo@exemplo.com',
      ip: '1.1.1.1',
      sucesso: false,
      agora: T0,
    })
    expect(await excedeuTentativas(banco.db, 'alvo@exemplo.com', T0)).toBe(true)
  })

  it('sucesso não conta para o bloqueio', async () => {
    for (let i = 0; i < 10; i++) {
      await registrarTentativa(banco.db, {
        identificador: 'ok@exemplo.com',
        ip: '1.1.1.1',
        sucesso: true,
        agora: T0,
      })
    }
    expect(await excedeuTentativas(banco.db, 'ok@exemplo.com', T0)).toBe(false)
  })

  it('a janela expira: falhas velhas não bloqueiam para sempre', async () => {
    for (let i = 0; i < 6; i++) {
      await registrarTentativa(banco.db, {
        identificador: 'antigo@exemplo.com',
        ip: '1.1.1.1',
        sucesso: false,
        agora: new Date(T0.getTime() - 60 * 60_000),
      })
    }
    expect(await excedeuTentativas(banco.db, 'antigo@exemplo.com', T0)).toBe(false)
  })

  it('login real fica barrado depois do excesso', async () => {
    for (let i = 0; i < 5; i++) {
      await autenticar(
        banco.db,
        { email: 'assinante@exemplo.com', senha: 'errada' },
        acesso('d1', '1.1.1.1'),
        T0,
        { duracaoMs: 3600_000 },
      )
    }

    const r = await autenticar(
      banco.db,
      { email: 'assinante@exemplo.com', senha: SENHA },
      acesso('d1', '1.1.1.1'),
      T0,
      { duracaoMs: 3600_000 },
    )
    expect(r).toEqual({ ok: false, motivo: 'excesso-de-tentativas' })
  })
})

// ===========================================================================
// 2 · LIMITE DE 2 DISPOSITIVOS
// ===========================================================================

describe('limite de 2 dispositivos', () => {
  async function entrar(fingerprint: string, ip: string, agora: Date) {
    const r = await autenticar(
      banco.db,
      { email: 'assinante@exemplo.com', senha: SENHA },
      acesso(fingerprint, ip),
      agora,
      { duracaoMs: 30 * 24 * 3600_000 },
    )
    if (!r.ok) throw new Error(`login falhou: ${r.motivo}`)
    return r
  }

  it('login em 3 dispositivos → a sessão MAIS ANTIGA morre, com motivo gravado', async () => {
    const primeiro = await entrar('celular', '1.1.1.1', T0)
    const segundo = await entrar('notebook', '1.1.1.1', new Date(T0.getTime() + 60_000))
    const terceiro = await entrar('tablet', '1.1.1.1', new Date(T0.getTime() + 120_000))

    expect(terceiro.encerrouSessoes).toBe(1)

    const todas = await banco.db.select().from(sessoes).where(eq(sessoes.usuarioId, usuarioId))
    const encerradas = todas.filter((s) => s.encerradaEm !== null)

    expect(encerradas).toHaveLength(1)
    expect(encerradas[0]?.id).toBe(primeiro.sessaoId) // a mais antiga
    expect(encerradas[0]?.motivoEncerramento).toContain('limite de 2 dispositivos')

    // As duas mais recentes seguem vivas.
    const vivas = todas.filter((s) => s.encerradaEm === null).map((s) => s.id)
    expect(vivas.sort()).toEqual([segundo.sessaoId, terceiro.sessaoId].sort())
  })

  it('a sessão encerrada perde acesso na requisição seguinte', async () => {
    const primeiro = await entrar('celular', '1.1.1.1', T0)
    await entrar('notebook', '1.1.1.1', new Date(T0.getTime() + 60_000))
    await entrar('tablet', '1.1.1.1', new Date(T0.getTime() + 120_000))

    const r = await validarSessao(banco.db, primeiro.token, new Date(T0.getTime() + 180_000))
    expect(r).toEqual({ ok: false, motivo: 'encerrada' })
  })

  it('reentrar no MESMO dispositivo não conta como novo', async () => {
    await entrar('celular', '1.1.1.1', T0)
    const r = await entrar('celular', '1.1.1.1', new Date(T0.getTime() + 60_000))

    expect(r.encerrouSessoes).toBe(0)
    const disp = await banco.db.select().from(dispositivos).where(eq(dispositivos.usuarioId, usuarioId))
    expect(disp).toHaveLength(1)
  })

  it('o evento de encerramento fica na trilha para o admin', async () => {
    await entrar('celular', '1.1.1.1', T0)
    await entrar('notebook', '1.1.1.1', new Date(T0.getTime() + 60_000))
    await entrar('tablet', '1.1.1.1', new Date(T0.getTime() + 120_000))

    const trilha = await banco.db
      .select()
      .from(eventosConta)
      .where(and(eq(eventosConta.usuarioId, usuarioId), eq(eventosConta.tipo, 'SESSAO_ENCERRADA')))

    expect(trilha).toHaveLength(1)
    expect(trilha[0]?.detalhe).toContain('limite de 2')
  })

  it('o limite é 2, e vem de uma constante nomeada', () => {
    expect(MAX_DISPOSITIVOS).toBe(2)
  })
})

describe('detecção de uso simultâneo', () => {
  it('mesmo IP em 2 dispositivos NÃO é uso simultâneo suspeito', async () => {
    await autenticar(banco.db, { email: 'assinante@exemplo.com', senha: SENHA }, acesso('a', '1.1.1.1'), T0, { duracaoMs: 3600_000 })
    await autenticar(banco.db, { email: 'assinante@exemplo.com', senha: SENHA }, acesso('b', '1.1.1.1'), T0, { duracaoMs: 3600_000 })

    expect(await detectarUsoSimultaneo(banco.db, usuarioId, T0)).toBe(false)
  })

  it('IPs diferentes na mesma janela geram registro para o admin', async () => {
    await autenticar(banco.db, { email: 'assinante@exemplo.com', senha: SENHA }, acesso('a', '1.1.1.1'), T0, { duracaoMs: 3600_000 })
    await autenticar(banco.db, { email: 'assinante@exemplo.com', senha: SENHA }, acesso('b', '200.200.200.200'), T0, { duracaoMs: 3600_000 })

    const registros = await banco.db
      .select()
      .from(eventosConta)
      .where(and(eq(eventosConta.usuarioId, usuarioId), eq(eventosConta.tipo, 'USO_SIMULTANEO')))

    expect(registros.length).toBeGreaterThan(0)
    expect(registros[0]?.detalhe).toContain('IPs distintos')
  })
})

// ===========================================================================
// 3 · WEBHOOK IDEMPOTENTE
// ===========================================================================

describe('webhook de pagamento', () => {
  const porta = new PagamentoFake()

  function notificacao(eventoId: string, tipo = 'PAGAMENTO_APROVADO') {
    return JSON.stringify({
      eventoExternoId: eventoId,
      tipo,
      referenciaExterna: usuarioId,
      assinaturaExternaId: `pre-${eventoId}`,
      plano: 'mensal',
      proximaCobranca: '2026-09-19T00:00:00.000Z',
      bruto: { id: eventoId },
    })
  }

  it('o MESMO evento entregue 2× libera UMA vez só', async () => {
    const entrada = { corpoBruto: notificacao('evt-1'), cabecalhos: {}, agora: T0 }

    const primeira = await processarNotificacao(banco.db, porta, entrada)
    const segunda = await processarNotificacao(banco.db, porta, entrada)

    expect(primeira).toMatchObject({ aceito: true, duplicado: false })
    expect(segunda).toEqual({ aceito: true, duplicado: true })

    const eventos = await banco.db.select().from(eventosPagamento)
    expect(eventos).toHaveLength(1)

    const assinatura = await banco.db.select().from(assinaturas).where(eq(assinaturas.usuarioId, usuarioId))
    expect(assinatura).toHaveLength(1)
    expect(assinatura[0]?.status).toBe('ATIVA')
  })

  it('pagamento aprovado libera usuário que estava bloqueado', async () => {
    await bloquearUsuario(banco.db, usuarioId, 'inadimplência', T0)

    const r = await processarNotificacao(banco.db, porta, {
      corpoBruto: notificacao('evt-2'),
      cabecalhos: {},
      agora: T0,
    })

    expect(r).toMatchObject({ aceito: true, duplicado: false, liberou: true })
    const [u] = await banco.db.select().from(usuarios).where(eq(usuarios.id, usuarioId))
    expect(u?.status).toBe('ATIVO')
  })

  it('assinatura inválida é recusada antes de qualquer efeito', async () => {
    const r = await processarNotificacao(banco.db, new PagamentoFake(false), {
      corpoBruto: notificacao('evt-3'),
      cabecalhos: {},
      agora: T0,
    })

    expect(r).toEqual({ aceito: false, motivo: 'assinatura-invalida' })
    expect(await banco.db.select().from(eventosPagamento)).toHaveLength(0)
  })

  it('corpo ilegível não derruba o endpoint', async () => {
    const r = await processarNotificacao(banco.db, porta, {
      corpoBruto: '{ isso não é json',
      cabecalhos: {},
      agora: T0,
    })
    expect(r).toEqual({ aceito: false, motivo: 'ilegivel' })
  })

  it('a validação de assinatura do Mercado Pago recusa HMAC errado', () => {
    const mp = new PagamentoMercadoPago({
      accessToken: 'x',
      segredoWebhook: 'segredo-de-teste',
      sandbox: true,
    })

    const corpo = JSON.stringify({ data: { id: '123' } })
    expect(mp.verificarAssinatura(corpo, { 'x-signature': 'ts=1,v1=errado' })).toBe(false)
    expect(mp.verificarAssinatura(corpo, {})).toBe(false)
  })

  it('sem variáveis de ambiente, a configuração não existe — nada de valor embutido', () => {
    const original = { ...process.env }
    delete process.env.MERCADOPAGO_ACCESS_TOKEN
    delete process.env.MERCADOPAGO_WEBHOOK_SECRET

    expect(configDoAmbiente()).toBeNull()

    process.env = original
  })
})

// ===========================================================================
// 4 · PAINEL ADMIN
// ===========================================================================

describe('painel administrativo', () => {
  it('usuário bloqueado no painel perde acesso na requisição SEGUINTE', async () => {
    const login = await autenticar(
      banco.db,
      { email: 'assinante@exemplo.com', senha: SENHA },
      acesso('celular', '1.1.1.1'),
      T0,
      { duracaoMs: 30 * 24 * 3600_000 },
    )
    if (!login.ok) throw new Error('login falhou')

    // Antes do bloqueio: acesso normal.
    expect((await validarSessao(banco.db, login.token, T0)).ok).toBe(true)

    await bloquearUsuario(banco.db, usuarioId, 'teste', new Date(T0.getTime() + 1000))

    // Na requisição seguinte, sem esperar o token expirar (faltavam 30 dias).
    const depois = await validarSessao(banco.db, login.token, new Date(T0.getTime() + 2000))
    expect(depois.ok).toBe(false)
  })

  it('bloquear encerra as sessões abertas e registra o motivo', async () => {
    await autenticar(banco.db, { email: 'assinante@exemplo.com', senha: SENHA }, acesso('celular', '1.1.1.1'), T0, { duracaoMs: 3600_000 })

    await bloquearUsuario(banco.db, usuarioId, 'compartilhamento', new Date(T0.getTime() + 1000))

    const abertas = await banco.db
      .select()
      .from(sessoes)
      .where(and(eq(sessoes.usuarioId, usuarioId), isNull(sessoes.encerradaEm)))
    expect(abertas).toHaveLength(0)

    const trilha = await banco.db
      .select()
      .from(eventosConta)
      .where(and(eq(eventosConta.usuarioId, usuarioId), eq(eventosConta.tipo, 'BLOQUEIO')))
    expect(trilha[0]?.detalhe).toBe('compartilhamento')
  })

  it('usuário bloqueado não consegue logar de novo', async () => {
    await bloquearUsuario(banco.db, usuarioId, 'teste', T0)

    const r = await autenticar(
      banco.db,
      { email: 'assinante@exemplo.com', senha: SENHA },
      acesso('celular', '1.1.1.1'),
      T0,
      { duracaoMs: 3600_000 },
    )
    expect(r).toEqual({ ok: false, motivo: 'bloqueado' })
  })

  it('desbloquear devolve o acesso', async () => {
    await bloquearUsuario(banco.db, usuarioId, 'teste', T0)
    await desbloquearUsuario(banco.db, usuarioId, new Date(T0.getTime() + 1000))

    const r = await autenticar(
      banco.db,
      { email: 'assinante@exemplo.com', senha: SENHA },
      acesso('celular', '1.1.1.1'),
      new Date(T0.getTime() + 2000),
      { duracaoMs: 3600_000 },
    )
    expect(r.ok).toBe(true)
  })

  it('lista, busca e filtra', async () => {
    await adicionarUsuario(banco.db, { email: 'outro@exemplo.com', senha: SENHA, nome: 'Outro' })
    await bloquearUsuario(banco.db, usuarioId, 'teste', T0)

    expect(await listarUsuarios(banco.db)).toHaveLength(2)
    expect(await listarUsuarios(banco.db, { busca: 'outro' })).toHaveLength(1)
    expect(await listarUsuarios(banco.db, { status: 'BLOQUEADO' })).toHaveLength(1)
    expect((await listarUsuarios(banco.db, { status: 'ATIVO' }))[0]?.email).toBe('outro@exemplo.com')
  })

  it('mostra os dispositivos de cada usuário', async () => {
    await autenticar(banco.db, { email: 'assinante@exemplo.com', senha: SENHA }, acesso('celular', '1.1.1.1'), T0, { duracaoMs: 3600_000 })
    await autenticar(banco.db, { email: 'assinante@exemplo.com', senha: SENHA }, acesso('notebook', '2.2.2.2', 'DESKTOP'), T0, { duracaoMs: 3600_000 })

    const lista = await dispositivosDoUsuario(banco.db, usuarioId)

    expect(lista).toHaveLength(2)
    expect(lista.every((d) => d.temSessaoAtiva)).toBe(true)
    expect(lista.map((d) => d.tipo).sort()).toEqual(['DESKTOP', 'MOBILE'])
  })

  it('excluir remove o usuário e o que depende dele', async () => {
    await autenticar(banco.db, { email: 'assinante@exemplo.com', senha: SENHA }, acesso('celular', '1.1.1.1'), T0, { duracaoMs: 3600_000 })

    await excluirUsuario(banco.db, usuarioId)

    expect(await banco.db.select().from(usuarios).where(eq(usuarios.id, usuarioId))).toHaveLength(0)
    expect(await banco.db.select().from(sessoes).where(eq(sessoes.usuarioId, usuarioId))).toHaveLength(0)
  })
})

// ===========================================================================
// SEGREDOS
// ===========================================================================

describe('credenciais fora do código', () => {
  it('nenhuma credencial de Mercado Pago aparece em arquivo versionado', () => {
    // Varre TODOS os arquivos rastreados pelo git, não só os que eu lembrei.
    // `git grep` faz isso em UM processo e já ignora binários (-I) — a versão
    // anterior abria um shell por arquivo e estourava o timeout do teste.
    const suspeitos = [
      'APP_USR-[A-Za-z0-9-]{10,}', // formato de access token do Mercado Pago
      'TEST-[0-9]{10,}', // formato de credencial de sandbox
    ]

    // O próprio arquivo de teste cita os formatos; excluí-lo evita autoacusação.
    const exceto = ":(exclude)src/modules/plataforma/__tests__/plataforma.test.ts"

    const infratores = suspeitos.flatMap((padrao) => {
      try {
        return execSync(`git grep -I -l -E ${JSON.stringify(padrao)} -- . ${JSON.stringify(exceto)}`, {
          encoding: 'utf8',
        })
          .trim()
          .split('\n')
          .filter(Boolean)
      } catch {
        return [] // git grep sai com código 1 quando não acha nada — isso é sucesso aqui.
      }
    })

    expect(infratores).toEqual([])
  })

  it('o adapter lê as chaves do ambiente, nunca de literal no código', () => {
    const fonte = execSync('cat src/modules/plataforma/assinatura/mercadopago.ts', {
      encoding: 'utf8',
    })

    expect(fonte).toContain('process.env.MERCADOPAGO_ACCESS_TOKEN')
    expect(fonte).toContain('process.env.MERCADOPAGO_WEBHOOK_SECRET')
    expect(/accessToken:\s*['"][A-Za-z0-9-]{8,}['"]/.test(fonte)).toBe(false)
  })

  it('.env está fora do versionamento', () => {
    const gitignore = execSync('cat .gitignore', { encoding: 'utf8' })
    expect(gitignore).toMatch(/^\.env$/m)
    expect(gitignore).toMatch(/^\.env\.\*$/m)
  })
})

// ===========================================================================
// GUARDA DO PAINEL
// ===========================================================================

describe('toda rota do painel exige ADMIN', () => {
  const paginas = [
    'src/app/(admin)/admin/usuarios/page.tsx',
    'src/app/(admin)/admin/mapeamento/page.tsx',
    'src/app/(admin)/admin/galeria/page.tsx',
  ]

  const acoes = [
    'src/app/(admin)/admin/usuarios/acoes.ts',
    'src/app/(admin)/admin/mapeamento/acoes.ts',
  ]

  // Procura a CHAMADA, não o identificador: a linha de import sozinha
  // satisfazia a versão anterior deste teste, e uma mutação que trocava a
  // guarda por um objeto falso passava batida.
  const CHAMADA = /await (exigirAdmin|negarSeNaoForAdmin)\(\)/

  it('toda página do painel confere o papel', () => {
    for (const caminho of paginas) {
      expect(readFileSync(caminho, 'utf8'), `${caminho} não confere ADMIN`).toMatch(CHAMADA)
    }
  })

  it('toda server action do painel confere o papel', () => {
    // No App Router a server action é um endpoint POST chamável direto:
    // proteger a página NÃO protege a ação. /admin/mapeamento escrevia em
    // mapa_jogadores sem checagem nenhuma — a Lista Secreta inteira depende
    // dessa tabela.
    for (const caminho of acoes) {
      expect(readFileSync(caminho, 'utf8'), `${caminho} não confere ADMIN`).toMatch(CHAMADA)
    }
  })

  it('a confirmação de vínculo registra QUEM confirmou, não a string "admin"', () => {
    const fonte = readFileSync('src/app/(admin)/admin/mapeamento/acoes.ts', 'utf8')
    expect(fonte).not.toMatch(/confirmadoPor:\s*'admin'/)
    expect(fonte).toContain('sessao.email')
  })
})
