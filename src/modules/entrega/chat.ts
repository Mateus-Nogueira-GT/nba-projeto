import { and, asc, desc, eq, gte, lt, sql } from 'drizzle-orm'

import { chatMensagens, usuarios } from '../dominio/db/schema'
import type { Db } from '../dominio/db/tipos'
import { intervaloDoDia } from '../dominio/rodada'
import { validarTexto } from '../ingestao/llm'
import { registrarChamada } from '../ingestao/llm/registro'
import type { PortaLLM } from '../ingestao/llm'
import { montarContexto } from './chat-contexto'

/**
 * CHAT DO ASSINANTE — o único caminho de LLM por REQUISIÇÃO.
 *
 * Narrativas custam por evento; o chat custa por mensagem. Por isso os freios:
 * flag desligada por padrão, tamanho máximo da pergunta, limite por minuto,
 * cota diária por assinante e teto de gasto no painel do provedor (fora do
 * código, o freio que não depende de acertarmos).
 *
 * O contexto é montado pelo SERVIDOR: os fatos de `chat-contexto.ts` (feed
 * materializado do dia, metodologia, classificação e rodada — quem chega
 * aqui já passou pelo portão de nível, MVP+) + as últimas mensagens da
 * conversa. O escopo — os dois assuntos permitidos e a recusa do resto —
 * vive em `chat-prompt.ts`. A LLM não consulta banco e não sugere entrada
 * fora da lista.
 */

// Os freios moram em `chat-limites.ts` porque `chat-contexto.ts` também
// precisa deles, e um import cruzado entre os dois fecharia um ciclo. A
// reexportação mantém `chat.ts` como a porta de entrada que os testes e a
// rota já conhecem.
export {
  configuracaoChat,
  LIMITE_PERGUNTA,
  LIMITE_POR_MINUTO,
  LIMITE_RESPOSTA,
} from './chat-limites'
import { LIMITE_PERGUNTA, LIMITE_POR_MINUTO, LIMITE_RESPOSTA } from './chat-limites'

// RECUSA_FORA_DE_ESCOPO mora em `chat-prompt.ts` (motivo no comentário de
// lá: um script fora deste agente precisa dela sem importar `responder`
// inteiro). Reexportada aqui pelo mesmo motivo do bloco acima — manter
// `chat.ts` como a porta de entrada já conhecida.
export { RECUSA_FORA_DE_ESCOPO } from './chat-prompt'
import { sistema } from './chat-prompt'

/** Quantas mensagens da conversa (dos dois lados) o prompt carrega. */
const HISTORICO_MAXIMO = 10

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
  limite = HISTORICO_MAXIMO,
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
    .limit(limite)

  return linhas.reverse()
}

/**
 * A CONVERSA DO DIA INTEIRA — o que o painel mostra ao abrir.
 *
 * O prompt leva só as últimas dez (`HISTORICO_MAXIMO`); a pessoa que reabre a
 * gaveta quer ver tudo o que perguntou hoje, senão o assistente "lembra" de uma
 * conversa que a tela não mostra. O teto é a própria cota: cada pergunta vira
 * duas linhas, então a conversa de um dia nunca passa de duas vezes a cota.
 *
 * `cotaDiaria` chega como PARÂMETRO — ela depende do nível de quem pergunta
 * (spec, decisão 7), e este módulo não sabe quem está perguntando; quem
 * chama já resolveu isso com `configuracaoChat().cotaDiariaPorNivel`.
 */
export async function conversaDoDia(
  db: Db,
  usuarioId: string,
  dataReferencia: string,
  fuso: string,
  cotaDiaria: number,
): Promise<{ papel: string; texto: string }[]> {
  return ultimasMensagens(db, usuarioId, dataReferencia, fuso, cotaDiaria * 2)
}

export type RespostaChat =
  | { ok: true; texto: string }
  | {
      ok: false
      motivo: 'cota-esgotada' | 'limite-por-minuto' | 'indisponivel' | 'vazio' | 'muito-longa'
    }

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
  entrada: {
    usuarioId: string
    texto: string
    dataReferencia: string
    fuso: string
    temporada: string
    agora: Date
    /**
     * A cota do NÍVEL DO PLANO de quem pergunta (spec, decisão 7 — MVP e All
     * Star têm tetos diários distintos). Quem chama já passou pelo portão de
     * nível e já resolveu `configuracaoChat().cotaDiariaPorNivel[acesso.nivel]`;
     * `responder` não conhece nível de plano, só o número que vale para esta
     * chamada.
     */
    cotaDiaria: number
  },
): Promise<RespostaChat> {
  const pergunta = entrada.texto.trim()
  if (pergunta.length === 0) return { ok: false, motivo: 'vazio' }
  // Antes de reservar cota e MUITO antes de chamar a LLM: o texto do
  // assinante é entrada não confiável, e recusar cedo não gasta nada.
  if (pergunta.length > LIMITE_PERGUNTA) return { ok: false, motivo: 'muito-longa' }

  const cotaDiaria = entrada.cotaDiaria
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
    // bloqueadas esperando um provedor de LLM responder. O mesmo vale para as
    // consultas de `montarContexto` (rodada, classificação, feed do dia).
    const conversa =
      historico.length === 0
        ? ''
        : `Conversa até aqui (mais antiga primeiro):\n${historico
            .map((m) => `${m.papel === 'USUARIO' ? 'Assinante' : 'Assistente'}: ${m.texto}`)
            .join('\n')}\n\n`

    const contexto = await montarContexto(db, {
      dataReferencia: entrada.dataReferencia,
      fuso: entrada.fuso,
      temporada: entrada.temporada,
      cotaDiaria,
    })

    const r = await porta.gerar('chat', {
      sistema: sistema(),
      usuario: `${contexto.fatos}\n\n${conversa}Pergunta do usuário: ${pergunta}`,
    })

    const validado = validarTexto(r.texto, {
      numeros: contexto.numeros,
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
