import { randomBytes } from 'node:crypto'

import { and, asc, desc, eq, exists, getTableName, gte, lt, lte, notExists, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import {
  assinaturas,
  atribuicoesAfiliados,
  campanhasAfiliados,
  direitosAcesso,
  eventosAfiliados,
  linksAfiliados,
  parceirosAfiliados,
  usuarios,
} from '@/modules/dominio/db/schema'
import type { Db } from '@/modules/dominio/db/tipos'
import { TRAVA } from '@/modules/dominio/db/travas'

import { PRODUTO_PAGO } from '../assinatura/configuracao'
import { mascararIdentificador } from './importacao-csv'
import { atribuicaoIndicadaNoCadastro } from './predicado-indicacao'
import { type AtorAfiliados, auditar, exigirAdmin, normalizarCodigoDeLink } from './servico'
import { situacaoDaIndicacao } from './situacao'

/**
 * Links de indicação: levam a `/cadastrar` (tipo CADASTRO), sob uma campanha
 * de finalidade INDICACAO, sem oferta, acordo nem casa. Reaproveitam o motor
 * de afiliados inteiro (cookie, janela de 30 dias, primeiro toque, robôs,
 * conflito) — o que muda é só o destino e a ausência de dinheiro.
 */

/** Canal da campanha do link pessoal: é por ele que o link fixo é reencontrado. */
const CANAL_DO_LINK_PESSOAL = 'usuario'
const NOME_DA_CAMPANHA_PESSOAL = 'Link pessoal'
const TENTATIVAS_DE_CODIGO = 5
const BASE36 = '0123456789abcdefghijklmnopqrstuvwxyz'

/**
 * `u-` + 10 caracteres base36 do gerador criptográfico. Aleatório de
 * propósito: derivado do id da conta, qualquer um montaria o link de outra
 * pessoa e se passaria por indicado dela. Rejeição de bytes ≥ 252 (7 × 36)
 * para não enviesar os primeiros caracteres do alfabeto.
 */
export function codigoPessoalAleatorio(): string {
  let codigo = ''
  while (codigo.length < 10) {
    for (const byte of randomBytes(16)) {
      if (byte < 252 && codigo.length < 10) codigo += BASE36[byte % 36]
    }
  }
  return `u-${codigo}`
}

/**
 * Colisão do código com um parceiro/link que já existe: vale tentar outro.
 * O Drizzle embrulha o erro do driver, então a causa é seguida até o fim.
 */
function colisaoDeCodigo(erro: unknown): boolean {
  let atual: unknown = erro
  while (atual && typeof atual === 'object') {
    const { code, constraint, message } = atual as {
      code?: string
      constraint?: string
      message?: string
    }
    if (code === '23505') return `${constraint ?? message ?? ''}`.includes('codigo')
    atual = (atual as { cause?: unknown }).cause
  }
  return false
}

async function codigoDoLinkPessoal(db: Db, usuarioId: string): Promise<string | null> {
  const [achado] = await db
    .select({ codigo: linksAfiliados.codigo })
    .from(linksAfiliados)
    .innerJoin(campanhasAfiliados, eq(linksAfiliados.campanhaId, campanhasAfiliados.id))
    .innerJoin(parceirosAfiliados, eq(campanhasAfiliados.parceiroId, parceirosAfiliados.id))
    .where(
      and(
        eq(parceirosAfiliados.usuarioId, usuarioId),
        eq(campanhasAfiliados.finalidade, 'INDICACAO'),
        eq(campanhasAfiliados.canal, CANAL_DO_LINK_PESSOAL),
        eq(linksAfiliados.tipoDestino, 'CADASTRO'),
      ),
    )
    .orderBy(asc(linksAfiliados.criadoEm))
    .limit(1)
  return achado?.codigo ?? null
}

/**
 * O link "indique a NIP" da conta — um só, fixo. Idempotente: a primeira
 * chamada cria o parceiro do tipo USUARIO (nome público = e-mail mascarado,
 * que só o admin chega a ver), a campanha INDICACAO sem oferta e o link
 * CADASTRO; as seguintes só o devolvem.
 *
 * Conta que JÁ é parceiro convidado não ganha um segundo parceiro
 * (`parceiros_afiliados.usuario_id` é único): o link pessoal nasce sob o
 * parceiro que ela já tem.
 *
 * `gerarCodigo` existe para o teste forçar uma colisão; em produção é sempre
 * o aleatório.
 */
export async function linkPessoalDoUsuario(
  db: Db,
  usuarioId: string,
  agora: Date,
  gerarCodigo: () => string = codigoPessoalAleatorio,
): Promise<{ codigo: string }> {
  // Caminho quente: `/conta` é `force-dynamic` e chama esta função em TODA
  // visita (fix round 1, Tarefa 6) — com o link já criado (o caso comum,
  // depois da primeira vez), abrir transação e tomar
  // `pg_advisory_xact_lock` a cada carregamento não escala para 10 mil
  // usuários simultâneos. A leitura simples, sem transação nem trava, cobre
  // o estado estável. Só quando ela não encontra nada (link ainda não
  // existe) é que vale pagar transação + trava — e mesmo aí, a releitura
  // DENTRO da trava (`existente`, abaixo) continua garantindo que duas
  // abas abrindo /conta ao mesmo tempo criam um único link.
  const existenteSemTravar = await codigoDoLinkPessoal(db, usuarioId)
  if (existenteSemTravar) return { codigo: existenteSemTravar }

  return db.transaction(async (tx) => {
    // Duas abas abrindo /conta ao mesmo tempo: a segunda espera a primeira e
    // encontra o link pronto, em vez de estourar o único de parceiro/campanha.
    await tx.execute(
      sql`select pg_advisory_xact_lock(${TRAVA.AFILIADO_USUARIO}, hashtext(${usuarioId}))`,
    )
    const existente = await codigoDoLinkPessoal(tx, usuarioId)
    if (existente) return { codigo: existente }

    const [usuario] = await tx
      .select({ email: usuarios.email })
      .from(usuarios)
      .where(eq(usuarios.id, usuarioId))
      .limit(1)
    if (!usuario) throw new Error('Conta não encontrada')
    const [parceiroExistente] = await tx
      .select()
      .from(parceirosAfiliados)
      .where(eq(parceirosAfiliados.usuarioId, usuarioId))
      .limit(1)

    for (let tentativa = 1; ; tentativa++) {
      const codigo = gerarCodigo()
      try {
        // Ponto de salvamento: a colisão desfaz só esta tentativa, não a
        // transação inteira (no Postgres, erro aborta a transação).
        return await tx.transaction(async (sp) => {
          let parceiroId = parceiroExistente?.id
          if (!parceiroId) {
            const [parceiro] = await sp
              .insert(parceirosAfiliados)
              .values({
                usuarioId,
                codigo,
                nomePublico: mascararIdentificador(usuario.email) ?? 'Usuário',
                tipo: 'USUARIO',
                criadoEm: agora,
                atualizadoEm: agora,
              })
              .returning()
            parceiroId = parceiro!.id
            await auditar(sp, usuarioId, 'PARCEIRO_CRIADO', 'PARCEIRO', parceiroId, agora, {
              tipo: 'USUARIO',
            })
          }
          const [campanha] = await sp
            .insert(campanhasAfiliados)
            .values({
              parceiroId,
              ofertaId: null,
              finalidade: 'INDICACAO',
              nome: NOME_DA_CAMPANHA_PESSOAL,
              canal: CANAL_DO_LINK_PESSOAL,
              criadoPorId: usuarioId,
              criadoEm: agora,
              atualizadoEm: agora,
            })
            .returning()
          const [link] = await sp
            .insert(linksAfiliados)
            .values({
              campanhaId: campanha!.id,
              codigo,
              tipoDestino: 'CADASTRO',
              criadoEm: agora,
              atualizadoEm: agora,
            })
            .returning()
          await auditar(sp, usuarioId, 'LINK_CRIADO', 'LINK', link!.id, agora, {
            campanhaId: campanha!.id,
            finalidade: 'INDICACAO',
          })
          return { codigo }
        })
      } catch (erro) {
        if (tentativa < TENTATIVAS_DE_CODIGO && colisaoDeCodigo(erro)) continue
        throw erro
      }
    }
  })
}

/**
 * Link de indicação de um parceiro convidado, criado pelo admin — mesmo
 * padrão (e mesma auditoria LINK_CRIADO) de `criarCampanhaComLink`, mas a
 * campanha é de INDICACAO, sem oferta, e o link leva a `/cadastrar`.
 */
export async function criarLinkDeIndicacao(
  db: Db,
  ator: AtorAfiliados,
  entrada: { parceiroId: string; nome: string; canal: string; codigo: string },
  agora: Date,
): Promise<{ codigo: string }> {
  exigirAdmin(ator)
  const codigo = normalizarCodigoDeLink(entrada.codigo)
  const nome = entrada.nome.trim()
  const canal = entrada.canal.trim()
  if (nome.length < 2 || nome.length > 120) throw new Error('Nome de campanha inválido')
  if (!canal) throw new Error('Canal inválido')
  // Controller ruling (Tarefa 2): "usuario" é o canal do LINK PESSOAL
  // (`linkPessoalDoUsuario`) — um link de admin com esse canal se confundiria
  // com ele em `codigoDoLinkPessoal`. Comparado sem caixa nem espaço, porque é
  // assim que um campo de texto chega.
  if (canal.toLowerCase() === CANAL_DO_LINK_PESSOAL) throw new Error('Canal reservado ao link pessoal')
  return db.transaction(async (tx) => {
    const [campanha] = await tx
      .insert(campanhasAfiliados)
      .values({
        parceiroId: entrada.parceiroId,
        ofertaId: null,
        finalidade: 'INDICACAO',
        nome,
        canal,
        criadoPorId: ator.usuarioId,
        criadoEm: agora,
        atualizadoEm: agora,
      })
      .returning()
    const [link] = await tx
      .insert(linksAfiliados)
      .values({
        campanhaId: campanha!.id,
        codigo,
        tipoDestino: 'CADASTRO',
        criadoEm: agora,
        atualizadoEm: agora,
      })
      .returning()
    await auditar(tx, ator.usuarioId, 'LINK_CRIADO', 'LINK', link!.id, agora, {
      campanhaId: campanha!.id,
      finalidade: 'INDICACAO',
    })
    return { codigo: link!.codigo }
  })
}

/**
 * Registra o `ASSINATURA_NIP` da conta indicada — plano e data, nenhum valor
 * em dinheiro: é rastreamento, não comissão. Chamado DEPOIS do commit do
 * pagamento; quem chama engole a falha (o pagamento nunca depende disto) e a
 * varredura da reconciliação refaz.
 *
 * Só o PRIMEIRO pagamento vale: o índice único parcial
 * `eventos_afiliados_assinatura_unica` segura um por atribuição, então o 2º
 * pagamento, a renovação ou a troca de plano não mudam nem a data nem o plano.
 */
export async function registrarAssinaturaIndicada(
  db: Db,
  entrada: {
    usuarioId: string
    nivelDoPlano: 'MVP' | 'ALL_STAR'
    modalidade: 'MENSAL' | 'TEMPORADA'
    aprovadoEm: Date
  },
): Promise<{ registrada: boolean }> {
  // A mais antiga: é o primeiro toque, o mesmo critério da atribuição canônica.
  const [atribuicao] = await db
    .select({
      id: atribuicoesAfiliados.id,
      visitanteHash: atribuicoesAfiliados.visitanteHash,
      linkOrigemId: atribuicoesAfiliados.linkOrigemId,
    })
    .from(atribuicoesAfiliados)
    .where(
      and(eq(atribuicoesAfiliados.usuarioId, entrada.usuarioId), atribuicaoIndicadaNoCadastro()),
    )
    .orderBy(asc(atribuicoesAfiliados.inicio))
    .limit(1)
  if (!atribuicao) return { registrada: false }

  const gravado = await db
    .insert(eventosAfiliados)
    .values({
      visitanteHash: atribuicao.visitanteHash,
      usuarioId: entrada.usuarioId,
      linkId: atribuicao.linkOrigemId,
      atribuicaoId: atribuicao.id,
      tipo: 'ASSINATURA_NIP',
      nivelDoPlano: entrada.nivelDoPlano,
      modalidade: entrada.modalidade,
      ocorridoEm: entrada.aprovadoEm,
    })
    .onConflictDoNothing({
      target: eventosAfiliados.atribuicaoId,
      where: sql`${eventosAfiliados.tipo} = 'ASSINATURA_NIP'`,
    })
    .returning({ id: eventosAfiliados.id })
  return { registrada: gravado.length > 0 }
}

/**
 * A rede de segurança do webhook: toda conta indicada no cadastro que tem
 * direito pago pelo provedor e ainda não tem `ASSINATURA_NIP` ganha o registro
 * a partir do direito MAIS ANTIGO (o primeiro pagamento). Idempotente — o que
 * já foi gravado sai da lista, e o índice único segura corrida com o webhook.
 *
 * `provedor` é o mesmo valor que o webhook grava em `direitos_acesso.origem`
 * (o nome da porta de pagamento): cortesia do admin e bootstrap têm outra
 * origem e não são assinatura. Devolve quantas foram gravadas agora.
 */
export async function registrarAssinaturasPendentes(
  db: Db,
  agora: Date,
  provedor: string,
): Promise<number> {
  const pagoPeloProvedor = and(
    eq(direitosAcesso.origem, provedor),
    lte(direitosAcesso.inicio, agora),
  )
  const contas = await db
    .selectDistinct({ usuarioId: direitosAcesso.usuarioId })
    .from(direitosAcesso)
    .where(
      and(
        pagoPeloProvedor,
        exists(
          db
            .select({ id: atribuicoesAfiliados.id })
            .from(atribuicoesAfiliados)
            .where(
              and(
                eq(atribuicoesAfiliados.usuarioId, direitosAcesso.usuarioId),
                atribuicaoIndicadaNoCadastro(),
              ),
            ),
        ),
        notExists(
          sql`(select 1 from ${eventosAfiliados} inner join ${atribuicoesAfiliados} on ${atribuicoesAfiliados.id} = ${eventosAfiliados.atribuicaoId} where ${atribuicoesAfiliados.usuarioId} = ${direitosAcesso.usuarioId} and ${eventosAfiliados.tipo} = 'ASSINATURA_NIP')`,
        ),
      ),
    )

  let gravadas = 0
  for (const { usuarioId } of contas) {
    const [primeiro] = await db
      .select({
        inicio: direitosAcesso.inicio,
        nivelDoPlano: direitosAcesso.nivelDoPlano,
        modalidade: direitosAcesso.modalidade,
      })
      .from(direitosAcesso)
      .where(and(eq(direitosAcesso.usuarioId, usuarioId), pagoPeloProvedor))
      .orderBy(asc(direitosAcesso.inicio))
      .limit(1)
    // Direito pago sempre tem modalidade (o webhook grava a da compra); sem
    // ela o CHECK recusaria — pular é melhor que inventar uma.
    if (!primeiro?.modalidade) continue
    // `as`: fronteira entre `text` no banco e o tipo; os CHECKs de
    // `direitos_acesso` garantem que só estes valores existem nas colunas.
    const { registrada } = await registrarAssinaturaIndicada(db, {
      usuarioId,
      nivelDoPlano: primeiro.nivelDoPlano as 'MVP' | 'ALL_STAR',
      modalidade: primeiro.modalidade as 'MENSAL' | 'TEMPORADA',
      aprovadoEm: primeiro.inicio,
    })
    if (registrada) gravadas += 1
  }
  return gravadas
}

/** Uma linha da lista completa de indicações — só o admin vê isto (contexto comum, regra 2). */
export type LinhaIndicacao = {
  indicador: { parceiroId: string; tipo: 'PARCEIRO' | 'USUARIO'; nome: string }
  linkCodigo: string
  indicado: { usuarioId: string; nome: string | null; email: string }
  cadastradoEm: Date
  assinatura: { nivelDoPlano: string; modalidade: string; aprovadoEm: Date } | null
  situacao: ReturnType<typeof situacaoDaIndicacao>
}

/** A conta de quem indica, quando o indicador é do tipo USUARIO (link pessoal). */
const contaDoIndicador = alias(usuarios, 'conta_do_indicador')
/** O `ASSINATURA_NIP` da mesma atribuição do `CADASTRO_NIP`, se houver. */
const eventoDeAssinatura = alias(eventosAfiliados, 'evento_de_assinatura')

/**
 * A conta INDICADA — a referência que as duas subconsultas correlacionadas de
 * situação, abaixo, precisam enxergar. Tem de ser o nome literal da tabela, e
 * não `${usuarios.id}`: dentro de um `sql` usado como CAMPO do select, o
 * drizzle renderiza a coluna SEM o prefixo (`${usuarios.id}` vira só `"id"`),
 * e o Postgres resolveria isso para a tabela MAIS INTERNA da subconsulta —
 * nunca para o usuário de fora. Mesmo defeito, e mesma correção, de
 * `admin/usuarios.ts`. Funciona sem ambiguidade porque `usuarios` aparece
 * UMA vez sem alias no FROM/JOIN principal (o indicador usa `contaDoIndicador`).
 */
const ID_DO_INDICADO = sql`${sql.identifier(getTableName(usuarios))}.${sql.identifier(usuarios.id.name)}`

/**
 * "O direito `d` cobre `agora`": começou (`inicio <= agora`) e ou não tem fim,
 * ou o fim ainda não chegou. Repetido 3× na consulta de situação (a condição
 * de existência, o filtro do direito escolhido e o desempate da ordenação) —
 * extraído para as três nunca divergirem (Fix round 2).
 */
function direitoCobreAgora(agora: Date) {
  return sql`(d.inicio <= ${agora} and (d.fim is null or d.fim > ${agora}))`
}

/**
 * A lista completa de indicações — só o admin: é a ÚNICA leitura deste módulo
 * com nome e e-mail de quem indicou e de quem foi indicado. Uma linha por
 * `CADASTRO_NIP` cuja atribuição não está em CONFLITO (o MESMO predicado,
 * `atribuicaoIndicadaNoCadastro`, que decide o que `registrarAssinaturaIndicada`
 * grava — os dois nunca podem discordar sobre o que é indicação).
 *
 * UMA consulta: a situação de cada indicado vem de duas subconsultas
 * correlacionadas, não de uma consulta por linha — e as DUAS filtram por
 * `PRODUTO_PAGO` (produto único hoje, mas a coluna existe e um segundo
 * produto pago não pode contaminar a situação deste).
 *
 * O direito RELEVANTE (Fix round 1) não é "o de início mais recente" — um
 * direito FUTURO (comprado antecipado, ou uma correção de dados) teria o
 * `inicio` mais recente e venceria esse critério sem nunca ter estado em
 * vigor. É, em ordem de preferência: (1) o que cobre `agora`
 * (`inicio <= agora and (fim is null or fim > agora)`); (2) na ausência de um
 * que cubra, o mais recente já VENCIDO (`fim is not null and fim <= agora`).
 * Um direito só-futuro não entra em nenhum dos dois grupos — vira
 * `SEM_ASSINATURA`, não `ATIVA`, porque ainda não começou.
 */
export async function listarIndicacoes(
  db: Db,
  filtro: {
    tipoIndicador?: 'PARCEIRO' | 'USUARIO'
    parceiroId?: string
    inicio?: Date
    fim?: Date
  },
  agora: Date,
): Promise<{ totais: { cadastros: number; assinaturas: number }; linhas: LinhaIndicacao[] }> {
  const linhasBrutas = await db
    .select({
      parceiroId: parceirosAfiliados.id,
      tipoIndicador: parceirosAfiliados.tipo,
      nomePublico: parceirosAfiliados.nomePublico,
      indicadorNome: contaDoIndicador.nome,
      indicadorEmail: contaDoIndicador.email,
      linkCodigo: linksAfiliados.codigo,
      indicadoId: usuarios.id,
      indicadoNome: usuarios.nome,
      indicadoEmail: usuarios.email,
      cadastradoEm: eventosAfiliados.ocorridoEm,
      assinaturaNivelDoPlano: eventoDeAssinatura.nivelDoPlano,
      assinaturaModalidade: eventoDeAssinatura.modalidade,
      assinaturaOcorridoEm: eventoDeAssinatura.ocorridoEm,
      // MESMA ORDEM de `admin/usuarios.ts` e da tela da conta
      // (`features/conta/carregar.ts`), pelo mesmo motivo: depois de um
      // upgrade, a última escrita é a do contrato que MORREU (a substituição
      // marca o antigo CANCELADA depois de o novo nascer). Por
      // `atualizado_em desc` sozinho, o admin veria CANCELADA num assinante
      // ativo (revisão final). Não cancelado primeiro; entre iguais, o mais
      // recente.
      statusAssinaturaRecente: sql<string | null>`(
        select a.status from ${assinaturas} a
        where a.usuario_id = ${ID_DO_INDICADO} and a.produto = ${PRODUTO_PAGO}
        order by (a.cancelada_em is null) desc, a.atualizado_em desc
        limit 1
      )`,
      // Existe ALGUM direito relevante (em vigor agora OU já vencido)? Sem
      // isto, "nenhuma linha casou" e "a linha que casou tem `fim` nulo"
      // seriam indistinguíveis no valor escalar abaixo — os dois viram NULL
      // no SQL. É esta coluna que diferencia as duas leituras de `null` que
      // `situacaoDaIndicacao` agora espera (ver o comentário lá).
      existeDireitoRelevante: sql<boolean>`exists (
        select 1 from ${direitosAcesso} d
        where d.usuario_id = ${ID_DO_INDICADO}
          and d.produto = ${PRODUTO_PAGO}
          and d.revogado_em is null
          and (
            ${direitoCobreAgora(agora)}
            or (d.fim is not null and d.fim <= ${agora})
          )
      )`,
      // O direito RELEVANTE: primeiro o que cobre `agora` (mesmo que sem fim
      // — aberto); só na ausência de um assim, o mais recente já vencido. Um
      // direito puramente FUTURO (`inicio > agora`) não entra em nenhuma das
      // duas metades do `or` e por isso nunca aparece aqui nem decide nada.
      fimDireitoRecente: sql<Date | null>`(
        select d.fim from ${direitosAcesso} d
        where d.usuario_id = ${ID_DO_INDICADO}
          and d.produto = ${PRODUTO_PAGO}
          and d.revogado_em is null
          and (
            ${direitoCobreAgora(agora)}
            or (d.fim is not null and d.fim <= ${agora})
          )
        order by
          ${direitoCobreAgora(agora)} desc,
          d.fim desc nulls first
        limit 1
      )`.mapWith(direitosAcesso.fim),
    })
    .from(eventosAfiliados)
    .innerJoin(atribuicoesAfiliados, eq(eventosAfiliados.atribuicaoId, atribuicoesAfiliados.id))
    .innerJoin(parceirosAfiliados, eq(atribuicoesAfiliados.parceiroId, parceirosAfiliados.id))
    .leftJoin(contaDoIndicador, eq(parceirosAfiliados.usuarioId, contaDoIndicador.id))
    .innerJoin(linksAfiliados, eq(eventosAfiliados.linkId, linksAfiliados.id))
    .innerJoin(usuarios, eq(eventosAfiliados.usuarioId, usuarios.id))
    .leftJoin(
      eventoDeAssinatura,
      and(
        eq(eventoDeAssinatura.atribuicaoId, atribuicoesAfiliados.id),
        eq(eventoDeAssinatura.tipo, 'ASSINATURA_NIP'),
      ),
    )
    .where(
      and(
        eq(eventosAfiliados.tipo, 'CADASTRO_NIP'),
        atribuicaoIndicadaNoCadastro(),
        filtro.tipoIndicador ? eq(parceirosAfiliados.tipo, filtro.tipoIndicador) : undefined,
        filtro.parceiroId ? eq(atribuicoesAfiliados.parceiroId, filtro.parceiroId) : undefined,
        filtro.inicio ? gte(eventosAfiliados.ocorridoEm, filtro.inicio) : undefined,
        filtro.fim ? lt(eventosAfiliados.ocorridoEm, filtro.fim) : undefined,
      ),
    )
    // Desempate pelo id do evento: `ocorrido_em` sozinho pode empatar entre
    // dois cadastros do mesmo instante de teste/seed, e sem uma 2ª chave a
    // ordem de "mais recente primeiro" fica ao sabor do plano do Postgres.
    .orderBy(desc(eventosAfiliados.ocorridoEm), desc(eventosAfiliados.id))

  const linhas: LinhaIndicacao[] = linhasBrutas.map((l) => {
    const assinatura =
      l.assinaturaNivelDoPlano && l.assinaturaModalidade && l.assinaturaOcorridoEm
        ? {
            nivelDoPlano: l.assinaturaNivelDoPlano,
            modalidade: l.assinaturaModalidade,
            aprovadoEm: l.assinaturaOcorridoEm,
          }
        : null
    return {
      indicador: {
        parceiroId: l.parceiroId,
        tipo: l.tipoIndicador as 'PARCEIRO' | 'USUARIO',
        // PARCEIRO: nome público da campanha comercial. USUARIO: nome/e-mail da
        // CONTA indicadora — o nome público dela é o e-mail MASCARADO
        // (`linkPessoalDoUsuario`), bom para o parceiro ver o próprio link, não
        // para o admin auditar quem trouxe quem.
        nome:
          l.tipoIndicador === 'USUARIO' ? (l.indicadorNome ?? l.indicadorEmail ?? l.nomePublico) : l.nomePublico,
      },
      linkCodigo: l.linkCodigo,
      indicado: { usuarioId: l.indicadoId, nome: l.indicadoNome, email: l.indicadoEmail },
      cadastradoEm: l.cadastradoEm,
      assinatura,
      // Sem ASSINATURA_NIP a conta nunca assinou POR PAGAMENTO — a situação é
      // SEM_ASSINATURA, qualquer que seja o direito que ela tenha (revisão
      // final). Uma cortesia do admin (`CORTESIA_ADMIN`) dá acesso, mas não é
      // assinatura: sem isto a linha diria "Não assinou" e "Ativa" ao mesmo
      // tempo.
      situacao: !assinatura
        ? 'SEM_ASSINATURA'
        : situacaoDaIndicacao({
            statusAssinatura: l.statusAssinaturaRecente,
            // Discriminado explicitamente (Fix round 2): sem isto, "não existe
            // direito relevante" e "existe um direito em vigor, mas aberto" seriam
            // o MESMO `null` escalar do SQL — e quem chamasse `situacaoDaIndicacao`
            // com um `?? null` por descuido teria virado ATIVA em silêncio.
            direito: !l.existeDireitoRelevante
              ? { tipo: 'NENHUM' }
              : l.fimDireitoRecente === null
                ? { tipo: 'ABERTO' }
                : { tipo: 'ATE', fim: l.fimDireitoRecente },
            agora,
          }),
    }
  })

  return {
    totais: {
      cadastros: linhas.length,
      assinaturas: linhas.filter((l) => l.assinatura !== null).length,
    },
    linhas,
  }
}
