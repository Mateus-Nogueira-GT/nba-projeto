import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import {
  dispositivos,
  pushInscricoes,
  sessoes,
  tentativasLogin,
  tentativasOperacaoConta,
  usuarios,
} from '../../dominio/db/schema'
import { limparRegistrosVencidos } from '../limpeza'

let banco: Awaited<ReturnType<typeof bancoDeTeste>>

const AGORA = new Date('2026-09-23T12:00:00Z')
const DIA = 24 * 3600_000
const HORA = 3600_000

/** Copiado de `entrega/push/__tests__/fanout.test.ts` — conta + dispositivo mínimos. */
async function prepararConta(sufixo: string) {
  const [usuario] = await banco.db
    .insert(usuarios)
    .values({ email: `limpeza-${sufixo}@example.com`, senhaHash: 'hash' })
    .returning()
  const [dispositivo] = await banco.db
    .insert(dispositivos)
    .values({ usuarioId: usuario!.id, fingerprint: `dispositivo-${sufixo}`, tipo: 'DESKTOP' })
    .returning()
  return { usuario: usuario!, dispositivo: dispositivo! }
}

beforeEach(async () => {
  banco = await bancoDeTeste()
})

afterEach(async () => {
  await banco.fechar()
})

describe('limparRegistrosVencidos (W2-6)', () => {
  it('apaga só o vencido de cada tabela — sessão ativa antiga nunca sai', async () => {
    const contaEncerradas = await prepararConta('encerradas')
    const contaAtiva = await prepararConta('ativa')

    // Sessões — quatro casos, um por perna da regra:
    //  - encerrada há 31 dias: sai pela perna "encerrada há tempo suficiente".
    //  - encerrada há 1 dia: fica (encerrada recente demais).
    //  - NUNCA encerrada (encerrada_em nulo) mas expirada há 31 dias: sai
    //    pela perna "OU expirada" — ninguém fez logout, mas o token já não
    //    vale há mais de 30 dias. Sem esta linha, apagar essa perna do OR em
    //    limpeza.ts não quebraria teste nenhum (achado do code review).
    //  - ATIVA de verdade: não encerrada e expira_em no FUTURO, mesmo criada
    //    há 90 dias — nunca sai, é sessão em uso.
    await banco.db.insert(sessoes).values([
      {
        usuarioId: contaEncerradas.usuario.id,
        dispositivoId: contaEncerradas.dispositivo.id,
        tokenHash: 'token-encerrada-antiga',
        criadaEm: new Date(AGORA.getTime() - 40 * DIA),
        expiraEm: new Date(AGORA.getTime() - 39 * DIA),
        encerradaEm: new Date(AGORA.getTime() - 31 * DIA),
        motivoEncerramento: 'LOGOUT',
      },
      {
        usuarioId: contaEncerradas.usuario.id,
        dispositivoId: contaEncerradas.dispositivo.id,
        tokenHash: 'token-encerrada-recente',
        criadaEm: new Date(AGORA.getTime() - 2 * DIA),
        expiraEm: new Date(AGORA.getTime() - 1 * DIA),
        encerradaEm: new Date(AGORA.getTime() - 1 * DIA),
        motivoEncerramento: 'LOGOUT',
      },
      {
        usuarioId: contaEncerradas.usuario.id,
        dispositivoId: contaEncerradas.dispositivo.id,
        tokenHash: 'token-expirada-nunca-encerrada',
        criadaEm: new Date(AGORA.getTime() - 45 * DIA),
        expiraEm: new Date(AGORA.getTime() - 31 * DIA),
        encerradaEm: null,
      },
      {
        usuarioId: contaAtiva.usuario.id,
        dispositivoId: contaAtiva.dispositivo.id,
        tokenHash: 'token-ativa-antiga',
        criadaEm: new Date(AGORA.getTime() - 90 * DIA),
        expiraEm: new Date(AGORA.getTime() + 1 * DIA),
        encerradaEm: null,
      },
    ])

    // Tentativas de login: há 8 dias (sai) e há 1 hora (fica).
    await banco.db.insert(tentativasLogin).values([
      { identificador: 'a@example.com', ip: '1.1.1.1', sucesso: false, tentadoEm: new Date(AGORA.getTime() - 8 * DIA) },
      { identificador: 'a@example.com', ip: '1.1.1.1', sucesso: false, tentadoEm: new Date(AGORA.getTime() - HORA) },
    ])

    // Tentativas de operação: há 8 dias (sai) e há 1 hora (fica).
    await banco.db.insert(tentativasOperacaoConta).values([
      {
        operacao: 'REDEFINIR_SENHA',
        identificadorHash: 'hash-antigo',
        ip: '1.1.1.1',
        sucesso: false,
        tentadoEm: new Date(AGORA.getTime() - 8 * DIA),
      },
      {
        operacao: 'REDEFINIR_SENHA',
        identificadorHash: 'hash-recente',
        ip: '1.1.1.1',
        sucesso: false,
        tentadoEm: new Date(AGORA.getTime() - HORA),
      },
    ])

    // Inscrições de push: invalidada há 31 dias (sai), invalidada há 1 dia
    // (fica), e ATIVA (nunca invalidada) mesmo criada há muito tempo — não sai.
    await banco.db.insert(pushInscricoes).values([
      {
        usuarioId: contaEncerradas.usuario.id,
        dispositivoId: contaEncerradas.dispositivo.id,
        endpoint: 'https://push.example/invalidada-antiga',
        chaveP256dh: 'p256dh',
        chaveAuth: 'auth',
        invalidadaEm: new Date(AGORA.getTime() - 31 * DIA),
        motivoInvalidacao: 'EXPIROU',
      },
      {
        usuarioId: contaEncerradas.usuario.id,
        dispositivoId: contaEncerradas.dispositivo.id,
        endpoint: 'https://push.example/invalidada-recente',
        chaveP256dh: 'p256dh',
        chaveAuth: 'auth',
        invalidadaEm: new Date(AGORA.getTime() - 1 * DIA),
        motivoInvalidacao: 'EXPIROU',
      },
      {
        usuarioId: contaAtiva.usuario.id,
        dispositivoId: contaAtiva.dispositivo.id,
        endpoint: 'https://push.example/ativa-antiga',
        chaveP256dh: 'p256dh',
        chaveAuth: 'auth',
        criadoEm: new Date(AGORA.getTime() - 90 * DIA),
        invalidadaEm: null,
      },
    ])

    const resultado = await limparRegistrosVencidos(banco.db, AGORA)

    expect(resultado).toEqual({
      sessoes: 2,
      tentativasLogin: 1,
      tentativasOperacao: 1,
      inscricoesInvalidadas: 1,
    })

    const sessoesRestantes = await banco.db.select().from(sessoes)
    expect(sessoesRestantes.map((s) => s.tokenHash).sort()).toEqual(
      ['token-ativa-antiga', 'token-encerrada-recente'].sort(),
    )

    const loginsRestantes = await banco.db.select().from(tentativasLogin)
    expect(loginsRestantes).toHaveLength(1)

    const operacoesRestantes = await banco.db.select().from(tentativasOperacaoConta)
    expect(operacoesRestantes).toHaveLength(1)

    const inscricoesRestantes = await banco.db.select().from(pushInscricoes)
    expect(inscricoesRestantes.map((i) => i.endpoint).sort()).toEqual(
      [
        'https://push.example/ativa-antiga',
        'https://push.example/invalidada-recente',
      ].sort(),
    )
  })
})
