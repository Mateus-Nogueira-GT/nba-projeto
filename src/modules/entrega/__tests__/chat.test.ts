import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { chatMensagens, usuarios } from '../../dominio/db/schema'
import { LLMFake } from '../../ingestao/llm'
import { semearDemo } from '../../ingestao/demo/semear'
import { carregarRuleset } from '../../motor/ruleset/carregar'
import { calendarioDoRuleset, temporadaDe } from '../../dominio/temporada'
import { intervaloDoDia } from '../../dominio/rodada'
import { lerFeed } from '../lista-secreta'
import { LIMITE_PERGUNTA, LIMITE_POR_MINUTO, mensagensUsadasHoje, responder } from '../chat'

const ruleset = carregarRuleset(readFileSync('config/ruleset.v1.yaml', 'utf8'))
const AGORA = new Date('2026-08-24T18:00:00.000Z')
const HOJE = '2026-08-24'
// América/São_Paulo é UTC-3 o ano inteiro (sem horário de verão desde 2019) —
// os testes de fronteira de dia dependem desse deslocamento fixo.
const FUSO = ruleset.rodada.fuso
// Os freios (o assunto deste arquivo) não têm nada a ver com nível de plano:
// `responder` não conhece nível, só o número de `cotaDiaria` que o chamador
// já resolveu (a rota resolve via `configuracaoChat().cotaDiariaPorNivel`).
// Por isso toda chamada abaixo fixa `cotaDiaria: 20` — um valor qualquer,
// alto o bastante para não interferir nos freios que CADA teste testa.
const TEMPORADA = temporadaDe(intervaloDoDia(HOJE, FUSO).inicio, calendarioDoRuleset(ruleset))
const COTA_TESTE = 20

let banco: Awaited<ReturnType<typeof bancoDeTeste>>
let usuarioId: string

beforeAll(async () => {
  banco = await bancoDeTeste()
  await semearDemo(banco.db, ruleset, AGORA)
  const [u] = await banco.db
    .insert(usuarios)
    .values({ email: 'chat@teste.com', senhaHash: 'x' })
    .returning()
  usuarioId = u!.id
}, 180_000)
afterAll(async () => banco.fechar())

describe('mensagensUsadasHoje — fronteira de dia no fuso local', () => {
  it('mensagem perto da meia-noite UTC, mas ainda no MESMO dia local, conta para o dia local', async () => {
    // Meia-noite UTC é 21h em Brasília. Uma mensagem gravada às 22h locais de
    // 24/08 é 2026-08-25T01:00:00Z em UTC — já é "dia 25" em UTC, mas ainda é
    // "dia 24" no relógio de Brasília (a meia-noite local só chega às
    // 2026-08-25T03:00:00Z). Um cálculo que use meia-noite UTC em vez de
    // `intervaloDoDia` erra a janela em até 3h e devolveria 0 aqui — o
    // assinante ganharia cota nova três horas antes da hora.
    await banco.db.delete(chatMensagens)
    await banco.db.insert(chatMensagens).values({
      usuarioId,
      papel: 'USUARIO',
      texto: 'pergunta tardia',
      criadoEm: new Date('2026-08-25T01:00:00.000Z'),
    })

    expect(await mensagensUsadasHoje(banco.db, usuarioId, HOJE, FUSO)).toBe(1)
    // E o dia seguinte (25/08) ainda NÃO inclui essa mensagem — ela é de 24/08.
    expect(await mensagensUsadasHoje(banco.db, usuarioId, '2026-08-25', FUSO)).toBe(0)
  })
})

describe('chat do assinante', () => {
  it('responde e grava as duas mensagens', async () => {
    await banco.db.delete(chatMensagens)
    const r = await responder(banco.db, new LLMFake(), {
      usuarioId,
      texto: 'Por que o Curry entrou hoje?',
      dataReferencia: HOJE,
      fuso: FUSO,
      temporada: TEMPORADA,
      cotaDiaria: COTA_TESTE,
      agora: AGORA,
    })
    expect(r.ok).toBe(true)

    const linhas = await banco.db.select().from(chatMensagens)
    expect(linhas).toHaveLength(2)
    expect(linhas.map((l) => l.papel).sort()).toEqual(['ASSISTENTE', 'USUARIO'])
  })

  it('a cota é o COUNT do dia — esgotada, recusa sem chamar a LLM', async () => {
    await banco.db.delete(chatMensagens)
    for (let i = 0; i < 20; i++) {
      await banco.db.insert(chatMensagens).values({
        usuarioId,
        papel: 'USUARIO',
        texto: `pergunta ${i}`,
        criadoEm: AGORA,
      })
    }
    expect(await mensagensUsadasHoje(banco.db, usuarioId, HOJE, FUSO)).toBe(20)

    const porta = new LLMFake()
    const r = await responder(banco.db, porta, {
      usuarioId,
      texto: 'mais uma',
      dataReferencia: HOJE,
      fuso: FUSO,
      temporada: TEMPORADA,
      cotaDiaria: COTA_TESTE,
      agora: AGORA,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toBe('cota-esgotada')
    expect(porta.chamadas).toHaveLength(0)
  })

  it('cota sob concorrência: N requisições simultâneas não passam da cota', async () => {
    // Sem serializar por usuário, duas (ou cinco) requisições concorrentes
    // fazem o mesmo SELECT COUNT antes de qualquer uma inserir, e todas
    // passam pelo `>= cotaDiaria` — furando a cota. A reserva de vaga em
    // transação com FOR UPDATE tem que impedir isso.
    await banco.db.delete(chatMensagens)
    const cotaDiaria = COTA_TESTE
    const jaUsadas = cotaDiaria - 3
    for (let i = 0; i < jaUsadas; i++) {
      await banco.db.insert(chatMensagens).values({
        usuarioId,
        papel: 'USUARIO',
        texto: `pergunta ${i}`,
        // Fora da janela de 60s: o que está sob teste aqui é a COTA DO DIA
        // sob concorrência. Semeadas no mesmo instante, elas esbarrariam
        // primeiro no limite por minuto e o teste passaria pelo motivo errado.
        criadoEm: new Date(AGORA.getTime() - 5 * 60_000),
      })
    }

    const N = 6
    const resultados = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        responder(banco.db, new LLMFake(), {
          usuarioId,
          texto: `concorrente ${i}`,
          dataReferencia: HOJE,
          fuso: FUSO,
          temporada: TEMPORADA,
          cotaDiaria,
          agora: AGORA,
        }),
      ),
    )

    const aprovadas = resultados.filter((r) => r.ok).length
    expect(aprovadas).toBe(3)

    const usadasFinal = await mensagensUsadasHoje(banco.db, usuarioId, HOJE, FUSO)
    expect(usadasFinal).toBe(cotaDiaria)
  }, 30_000)

  it('falha da LLM NÃO desconta da cota', async () => {
    // Cobrar a cota por um erro nosso é punir o assinante pelo nosso defeito.
    await banco.db.delete(chatMensagens)
    const r = await responder(banco.db, new LLMFake({ falhar: true }), {
      usuarioId,
      texto: 'pergunta',
      dataReferencia: HOJE,
      fuso: FUSO,
      temporada: TEMPORADA,
      cotaDiaria: COTA_TESTE,
      agora: AGORA,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toBe('indisponivel')
    expect(await mensagensUsadasHoje(banco.db, usuarioId, HOJE, FUSO)).toBe(0)
  })

  it('validador reprova a resposta ("probabilidade") — a cota fica intacta', async () => {
    // A reserva conta a pergunta ANTES da LLM responder; se o texto voltar
    // reprovado, a reserva tem que ser desfeita, não só a mensagem do
    // assistente deixar de ser gravada.
    await banco.db.delete(chatMensagens)
    const r = await responder(
      banco.db,
      new LLMFake({ texto: 'A probabilidade de acerto aqui é alta.' }),
      {
        usuarioId,
        texto: 'pergunta',
        dataReferencia: HOJE,
        fuso: FUSO,
        temporada: TEMPORADA,
        cotaDiaria: COTA_TESTE,
        agora: AGORA,
      },
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toBe('indisponivel')
    expect(await mensagensUsadasHoje(banco.db, usuarioId, HOJE, FUSO)).toBe(0)

    const linhas = await banco.db.select().from(chatMensagens)
    expect(linhas).toHaveLength(0)
  })

  it('pergunta vazia não gasta cota nem chamada', async () => {
    await banco.db.delete(chatMensagens)
    const porta = new LLMFake()
    const r = await responder(banco.db, porta, {
      usuarioId,
      texto: '   ',
      dataReferencia: HOJE,
      fuso: FUSO,
      temporada: TEMPORADA,
      cotaDiaria: COTA_TESTE,
      agora: AGORA,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toBe('vazio')
    expect(porta.chamadas).toHaveLength(0)
  })

  it('o contexto leva a lista do dia — a resposta nasce dos fatos', async () => {
    await banco.db.delete(chatMensagens)
    const porta = new LLMFake()
    await responder(banco.db, porta, {
      usuarioId,
      texto: 'quem entrou hoje?',
      dataReferencia: HOJE,
      fuso: FUSO,
      temporada: TEMPORADA,
      cotaDiaria: COTA_TESTE,
      agora: AGORA,
    })
    const enviado = porta.chamadas[0]!.pedido
    // As DUAS palavras que o validador reprova, não só a primeira: enquanto
    // este prompt esquecia "provável" — português corriqueiro — o modelo
    // escrevia, o validador recusava e o assinante repetia a pergunta, cada
    // repetição uma chamada PAGA.
    expect(enviado.sistema.toLowerCase()).toContain('probabilidade')
    expect(enviado.sistema.toLowerCase()).toContain('provável')
    // E a metodologia do CJ vai junto — nos FATOS (`montarContexto`), não no
    // sistema: sem ela, "o que é OPD?" só teria resposta inventada.
    expect(enviado.usuario).toContain('OPD')
    expect(enviado.usuario.toLowerCase()).toContain('oportunidade por desfalque')
    expect(enviado.usuario.length).toBeGreaterThan(50)
  })

  it('pergunta longa demais é recusada ANTES da cota e da LLM', async () => {
    // O texto do assinante ia verbatim para o prompt (tokens de entrada que
    // ELE escolhe) e para uma coluna `text` sem teto. Recusar cedo não gasta
    // cota, não gasta chamada e não grava nada.
    await banco.db.delete(chatMensagens)
    const porta = new LLMFake()
    const r = await responder(banco.db, porta, {
      usuarioId,
      texto: 'a'.repeat(LIMITE_PERGUNTA + 1),
      dataReferencia: HOJE,
      fuso: FUSO,
      temporada: TEMPORADA,
      cotaDiaria: COTA_TESTE,
      agora: AGORA,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toBe('muito-longa')
    expect(porta.chamadas).toHaveLength(0)
    expect(await mensagensUsadasHoje(banco.db, usuarioId, HOJE, FUSO)).toBe(0)
    expect(await banco.db.select().from(chatMensagens)).toHaveLength(0)
  })

  it('no limite exato a pergunta passa — o teto não é um a menos', async () => {
    await banco.db.delete(chatMensagens)
    const r = await responder(banco.db, new LLMFake(), {
      usuarioId,
      texto: 'a'.repeat(LIMITE_PERGUNTA),
      dataReferencia: HOJE,
      fuso: FUSO,
      temporada: TEMPORADA,
      cotaDiaria: COTA_TESTE,
      agora: AGORA,
    })
    expect(r.ok).toBe(true)
  })

  it('limite por minuto: a cota diária não pode ser queimada em cinco segundos', async () => {
    // A cota do dia sozinha não impede um laço de script fazer vinte chamadas
    // pagas de uma vez.
    await banco.db.delete(chatMensagens)
    const porta = new LLMFake()
    for (let i = 0; i < LIMITE_POR_MINUTO; i++) {
      const ok = await responder(banco.db, porta, {
        usuarioId,
        texto: `rajada ${i}`,
        dataReferencia: HOJE,
        fuso: FUSO,
        temporada: TEMPORADA,
        cotaDiaria: COTA_TESTE,
        agora: AGORA,
      })
      expect(ok.ok).toBe(true)
    }
    const chamadasAntes = porta.chamadas.length

    const barrada = await responder(banco.db, porta, {
      usuarioId,
      texto: 'mais uma na mesma rajada',
      dataReferencia: HOJE,
      fuso: FUSO,
      temporada: TEMPORADA,
      cotaDiaria: COTA_TESTE,
      agora: AGORA,
    })
    expect(barrada.ok).toBe(false)
    if (!barrada.ok) expect(barrada.motivo).toBe('limite-por-minuto')
    // Recusa sem custo: nenhuma chamada nova ao provedor.
    expect(porta.chamadas).toHaveLength(chamadasAntes)

    // Passado o minuto, a janela anda e o assinante volta a perguntar — o
    // limite é de RITMO, não uma segunda cota diária.
    const depois = await responder(banco.db, porta, {
      usuarioId,
      texto: 'e agora, um minuto depois',
      dataReferencia: HOJE,
      fuso: FUSO,
      temporada: TEMPORADA,
      cotaDiaria: COTA_TESTE,
      agora: new Date(AGORA.getTime() + 61_000),
    })
    expect(depois.ok).toBe(true)
  }, 30_000)

  it('o prompt leva os turnos anteriores — "e o outro?" tem do que falar', async () => {
    // Sem histórico o chat é amnésico e toda pergunta de acompanhamento
    // morre. A spec §5 promete as últimas dez mensagens da conversa.
    await banco.db.delete(chatMensagens)
    const primeira = await responder(banco.db, new LLMFake(), {
      usuarioId,
      texto: 'Por que o LeBron entrou hoje?',
      dataReferencia: HOJE,
      fuso: FUSO,
      temporada: TEMPORADA,
      cotaDiaria: COTA_TESTE,
      agora: AGORA,
    })
    expect(primeira.ok).toBe(true)

    const porta = new LLMFake()
    await responder(banco.db, porta, {
      usuarioId,
      texto: 'e o outro?',
      dataReferencia: HOJE,
      fuso: FUSO,
      temporada: TEMPORADA,
      cotaDiaria: COTA_TESTE,
      agora: new Date(AGORA.getTime() + 5_000),
    })

    const enviado = porta.chamadas[0]!.pedido.usuario
    expect(enviado).toContain('Por que o LeBron entrou hoje?')
    expect(enviado).toContain('Assinante:')
    expect(enviado).toContain('Assistente:')
    // Pergunta antes da resposta: as duas do mesmo turno são gravadas com o
    // MESMO instante, e sem critério de desempate o histórico mostraria a
    // resposta primeiro.
    expect(enviado.indexOf('Assinante: Por que o LeBron entrou hoje?')).toBeLessThan(
      enviado.indexOf('Assistente:'),
    )
    // A pergunta ATUAL aparece uma vez só: o histórico é lido ANTES da
    // reserva, senão ela entraria como turno anterior de si mesma.
    expect(enviado.split('e o outro?').length - 1).toBe(1)
  })

  it('número legítimo do feed (uma linha real) é aprovado pelo validador', async () => {
    // Os números permitidos vêm de `numerosDoTexto` sobre os PRÓPRIOS fatos
    // montados por `chat-contexto.ts`, nunca de uma lista escrita à mão —
    // uma linha real da lista do dia tem que passar.
    await banco.db.delete(chatMensagens)
    const feed = await lerFeed(banco.db, HOJE)
    const comLinha = feed?.conteudo.itens.find((i) => i.linha != null)
    expect(comLinha).toBeDefined()

    const porta = new LLMFake({
      texto: `${comLinha!.nome} tem uma linha de ${comLinha!.linha} nesta rodada.`,
    })
    const r = await responder(banco.db, porta, {
      usuarioId,
      texto: 'me fala de uma linha da lista',
      dataReferencia: HOJE,
      fuso: FUSO,
      temporada: TEMPORADA,
      cotaDiaria: COTA_TESTE,
      agora: AGORA,
    })
    expect(r.ok).toBe(true)
  })
})
