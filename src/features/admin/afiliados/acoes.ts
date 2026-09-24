'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getDb } from '@/modules/dominio/db/cliente'
import { exigirAdmin } from '@/modules/plataforma/auth/cookies'
import {
  confirmarImportacao,
  criarAcordo,
  criarCampanhaComLink,
  criarCasaComercial,
  criarConvite,
  criarOferta,
  criarParceiro,
  criarPreviaImportacao,
  definirSaidaDoApito,
  definirStatusLink,
  definirStatusOferta,
  definirStatusParceiro,
  liberarComissao,
  registrarRecebimentoCasa,
  registrarAjusteComissao,
  registrarRepasse,
  type AtorAfiliados,
} from '@/modules/plataforma/afiliados/servico'
import { falha, mensagemDeErro, sucesso, type EstadoAcao } from '../estado-acao'

/**
 * AS AÇÕES DO PAINEL COMERCIAL — as mesmas 16 do front atual, com a mesma
 * validação zod. A diferença: um campo inválido agora volta como mensagem ao
 * lado do formulário, em vez de derrubar a tela com uma exceção.
 */

class SemAcesso extends Error {
  constructor() {
    super('Acesso administrativo exigido.')
  }
}

async function atorAdmin(): Promise<AtorAfiliados> {
  const sessao = await exigirAdmin()
  if (!sessao) throw new SemAcesso()
  return { usuarioId: sessao.usuarioId, papel: 'ADMIN' }
}

function texto(formulario: FormData, chave: string): string {
  return String(formulario.get(chave) ?? '').trim()
}

function atualizar() {
  revalidatePath('/admin/afiliados')
  revalidatePath('/afiliados')
}

/** Roda a ação, revalida e converte qualquer falha em mensagem. */
async function executar(ok: string, corpo: () => Promise<void>): Promise<EstadoAcao> {
  try {
    await corpo()
  } catch (erro) {
    return falha(mensagemDeErro(erro))
  }
  atualizar()
  return sucesso(ok)
}

export async function acaoCriarCasa(_e: EstadoAcao, formulario: FormData): Promise<EstadoAcao> {
  return executar('Casa cadastrada.', async () => {
    const ator = await atorAdmin()
    const nome = z.object({ nome: z.string().min(2).max(120) }).parse({ nome: texto(formulario, 'nome') }).nome
    await criarCasaComercial(getDb(), ator, nome, new Date())
  })
}

export async function acaoCriarParceiro(_e: EstadoAcao, formulario: FormData): Promise<EstadoAcao> {
  return executar('Parceiro cadastrado.', async () => {
    const ator = await atorAdmin()
    const entrada = z
      .object({
        nomePublico: z.string().min(2).max(120),
        codigo: z.string().regex(/^[a-z0-9][a-z0-9-]{2,63}$/),
      })
      .parse({
        nomePublico: texto(formulario, 'nomePublico'),
        codigo: texto(formulario, 'codigo').toLowerCase(),
      })
    await criarParceiro(getDb(), ator, entrada, new Date())
  })
}

export async function acaoCriarConvite(_e: EstadoAcao, formulario: FormData): Promise<EstadoAcao> {
  try {
    const ator = await atorAdmin()
    const entrada = z.object({ email: z.email(), nomePublico: z.string().min(2).max(120) }).parse({
      email: texto(formulario, 'email'),
      nomePublico: texto(formulario, 'nomePublico'),
    })
    const agora = new Date()
    const resultado = await criarConvite(
      getDb(),
      ator,
      { ...entrada, expiraEm: new Date(agora.getTime() + 7 * 24 * 60 * 60_000) },
      agora,
    )
    // O link sai ABSOLUTO: o convite é colado num e-mail ou mensagem, fora do
    // app, onde um caminho relativo não abre nada.
    const base = process.env.APP_PUBLIC_URL ?? ''
    return sucesso(`${base}/afiliados/convite/${resultado.token}`)
  } catch (erro) {
    return falha(mensagemDeErro(erro))
  }
}

export async function acaoCriarOferta(_e: EstadoAcao, formulario: FormData): Promise<EstadoAcao> {
  return executar('Oferta criada como rascunho.', async () => {
    const ator = await atorAdmin()
    const entrada = z
      .object({
        casaId: z.string().uuid(),
        nome: z.string().min(2).max(120),
        modalidade: z.enum(['CPA', 'REVSHARE', 'HIBRIDO']),
        moeda: z.string().regex(/^[A-Z]{3}$/),
        urlDestino: z.url({ protocol: /^https$/ }),
        hostDestino: z.string().min(3),
        status: z.literal('RASCUNHO'),
      })
      .parse({
        casaId: texto(formulario, 'casaId'),
        nome: texto(formulario, 'nome'),
        modalidade: texto(formulario, 'modalidade'),
        moeda: texto(formulario, 'moeda').toUpperCase(),
        urlDestino: texto(formulario, 'urlDestino'),
        hostDestino: texto(formulario, 'hostDestino'),
        status: texto(formulario, 'status'),
      })
    await criarOferta(getDb(), ator, entrada, new Date())
  })
}

export async function acaoCriarAcordo(_e: EstadoAcao, formulario: FormData): Promise<EstadoAcao> {
  return executar('Acordo salvo.', async () => {
    const ator = await atorAdmin()
    const entrada = z
      .object({
        parceiroId: z.string().uuid(),
        ofertaId: z.string().uuid(),
        moeda: z.string().regex(/^[A-Z]{3}$/),
        percentual: z.coerce.number().min(0).max(100),
      })
      .parse({
        parceiroId: texto(formulario, 'parceiroId'),
        ofertaId: texto(formulario, 'ofertaId'),
        moeda: texto(formulario, 'moeda').toUpperCase(),
        percentual: texto(formulario, 'percentual'),
      })
    const agora = new Date()
    await criarAcordo(
      getDb(),
      ator,
      {
        parceiroId: entrada.parceiroId,
        ofertaId: entrada.ofertaId,
        moeda: entrada.moeda,
        percentualPontosBase: Math.round(entrada.percentual * 100),
        inicio: agora,
      },
      agora,
    )
  })
}

export async function acaoCriarCampanha(_e: EstadoAcao, formulario: FormData): Promise<EstadoAcao> {
  return executar('Campanha e link criados.', async () => {
    const ator = await atorAdmin()
    const entrada = z
      .object({
        parceiroId: z.string().uuid(),
        ofertaId: z.string().uuid(),
        nome: z.string().min(2),
        canal: z.string().min(2),
        codigo: z.string().regex(/^[a-z0-9][a-z0-9-]{2,95}$/),
        tipoDestino: z.enum(['NIP', 'CASA']),
      })
      .parse({
        parceiroId: texto(formulario, 'parceiroId'),
        ofertaId: texto(formulario, 'ofertaId'),
        nome: texto(formulario, 'nome'),
        canal: texto(formulario, 'canal'),
        codigo: texto(formulario, 'codigo').toLowerCase(),
        tipoDestino: texto(formulario, 'tipoDestino'),
      })
    await criarCampanhaComLink(
      getDb(),
      ator,
      {
        ...entrada,
        caminhoNip: entrada.tipoDestino === 'NIP' ? `/oferta/${entrada.codigo}` : null,
        utms: { utm_source: 'nip', utm_medium: 'affiliate', utm_campaign: entrada.codigo },
      },
      new Date(),
    )
  })
}

export async function acaoImportar(_e: EstadoAcao, formulario: FormData): Promise<EstadoAcao> {
  return executar('Prévia gerada — confira o lote abaixo antes de confirmar.', async () => {
    const ator = await atorAdmin()
    const ofertaId = z.object({ ofertaId: z.string().uuid() }).parse({ ofertaId: texto(formulario, 'ofertaId') }).ofertaId
    const arquivo = formulario.get('arquivo')
    if (!(arquivo instanceof File) || arquivo.size === 0) throw new Error('Arquivo CSV obrigatório.')
    if (arquivo.size > 1024 * 1024) throw new Error('Arquivo maior que 1 MB.')
    await criarPreviaImportacao(
      getDb(),
      ator,
      { ofertaId, arquivoNome: arquivo.name, conteudo: await arquivo.text() },
      new Date(),
    )
  })
}

export async function acaoConfirmarImportacao(_e: EstadoAcao, formulario: FormData): Promise<EstadoAcao> {
  return executar('Importação confirmada.', async () => {
    const ator = await atorAdmin()
    const { loteId } = z.object({ loteId: z.string().uuid() }).parse({ loteId: texto(formulario, 'loteId') })
    await confirmarImportacao(getDb(), ator, loteId, new Date())
  })
}

export async function acaoRecebimento(_e: EstadoAcao, formulario: FormData): Promise<EstadoAcao> {
  return executar('Recebimento registrado.', async () => {
    const ator = await atorAdmin()
    const entrada = z
      .object({
        casaId: z.string().uuid(),
        moeda: z.string().regex(/^[A-Z]{3}$/),
        valorCentavos: z.coerce.number().int().positive(),
        referenciaExterna: z.string().min(1),
      })
      .parse({
        casaId: texto(formulario, 'casaId'),
        moeda: texto(formulario, 'moeda').toUpperCase(),
        valorCentavos: texto(formulario, 'valorCentavos'),
        referenciaExterna: texto(formulario, 'referenciaExterna'),
      })
    const agora = new Date()
    await registrarRecebimentoCasa(getDb(), ator, { ...entrada, recebidoEm: agora }, agora)
  })
}

export async function acaoLiberar(_e: EstadoAcao, formulario: FormData): Promise<EstadoAcao> {
  return executar('Comissão liberada.', async () => {
    const ator = await atorAdmin()
    const entrada = z
      .object({
        comissaoId: z.string().uuid(),
        valorCentavos: z.coerce.number().int().positive(),
        motivo: z.string().min(3),
      })
      .parse({
        comissaoId: texto(formulario, 'comissaoId'),
        valorCentavos: texto(formulario, 'valorCentavos'),
        motivo: texto(formulario, 'motivo'),
      })
    await liberarComissao(getDb(), ator, entrada, new Date())
  })
}

export async function acaoAjustarComissao(_e: EstadoAcao, formulario: FormData): Promise<EstadoAcao> {
  return executar('Ajuste registrado.', async () => {
    const ator = await atorAdmin()
    const entrada = z
      .object({
        comissaoOriginalId: z.string().uuid(),
        baseNipCentavos: z.coerce
          .number()
          .int()
          .refine((valor) => valor !== 0),
        motivo: z.string().min(3),
      })
      .parse({
        comissaoOriginalId: texto(formulario, 'comissaoOriginalId'),
        baseNipCentavos: texto(formulario, 'baseNipCentavos'),
        motivo: texto(formulario, 'motivo'),
      })
    await registrarAjusteComissao(getDb(), ator, entrada, new Date())
  })
}

export async function acaoRepasse(_e: EstadoAcao, formulario: FormData): Promise<EstadoAcao> {
  return executar('Repasse registrado.', async () => {
    const ator = await atorAdmin()
    const entrada = z
      .object({
        parceiroId: z.string().uuid(),
        liberacaoId: z.string().uuid(),
        moeda: z.string().regex(/^[A-Z]{3}$/),
        valorCentavos: z.coerce.number().int().positive(),
        referenciaExterna: z.string().min(1),
        comprovanteChave: z.string().max(240).optional(),
      })
      .parse({
        parceiroId: texto(formulario, 'parceiroId'),
        liberacaoId: texto(formulario, 'liberacaoId'),
        moeda: texto(formulario, 'moeda').toUpperCase(),
        valorCentavos: texto(formulario, 'valorCentavos'),
        referenciaExterna: texto(formulario, 'referenciaExterna'),
        comprovanteChave: texto(formulario, 'comprovanteChave') || undefined,
      })
    const agora = new Date()
    await registrarRepasse(
      getDb(),
      ator,
      {
        parceiroId: entrada.parceiroId,
        moeda: entrada.moeda,
        valorCentavos: entrada.valorCentavos,
        referenciaExterna: entrada.referenciaExterna,
        pagoEm: agora,
        comprovanteChave: entrada.comprovanteChave,
        alocacoes: [{ liberacaoId: entrada.liberacaoId, valorCentavos: entrada.valorCentavos }],
      },
      agora,
    )
  })
}

export async function acaoStatusParceiro(_e: EstadoAcao, formulario: FormData): Promise<EstadoAcao> {
  return executar('Status do parceiro atualizado.', async () => {
    const ator = await atorAdmin()
    const { id, status } = z
      .object({ id: z.string().uuid(), status: z.enum(['ATIVO', 'SUSPENSO']) })
      .parse({ id: texto(formulario, 'id'), status: texto(formulario, 'status') })
    await definirStatusParceiro(getDb(), ator, id, status, new Date())
  })
}

export async function acaoStatusLink(_e: EstadoAcao, formulario: FormData): Promise<EstadoAcao> {
  return executar('Link atualizado.', async () => {
    const ator = await atorAdmin()
    const { id } = z.object({ id: z.string().uuid() }).parse({ id: texto(formulario, 'id') })
    await definirStatusLink(getDb(), ator, id, texto(formulario, 'ativo') === 'true', new Date())
  })
}

// `linkId` vazio (o botão "Nenhuma saída") desmarca sem marcar outro — é uma
// escolha válida do admin, não erro de formulário.
export async function acaoDefinirSaidaDoApito(_e: EstadoAcao, formulario: FormData): Promise<EstadoAcao> {
  const bruto = texto(formulario, 'linkId')
  return executar(bruto ? 'Saída do apito definida.' : 'Saída do apito removida.', async () => {
    const ator = await atorAdmin()
    const linkId = bruto ? z.object({ linkId: z.string().uuid() }).parse({ linkId: bruto }).linkId : null
    await definirSaidaDoApito(getDb(), ator, linkId, new Date())
  })
}

export async function acaoStatusOferta(_e: EstadoAcao, formulario: FormData): Promise<EstadoAcao> {
  return executar('Status da oferta atualizado.', async () => {
    const ator = await atorAdmin()
    const { id, status } = z
      .object({ id: z.string().uuid(), status: z.enum(['RASCUNHO', 'ATIVA', 'PAUSADA', 'ENCERRADA']) })
      .parse({ id: texto(formulario, 'id'), status: texto(formulario, 'status') })
    const motivoHomologacao = texto(formulario, 'motivoHomologacao')
    if (status === 'ATIVA') {
      // Ativar exige homologação registrada: URL, contrato e teste de destino.
      z.object({
        homologado: z.literal('sim'),
        motivoHomologacao: z.string().min(10).max(500),
      }).parse({ homologado: texto(formulario, 'homologado'), motivoHomologacao })
    }
    await definirStatusOferta(getDb(), ator, id, status, new Date(), motivoHomologacao)
  })
}
