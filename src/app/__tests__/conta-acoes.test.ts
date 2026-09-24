import { and, eq, isNull } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { AVATARES_PRONTOS } from '@/features/conta/avatares'
import { bancoDeTeste } from '../../modules/dominio/__tests__/ajuda-banco'
import { dispositivos, eventosConta, sessoes, usuarios } from '../../modules/dominio/db/schema'
import { adicionarUsuario } from '../../modules/plataforma/admin/usuarios'
import { conferirSenha, gerarHash } from '../../modules/plataforma/auth/senha'

/**
 * AS AÇÕES DE IDENTIDADE DA CONTA (Task 4) — `atualizarNome`, `escolherAvatar`.
 *
 * Achado da revisão: nada chamava as ações diretamente — o teste de tela só
 * afirma a MARCAÇÃO do formulário, nunca o submit. A checagem "só o
 * catálogo" de `escolherAvatar` (caminho livre viraria injeção de imagem de
 * fora) e o `trim().min(2)` de `atualizarNome` ficavam sem nenhuma prova de
 * que continuam bloqueando o que dizem bloquear.
 *
 * `redirect()`, em Next, NUNCA retorna — lança um erro especial cujo
 * `digest` carrega o destino (`NEXT_REDIRECT;tipo;url;status;`). Por isso o
 * teste usa o `redirect` de VERDADE (não mocado) e afirma pelo `.rejects`,
 * como a fumaça de Resultados (`features/resultados`) faz para a data inválida.
 */

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let usuarioId: string
// `dispositivoId` no formato de `Sessao` de verdade (`auth/sessao.ts`) — é o
// que `encerrarDispositivo` compara para saber se o alvo é "este aparelho".
// `null` por padrão: nenhum teste é "este aparelho" a menos que diga o
// contrário. `sessaoId` começa como um id que não existe em `sessoes`: até
// o describe de trocarSenha/trocarEmail apontar um de verdade, nenhuma linha
// bate com ele — mesmo "nenhuma exceção" que um `undefined` daria.
let sessao: {
  usuarioId: string
  email: string
  dispositivoId: string | null
  sessaoId: string
} | null = null
let cookieFoiLimpo = false

vi.mock('../../modules/dominio/db/cliente', () => ({
  getDb: () => banco.db,
  fecharDb: async () => {},
}))
vi.mock('../../modules/plataforma/auth/cookies', () => ({
  sessaoAtual: async () => sessao,
  limparCookieDeSessao: async () => {
    cookieFoiLimpo = true
  },
}))

beforeAll(async () => {
  banco = await bancoDeTeste()
}, 60_000)

afterAll(async () => banco.fechar())

// Um usuário NOVO por teste: as ações mudam `nome`/`foto_url`, e um teste
// não pode herdar o que o anterior gravou.
beforeEach(async () => {
  const [u] = await banco.db
    .insert(usuarios)
    .values({
      email: `conta-acoes-${crypto.randomUUID()}@teste.com`,
      senhaHash: 'x',
      nome: 'Nome Original',
    })
    .returning({ id: usuarios.id })
  usuarioId = u!.id
  sessao = {
    usuarioId,
    email: 'conta-acoes@teste.com',
    dispositivoId: null,
    sessaoId: '00000000-0000-4000-8000-000000000000',
  }
  cookieFoiLimpo = false
})

async function usuarioAtual() {
  const [linha] = await banco.db.select().from(usuarios).where(eq(usuarios.id, usuarioId))
  return linha!
}

describe('escolherAvatar — só um caminho do catálogo vira foto_url', () => {
  it('avatar do catálogo persiste e redireciona com o aviso de sucesso', async () => {
    const { escolherAvatar } = await import('@/features/conta/acoes')
    const formulario = new FormData()
    formulario.set('fotoUrl', AVATARES_PRONTOS[2]!)

    await expect(escolherAvatar(formulario)).rejects.toMatchObject({
      digest: expect.stringContaining('/conta?aviso=avatar-ok'),
    })
    expect((await usuarioAtual()).fotoUrl).toBe(AVATARES_PRONTOS[2])
  })

  it('caminho fora do catálogo é recusado: não grava e redireciona para erro', async () => {
    const { escolherAvatar } = await import('@/features/conta/acoes')
    const formulario = new FormData()
    formulario.set('fotoUrl', 'https://evil.example.com/avatar.png')

    await expect(escolherAvatar(formulario)).rejects.toMatchObject({
      digest: expect.stringContaining('/conta?erro='),
    })
    expect((await usuarioAtual()).fotoUrl).toBeNull()
  })

  it('campo vazio LIMPA um avatar já escolhido', async () => {
    const { escolherAvatar } = await import('@/features/conta/acoes')

    const escolhe = new FormData()
    escolhe.set('fotoUrl', AVATARES_PRONTOS[0]!)
    await expect(escolherAvatar(escolhe)).rejects.toMatchObject({ digest: expect.any(String) })
    expect((await usuarioAtual()).fotoUrl).toBe(AVATARES_PRONTOS[0])

    const limpa = new FormData()
    limpa.set('fotoUrl', '')
    await expect(escolherAvatar(limpa)).rejects.toMatchObject({
      digest: expect.stringContaining('/conta?aviso=avatar-ok'),
    })
    expect((await usuarioAtual()).fotoUrl).toBeNull()
  })
})

describe('atualizarNome — tamanho depois de trim, sempre em português', () => {
  it('nome válido (com espaço nas pontas) persiste JÁ com trim, e redireciona com aviso', async () => {
    const { atualizarNome } = await import('@/features/conta/acoes')
    const formulario = new FormData()
    formulario.set('nome', '  Nova Pessoa  ')

    await expect(atualizarNome(formulario)).rejects.toMatchObject({
      digest: expect.stringContaining('/conta?aviso=nome-ok'),
    })
    expect((await usuarioAtual()).nome).toBe('Nova Pessoa')
  })

  it.each([
    ['um único caractere', 'A'],
    ['só espaços (some no trim)', '   '],
    ['ausente do formulário', null],
  ])('nome %s é recusado com a MESMA mensagem em português, e não grava', async (_caso, valor) => {
    const { atualizarNome } = await import('@/features/conta/acoes')
    const antes = await usuarioAtual()
    const formulario = new FormData()
    if (valor !== null) formulario.set('nome', valor)

    // A mensagem é idêntica nos três casos: um campo ausente (FormData sem a
    // chave, ou um tipo que não é string) cai no mesmo "Nome muito curto."
    // das outras duas — não no inglês genérico que o Zod dá para tipo errado.
    await expect(atualizarNome(formulario)).rejects.toMatchObject({
      digest: expect.stringContaining('/conta?erro=nome-curto'),
    })
    expect((await usuarioAtual()).nome).toBe(antes.nome)
  })
})

/**
 * AS AÇÕES DE SEGURANÇA DA CONTA (Task 5) — `trocarSenha`, `trocarEmail`,
 * `encerrarDispositivo`.
 *
 * `trocarSenha`/`trocarEmail` exigem a senha atual: os testes provam isso
 * gravando um hash de verdade (`gerarHash`) para o usuário e conferindo, pelo
 * hash resultante, que só a senha certa destrava a troca.
 */
describe('trocarSenha / trocarEmail — exigem a senha atual (Task 5)', () => {
  const SENHA_ATUAL = 'senha-atual-123'
  // Duas sessões de verdade por teste: a ATUAL, para onde `sessao.sessaoId`
  // aponta (como `validarSessao` preencheria a partir de um cookie de
  // verdade), e uma OUTRA — é o par que prova a decisão do achado 2 da
  // revisão final: trocar senha/e-mail no perfil derruba a OUTRA, nunca a
  // que fez a troca.
  let sessaoAtualId: string
  let outraSessaoId: string

  beforeEach(async () => {
    await banco.db
      .update(usuarios)
      .set({ senhaHash: await gerarHash(SENHA_ATUAL) })
      .where(eq(usuarios.id, usuarioId))
    const [atual, outra] = await banco.db
      .insert(sessoes)
      .values([
        {
          usuarioId,
          tokenHash: `hash-sessao-atual-${crypto.randomUUID()}`,
          expiraEm: new Date(Date.now() + 3600_000),
        },
        {
          usuarioId,
          tokenHash: `hash-outra-sessao-${crypto.randomUUID()}`,
          expiraEm: new Date(Date.now() + 3600_000),
        },
      ])
      .returning({ id: sessoes.id })
    sessaoAtualId = atual!.id
    outraSessaoId = outra!.id
    sessao!.sessaoId = sessaoAtualId
  })

  it('senha atual correta e nova válida trocam o hash e redirecionam com aviso', async () => {
    const { trocarSenha } = await import('@/features/conta/acoes')
    const formulario = new FormData()
    formulario.set('senhaAtual', SENHA_ATUAL)
    formulario.set('novaSenha', 'nova-senha-456')

    await expect(trocarSenha(formulario)).rejects.toMatchObject({
      digest: expect.stringContaining('/conta?aviso=senha-ok'),
    })
    const depois = await usuarioAtual()
    expect(await conferirSenha('nova-senha-456', depois.senhaHash)).toBe(true)
    expect(await conferirSenha(SENHA_ATUAL, depois.senhaHash)).toBe(false)
  })

  // ACHADO 2 DA REVISÃO FINAL — a decisão: manter a sessão ATUAL viva (o
  // comportamento que a pessoa espera: quem troca a senha não quer ser
  // deslogado no MESMO gesto) e derrubar só as outras, com a troca gravada
  // na trilha para o admin.
  it('troca de senha mantém a sessão ATUAL viva, encerra as OUTRAS e grava a trilha', async () => {
    const { trocarSenha } = await import('@/features/conta/acoes')
    const formulario = new FormData()
    formulario.set('senhaAtual', SENHA_ATUAL)
    formulario.set('novaSenha', 'nova-senha-456')

    await expect(trocarSenha(formulario)).rejects.toMatchObject({
      digest: expect.stringContaining('/conta?aviso=senha-ok'),
    })

    const [atual] = await banco.db.select().from(sessoes).where(eq(sessoes.id, sessaoAtualId))
    expect(atual?.encerradaEm).toBeNull()
    const [outra] = await banco.db.select().from(sessoes).where(eq(sessoes.id, outraSessaoId))
    expect(outra?.encerradaEm).not.toBeNull()

    const trilha = await banco.db
      .select()
      .from(eventosConta)
      .where(and(eq(eventosConta.usuarioId, usuarioId), eq(eventosConta.tipo, 'SESSAO_ENCERRADA')))
    expect(trilha).toHaveLength(1)
    expect(trilha[0]?.detalhe).toBe('troca de senha pelo perfil')
  })

  it('senha atual errada recusa a troca de senha, e não altera o hash', async () => {
    const antes = await usuarioAtual()
    const { trocarSenha } = await import('@/features/conta/acoes')
    const formulario = new FormData()
    formulario.set('senhaAtual', 'senha-errada')
    formulario.set('novaSenha', 'nova-senha-456')

    await expect(trocarSenha(formulario)).rejects.toMatchObject({
      digest: expect.stringContaining('/conta?erro=senha-atual-incorreta'),
    })
    expect((await usuarioAtual()).senhaHash).toBe(antes.senhaHash)
  })

  it('nova senha fora da política (mesma regra do cadastro) é recusada, e não altera nada', async () => {
    const antes = await usuarioAtual()
    const { trocarSenha } = await import('@/features/conta/acoes')
    const formulario = new FormData()
    formulario.set('senhaAtual', SENHA_ATUAL)
    formulario.set('novaSenha', 'letrassemnumero') // 15 letras, mas sem dígito

    await expect(trocarSenha(formulario)).rejects.toMatchObject({
      digest: expect.stringContaining('/conta?erro='),
    })
    expect((await usuarioAtual()).senhaHash).toBe(antes.senhaHash)
  })

  it('e-mail novo e disponível troca na hora, protegido pela senha atual', async () => {
    const { trocarEmail } = await import('@/features/conta/acoes')
    const formulario = new FormData()
    formulario.set('senhaAtual', SENHA_ATUAL)
    formulario.set('novoEmail', 'novo-email-teste@exemplo.com')

    await expect(trocarEmail(formulario)).rejects.toMatchObject({
      digest: expect.stringContaining('/conta?aviso=email-ok'),
    })
    expect((await usuarioAtual()).email).toBe('novo-email-teste@exemplo.com')
  })

  // Mesmo cuidado de trocarSenha, pelo mesmo motivo: quem troca o
  // identificador de login é quem mais precisa que as OUTRAS sessões caiam.
  it('troca de e-mail mantém a sessão ATUAL viva, encerra as OUTRAS e grava a trilha', async () => {
    const { trocarEmail } = await import('@/features/conta/acoes')
    const formulario = new FormData()
    formulario.set('senhaAtual', SENHA_ATUAL)
    formulario.set('novoEmail', 'email-com-outras-sessoes@exemplo.com')

    await expect(trocarEmail(formulario)).rejects.toMatchObject({
      digest: expect.stringContaining('/conta?aviso=email-ok'),
    })

    const [atual] = await banco.db.select().from(sessoes).where(eq(sessoes.id, sessaoAtualId))
    expect(atual?.encerradaEm).toBeNull()
    const [outra] = await banco.db.select().from(sessoes).where(eq(sessoes.id, outraSessaoId))
    expect(outra?.encerradaEm).not.toBeNull()

    const trilha = await banco.db
      .select()
      .from(eventosConta)
      .where(and(eq(eventosConta.usuarioId, usuarioId), eq(eventosConta.tipo, 'SESSAO_ENCERRADA')))
    expect(trilha).toHaveLength(1)
    expect(trilha[0]?.detalhe).toBe('troca de e-mail pelo perfil')
  })

  it('novoEmail ausente do formulário é recusado em português (nunca a mensagem genérica do Zod)', async () => {
    const antes = await usuarioAtual()
    const { trocarEmail } = await import('@/features/conta/acoes')
    const formulario = new FormData()
    formulario.set('senhaAtual', SENHA_ATUAL)
    // Sem `.set('novoEmail', ...)`: simula um POST forjado direto à server
    // action, sem passar pelo <input required> do formulário real.

    await expect(trocarEmail(formulario)).rejects.toMatchObject({
      digest: expect.stringContaining('/conta?erro=email-invalido'),
    })
    expect((await usuarioAtual()).email).toBe(antes.email)
  })

  it('e-mail já usado por outra conta é recusado, e não altera nada', async () => {
    const emailOcupado = `ocupado-${crypto.randomUUID()}@teste.com`
    await banco.db.insert(usuarios).values({ email: emailOcupado, senhaHash: 'x' })
    const antes = await usuarioAtual()

    const { trocarEmail } = await import('@/features/conta/acoes')
    const formulario = new FormData()
    formulario.set('senhaAtual', SENHA_ATUAL)
    formulario.set('novoEmail', emailOcupado)

    await expect(trocarEmail(formulario)).rejects.toMatchObject({
      digest: expect.stringContaining('/conta?erro='),
    })
    expect((await usuarioAtual()).email).toBe(antes.email)
  })

  it('senha atual errada recusa a troca de e-mail, e não altera nada', async () => {
    const antes = await usuarioAtual()
    const { trocarEmail } = await import('@/features/conta/acoes')
    const formulario = new FormData()
    formulario.set('senhaAtual', 'senha-errada')
    formulario.set('novoEmail', 'outro-endereco@exemplo.com')

    await expect(trocarEmail(formulario)).rejects.toMatchObject({
      digest: expect.stringContaining('/conta?erro=senha-atual-incorreta'),
    })
    expect((await usuarioAtual()).email).toBe(antes.email)
  })
})

/**
 * `encerrarDispositivo` recebe o `dispositivoId` de um formulário — por isso
 * o escopo por `usuarioId` é testado como propriedade de segurança, não
 * detalhe de implementação: colar o id do dispositivo de outra pessoa não
 * pode encerrar a sessão dela.
 *
 * O segundo grupo prova a correção 2 do brief: encerrar o APARELHO EM USO não
 * pode mandar para `/conta` (a sessão já morreu ali) — tem que ir para
 * `/entrar` com um aviso, e o cookie precisa ser limpo.
 */
describe('encerrarDispositivo — escopo por usuário, e o aparelho em uso vai para /entrar (Task 5)', () => {
  let dispositivoId: string
  let dispositivoDeOutro: string

  beforeEach(async () => {
    const [d] = await banco.db
      .insert(dispositivos)
      .values({ usuarioId, fingerprint: 'fp-teste', tipo: 'DESKTOP' })
      .returning({ id: dispositivos.id })
    dispositivoId = d!.id
    // Sem `afterEach` limpando `sessoes` neste arquivo (ao contrário de
    // `plataforma.test.ts`), o hash precisa ser único por teste — a coluna
    // tem UNIQUE de propósito (ver `sessoes_token_hash_unique`).
    await banco.db.insert(sessoes).values({
      usuarioId,
      dispositivoId,
      tokenHash: `hash-nao-usado-${crypto.randomUUID()}`,
      expiraEm: new Date(Date.now() + 3600_000),
    })

    const outro = await adicionarUsuario(banco.db, {
      email: `outro-dono-${crypto.randomUUID()}@teste.com`,
      senha: 'senha-do-outro-123',
    })
    const [od] = await banco.db
      .insert(dispositivos)
      .values({ usuarioId: outro.id, fingerprint: 'fp-outro', tipo: 'MOBILE' })
      .returning({ id: dispositivos.id })
    dispositivoDeOutro = od!.id
    await banco.db.insert(sessoes).values({
      usuarioId: outro.id,
      dispositivoId: dispositivoDeOutro,
      tokenHash: `hash-do-outro-usuario-${crypto.randomUUID()}`,
      expiraEm: new Date(Date.now() + 3600_000),
    })
  })

  it('encerra a sessão do próprio dispositivo e redireciona para /conta com aviso', async () => {
    const { encerrarDispositivo } = await import('@/features/conta/acoes')
    const formulario = new FormData()
    formulario.set('dispositivoId', dispositivoId)

    await expect(encerrarDispositivo(formulario)).rejects.toMatchObject({
      digest: expect.stringContaining('/conta?aviso=sessao-ok'),
    })
    const abertas = await banco.db
      .select()
      .from(sessoes)
      .where(and(eq(sessoes.dispositivoId, dispositivoId), isNull(sessoes.encerradaEm)))
    expect(abertas).toHaveLength(0)
  })

  it('id de dispositivo de outra pessoa não encerra a sessão dela, e a ação não finge sucesso — escopo por usuário travado', async () => {
    const { encerrarDispositivo } = await import('@/features/conta/acoes')
    const formulario = new FormData()
    formulario.set('dispositivoId', dispositivoDeOutro)

    // A mesma mensagem de "id mal formado": zero sessões encerradas não pode
    // dizer "Sessão encerrada." (Minor 5 do fix round 1), e a ação não
    // distingue "não era seu" de "já tinha sido encerrado" na mensagem — não
    // é isso que está sob teste aqui, mas a sessão do OUTRO usuário continua
    // viva, que é a garantia de segurança que importa.
    await expect(encerrarDispositivo(formulario)).rejects.toMatchObject({
      digest: expect.stringContaining('/conta?erro=dispositivo-invalido'),
    })
    const aindaAberta = await banco.db
      .select()
      .from(sessoes)
      .where(and(eq(sessoes.dispositivoId, dispositivoDeOutro), isNull(sessoes.encerradaEm)))
    expect(aindaAberta).toHaveLength(1)
  })

  it('dispositivoId mal formado é recusado sem tocar no banco', async () => {
    const { encerrarDispositivo } = await import('@/features/conta/acoes')
    const formulario = new FormData()
    formulario.set('dispositivoId', 'nao-e-um-uuid')

    await expect(encerrarDispositivo(formulario)).rejects.toMatchObject({
      digest: expect.stringContaining('/conta?erro=dispositivo-invalido'),
    })
    const abertas = await banco.db
      .select()
      .from(sessoes)
      .where(and(eq(sessoes.dispositivoId, dispositivoId), isNull(sessoes.encerradaEm)))
    expect(abertas).toHaveLength(1)
  })

  it('encerrar o APARELHO EM USO manda para /entrar com aviso, e limpa o cookie', async () => {
    // `sessao.dispositivoId` é o que `encerrarDispositivo` compara — mesmo
    // campo que `validarSessao` preenche de verdade a partir do cookie.
    sessao!.dispositivoId = dispositivoId

    const { encerrarDispositivo } = await import('@/features/conta/acoes')
    const formulario = new FormData()
    formulario.set('dispositivoId', dispositivoId)

    await expect(encerrarDispositivo(formulario)).rejects.toMatchObject({
      digest: expect.stringContaining('/entrar?aviso=sessao-encerrada'),
    })
    expect(cookieFoiLimpo).toBe(true)
    const abertas = await banco.db
      .select()
      .from(sessoes)
      .where(and(eq(sessoes.dispositivoId, dispositivoId), isNull(sessoes.encerradaEm)))
    expect(abertas).toHaveLength(0)
  })
})
