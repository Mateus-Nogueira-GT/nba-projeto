import { and, asc, desc, eq, gte, lt, sql } from 'drizzle-orm'

import { chatMensagens, usuarios } from '../dominio/db/schema'
import type { Db } from '../dominio/db/tipos'
import { intervaloDoDia } from '../dominio/rodada'
import { validarTexto } from '../ingestao/llm'
import { regrasDoTexto } from '../ingestao/llm/regras-do-texto'
import { registrarChamada } from '../ingestao/llm/registro'
import type { PortaLLM } from '../ingestao/llm'
import { METODOLOGIA } from './metodologia'
import { numerosDoItem } from './narrativa'
import { lerFeed } from './lista-secreta'

/**
 * CHAT DO ASSINANTE — o único caminho de LLM por REQUISIÇÃO.
 *
 * Narrativas custam por evento; o chat custa por mensagem. Por isso os freios:
 * flag desligada por padrão, tamanho máximo da pergunta, limite por minuto,
 * cota diária por assinante e teto de gasto no painel do provedor (fora do
 * código, o freio que não depende de acertarmos).
 *
 * O contexto é montado pelo SERVIDOR: feed materializado do dia + metodologia
 * + as últimas mensagens da conversa. A LLM não consulta banco e não sugere
 * entrada fora da lista.
 */

const COTA_PADRAO = 20
const LIMITE_RESPOSTA = 1200

/**
 * Tamanho máximo da pergunta, em caracteres.
 *
 * É uma pergunta, não uma redação. Sem teto, o texto do assinante ia inteiro
 * para o prompt (tokens de entrada que ELE escolhe) e para uma coluna `text`
 * sem limite — os dois custos crescem com o que o outro lado digitar. Meio
 * milhar de caracteres é largo para qualquer pergunta sobre um card.
 */
export const LIMITE_PERGUNTA = 500

/**
 * Perguntas por minuto, por assinante.
 *
 * A cota diária sozinha não impede queimá-la inteira em cinco segundos, nem
 * um laço de script fazendo vinte chamadas pagas de uma vez. Cinco por minuto
 * é uma pergunta a cada doze segundos — mais rápido do que dá para LER a
 * resposta anterior; acima disso não é assinante, é automação.
 *
 * Medido como a cota: COUNT das mensagens do próprio usuário na janela, sem
 * contador paralelo. `plataforma/auth/rate-limit.ts` NÃO serve aqui — ele é
 * do login, chaveado por identificador e sucesso da tentativa.
 */
export const LIMITE_POR_MINUTO = 5

/** Quantas mensagens da conversa (dos dois lados) o prompt carrega. */
const HISTORICO_MAXIMO = 10

export function configuracaoChat(ambiente: NodeJS.ProcessEnv = process.env): {
  habilitado: boolean
  cotaDiaria: number
} {
  const bruta = Number(ambiente.CHAT_COTA_DIARIA)
  return {
    // Só a string exata liga: qualquer outro valor mantém desligado.
    habilitado: ambiente.CHAT_HABILITADO === 'true',
    // Valor inválido cai no padrão. Virar 0 trancaria todo mundo fora; virar
    // NaN liberaria geral — os dois acidentes acontecem por env mal digitado.
    cotaDiaria: Number.isFinite(bruta) && bruta > 0 ? Math.floor(bruta) : COTA_PADRAO,
  }
}

/**
 * A cota é o COUNT das perguntas do dia LOCAL — sem contador paralelo para
 * divergir.
 *
 * O dia usa `intervaloDoDia` (mesmo helper da rodada, `dominio/rodada.ts`),
 * não meia-noite UTC. Meia-noite UTC é 21h em Brasília: sem o fuso, a cota do
 * assinante reabre três horas mais cedo do que o dia civil dele — o mesmo bug
 * que o comentário de `intervaloDoDia` já documenta para a rodada.
 */
export async function mensagensUsadasHoje(
  db: Db,
  usuarioId: string,
  dataReferencia: string,
  fuso: string,
): Promise<number> {
  const { inicio, fim } = intervaloDoDia(dataReferencia, fuso)

  const linhas = await db
    .select({ id: chatMensagens.id })
    .from(chatMensagens)
    .where(
      and(
        eq(chatMensagens.usuarioId, usuarioId),
        eq(chatMensagens.papel, 'USUARIO'),
        gte(chatMensagens.criadoEm, inicio),
        lt(chatMensagens.criadoEm, fim),
      ),
    )
  return linhas.length
}

/** Mesmo COUNT da cota, janela de 60 segundos. Ver `LIMITE_POR_MINUTO`. */
export async function mensagensNoUltimoMinuto(
  db: Db,
  usuarioId: string,
  agora: Date,
): Promise<number> {
  const linhas = await db
    .select({ id: chatMensagens.id })
    .from(chatMensagens)
    .where(
      and(
        eq(chatMensagens.usuarioId, usuarioId),
        eq(chatMensagens.papel, 'USUARIO'),
        gte(chatMensagens.criadoEm, new Date(agora.getTime() - 60_000)),
      ),
    )
  return linhas.length
}

/**
 * As últimas mensagens da conversa do dia, MAIS ANTIGA PRIMEIRO.
 *
 * Sem isto o chat é amnésico e "e o outro?" não tem resposta possível — a
 * spec §5 promete as últimas dez. Recorta pelo dia local, o mesmo recorte da
 * cota: conversa de ontem é sobre uma lista que não existe mais.
 */
export async function ultimasMensagens(
  db: Db,
  usuarioId: string,
  dataReferencia: string,
  fuso: string,
): Promise<{ papel: string; texto: string }[]> {
  const { inicio, fim } = intervaloDoDia(dataReferencia, fuso)

  // Busca as N mais RECENTES (desc + limit) e devolve invertidas: pegar as
  // dez primeiras do dia daria o começo da conversa, não o contexto atual.
  const linhas = await db
    .select({ papel: chatMensagens.papel, texto: chatMensagens.texto })
    .from(chatMensagens)
    .where(
      and(
        eq(chatMensagens.usuarioId, usuarioId),
        gte(chatMensagens.criadoEm, inicio),
        lt(chatMensagens.criadoEm, fim),
      ),
    )
    // Pergunta e resposta do mesmo turno são gravadas com o MESMO instante
    // (o `agora` da requisição). Sem o segundo critério a ordem entre as duas
    // seria a que o banco quisesse, e o histórico mostraria a resposta antes
    // da pergunta. Na listagem descendente, 'ASSISTENTE' antes de 'USUARIO' é
    // o que, depois do `reverse`, deixa a pergunta na frente.
    .orderBy(desc(chatMensagens.criadoEm), asc(chatMensagens.papel))
    .limit(HISTORICO_MAXIMO)

  return linhas.reverse()
}

export type RespostaChat =
  | { ok: true; texto: string }
  | {
      ok: false
      motivo: 'cota-esgotada' | 'limite-por-minuto' | 'indisponivel' | 'vazio' | 'muito-longa'
    }

/**
 * As proibições e o limite saem de `regras-do-texto.ts`, o MESMO módulo da
 * narrativa. Enquanto cada prompt escrevia as suas, este aqui esquecia
 * "provável" — que o validador reprova — e cada reprovação virava uma
 * retentativa PAGA do assinante (ver o comentário lá).
 */
const SISTEMA = [
  'Você é o assistente da NIP, falando com um assinante brasileiro.',
  'Responda em no máximo três parágrafos curtos.',
  ...regrasDoTexto(LIMITE_RESPOSTA),
  'Use SOMENTE os fatos da lista do dia fornecidos abaixo e a metodologia a seguir.',
  'NUNCA sugira uma entrada que não esteja na lista do dia.',
  METODOLOGIA,
].join('\n')

/** Apaga a mensagem reservada. Nunca lança: é uma limpeza best-effort. */
async function apagarReserva(db: Db, id: string): Promise<void> {
  try {
    await db.delete(chatMensagens).where(eq(chatMensagens.id, id))
  } catch {
    // engolido de propósito — a reserva ficar órfã é preferível a mascarar o
    // erro original que trouxe a função até aqui.
  }
}

type Reserva =
  { tipo: 'reservada'; id: string } | { tipo: 'cota-esgotada' } | { tipo: 'limite-por-minuto' }

export async function responder(
  db: Db,
  porta: PortaLLM,
  entrada: { usuarioId: string; texto: string; dataReferencia: string; fuso: string; agora: Date },
): Promise<RespostaChat> {
  const pergunta = entrada.texto.trim()
  if (pergunta.length === 0) return { ok: false, motivo: 'vazio' }
  // Antes de reservar cota e MUITO antes de chamar a LLM: o texto do
  // assinante é entrada não confiável, e recusar cedo não gasta nada.
  if (pergunta.length > LIMITE_PERGUNTA) return { ok: false, motivo: 'muito-longa' }

  const { cotaDiaria } = configuracaoChat()
  const inicio = Date.now()
  let reservaId: string | null = null

  try {
    // Lido ANTES da reserva de propósito: a reserva já insere a pergunta
    // atual, e ela entraria no próprio histórico como turno anterior.
    const historico = await ultimasMensagens(
      db,
      entrada.usuarioId,
      entrada.dataReferencia,
      entrada.fuso,
    )

    // RESERVA DE VAGA — trava a linha do usuário, reconta a cota e, havendo
    // vaga, já insere a mensagem do USUÁRIO, tudo na mesma transação.
    //
    // Sem essa trava, duas requisições concorrentes (duas abas, ou um script)
    // fazem o mesmo SELECT COUNT antes de qualquer uma inserir: as duas veem
    // vaga e as duas passam, furando a cota. O `FOR UPDATE` serializa por
    // usuário — mesmo padrão de `autenticar` em
    // `plataforma/auth/sessao.ts` — e como a linha reservada JÁ CONTA para
    // `mensagensUsadasHoje`, a segunda requisição da fila enxerga a primeira.
    //
    // O limite por minuto é conferido no MESMO lugar, pela mesma razão: fora
    // da transação ele seria furável pela mesma corrida.
    const reserva: Reserva = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM ${usuarios} WHERE id = ${entrada.usuarioId} FOR UPDATE`)

      const usadas = await mensagensUsadasHoje(
        tx,
        entrada.usuarioId,
        entrada.dataReferencia,
        entrada.fuso,
      )
      // A cota do dia vem primeiro: para quem já esgotou o dia, "espere um
      // minuto" seria mentira — esperar não devolve vaga nenhuma.
      if (usadas >= cotaDiaria) return { tipo: 'cota-esgotada' }

      const noMinuto = await mensagensNoUltimoMinuto(tx, entrada.usuarioId, entrada.agora)
      if (noMinuto >= LIMITE_POR_MINUTO) return { tipo: 'limite-por-minuto' }

      const [linha] = await tx
        .insert(chatMensagens)
        .values({
          usuarioId: entrada.usuarioId,
          papel: 'USUARIO',
          texto: pergunta,
          criadoEm: entrada.agora,
        })
        .returning({ id: chatMensagens.id })
      return linha ? { tipo: 'reservada', id: linha.id } : { tipo: 'cota-esgotada' }
    })

    if (reserva.tipo !== 'reservada') return { ok: false, motivo: reserva.tipo }
    reservaId = reserva.id

    // A rede da LLM roda FORA da transação: seguraria o lock da linha do
    // usuário pela duração inteira de uma chamada de rede (10s, 15s…), e
    // outras operações do MESMO usuário (login, outra aba) ficariam
    // bloqueadas esperando um provedor de LLM responder.
    const feed = await lerFeed(db, entrada.dataReferencia)
    const contexto = (feed?.conteudo.itens ?? [])
      .map(
        (i) =>
          `- ${i.nome} (${i.timeSigla}) · ${i.atributo} ${i.linha ?? '-'} · nível ${i.nivelApito}${i.turbo ? ' turbo' : ''} · método ${i.metodo ?? 'oscilação'}`,
      )
      .join('\n')

    const conversa =
      historico.length === 0
        ? ''
        : `Conversa até aqui (mais antiga primeiro):\n${historico
            .map((m) => `${m.papel === 'USUARIO' ? 'Assinante' : 'Assistente'}: ${m.texto}`)
            .join('\n')}\n\n`

    const r = await porta.gerar('chat', {
      sistema: SISTEMA,
      usuario: `Lista de hoje:\n${contexto || '(sem entradas)'}\n\n${conversa}Pergunta do assinante: ${pergunta}`,
    })

    // Mesma lista que as narrativas usam (`numerosDoItem`) — não uma segunda
    // lista mais estreita que divergiria dela. Some a contagem de itens: é o
    // número legítimo para perguntas como "quantos entraram hoje".
    const itens = feed?.conteudo.itens ?? []
    const numeros = [...itens.flatMap(numerosDoItem), itens.length]
    const validado = validarTexto(r.texto, {
      numeros,
      limiteCaracteres: LIMITE_RESPOSTA,
    })
    // Registra DEPOIS do validador, com `ok` sendo o desfecho do texto — a
    // tabela precisa separar "o provedor respondeu e o assinante leu" de "o
    // provedor respondeu e nós recusamos". Ver o mesmo trecho em
    // `narrativa.ts`.
    await registrarChamada(db, {
      perfil: 'chat',
      modelo: r.modelo,
      tokensEntrada: r.tokensEntrada,
      tokensSaida: r.tokensSaida,
      ok: validado.ok,
      erro: validado.ok ? null : `reprovado: ${validado.motivo}`,
      duracaoMs: Date.now() - inicio,
    })
    if (!validado.ok) {
      // A reserva já contou a pergunta do assinante; o texto que voltou é
      // que não presta. Apaga a reserva para a falha nossa não cobrar cota.
      await apagarReserva(db, reservaId)
      return { ok: false, motivo: 'indisponivel' }
    }

    await db.insert(chatMensagens).values({
      usuarioId: entrada.usuarioId,
      papel: 'ASSISTENTE',
      texto: validado.texto,
      modelo: r.modelo,
      tokensEntrada: r.tokensEntrada,
      tokensSaida: r.tokensSaida,
      criadoEm: entrada.agora,
    })

    return { ok: true, texto: validado.texto }
  } catch (erro) {
    await registrarChamada(db, {
      perfil: 'chat',
      modelo: null,
      tokensEntrada: 0,
      tokensSaida: 0,
      ok: false,
      erro: erro instanceof Error ? erro.message : String(erro),
      duracaoMs: Date.now() - inicio,
    })
    // A reserva pode ter sido feita antes do erro (rede da LLM caiu depois de
    // reservar a vaga, por exemplo). Falha nossa nunca consome cota.
    if (reservaId) await apagarReserva(db, reservaId)
    return { ok: false, motivo: 'indisponivel' }
  }
}
