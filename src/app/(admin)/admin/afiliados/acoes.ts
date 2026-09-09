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
  definirStatusLink,
  definirStatusOferta,
  definirStatusParceiro,
  liberarComissao,
  registrarRecebimentoCasa,
  registrarAjusteComissao,
  registrarRepasse,
  type AtorAfiliados,
} from '@/modules/plataforma/afiliados/servico'

async function atorAdmin(): Promise<AtorAfiliados> {
  const sessao = await exigirAdmin()
  if (!sessao) throw new Error('Acesso administrativo exigido')
  return { usuarioId: sessao.usuarioId, papel: 'ADMIN' }
}

function texto(formulario: FormData, chave: string): string {
  return String(formulario.get(chave) ?? '').trim()
}

function atualizar() {
  revalidatePath('/admin/afiliados')
  revalidatePath('/afiliados')
}

export async function acaoCriarCasa(formulario: FormData): Promise<void> {
  const ator = await atorAdmin()
  const nome = z.string().min(2).max(120).parse(texto(formulario, 'nome'))
  await criarCasaComercial(getDb(), ator, nome, new Date())
  atualizar()
}

export async function acaoCriarParceiro(formulario: FormData): Promise<void> {
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
  atualizar()
}

export type EstadoConvite = { erro: string | null; link: string | null }

export async function acaoCriarConvite(
  _estado: EstadoConvite,
  formulario: FormData,
): Promise<EstadoConvite> {
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
    return { erro: null, link: `/afiliados/convite/${resultado.token}` }
  } catch (erro) {
    return {
      erro: erro instanceof Error ? erro.message : 'Não foi possível criar o convite.',
      link: null,
    }
  }
}

export async function acaoCriarOferta(formulario: FormData): Promise<void> {
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
  atualizar()
}

export async function acaoCriarAcordo(formulario: FormData): Promise<void> {
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
  atualizar()
}

export async function acaoCriarCampanha(formulario: FormData): Promise<void> {
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
  atualizar()
}

export async function acaoImportar(formulario: FormData): Promise<void> {
  const ator = await atorAdmin()
  const ofertaId = z.string().uuid().parse(texto(formulario, 'ofertaId'))
  const arquivo = formulario.get('arquivo')
  if (!(arquivo instanceof File) || arquivo.size === 0) throw new Error('Arquivo CSV obrigatório')
  if (arquivo.size > 1024 * 1024) throw new Error('Arquivo maior que 1 MB')
  await criarPreviaImportacao(
    getDb(),
    ator,
    {
      ofertaId,
      arquivoNome: arquivo.name,
      conteudo: await arquivo.text(),
    },
    new Date(),
  )
  atualizar()
}

export async function acaoConfirmarImportacao(formulario: FormData): Promise<void> {
  const ator = await atorAdmin()
  await confirmarImportacao(
    getDb(),
    ator,
    z.string().uuid().parse(texto(formulario, 'loteId')),
    new Date(),
  )
  atualizar()
}

export async function acaoRecebimento(formulario: FormData): Promise<void> {
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
  atualizar()
}

export async function acaoLiberar(formulario: FormData): Promise<void> {
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
  atualizar()
}

export async function acaoAjustarComissao(formulario: FormData): Promise<void> {
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
  atualizar()
}

export async function acaoRepasse(formulario: FormData): Promise<void> {
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
  atualizar()
}

export async function acaoStatusParceiro(formulario: FormData): Promise<void> {
  const ator = await atorAdmin()
  const id = z.string().uuid().parse(texto(formulario, 'id'))
  const status = z.enum(['ATIVO', 'SUSPENSO']).parse(texto(formulario, 'status'))
  await definirStatusParceiro(getDb(), ator, id, status, new Date())
  atualizar()
}

export async function acaoStatusLink(formulario: FormData): Promise<void> {
  const ator = await atorAdmin()
  const id = z.string().uuid().parse(texto(formulario, 'id'))
  await definirStatusLink(getDb(), ator, id, texto(formulario, 'ativo') === 'true', new Date())
  atualizar()
}

export async function acaoStatusOferta(formulario: FormData): Promise<void> {
  const ator = await atorAdmin()
  const id = z.string().uuid().parse(texto(formulario, 'id'))
  const status = z
    .enum(['RASCUNHO', 'ATIVA', 'PAUSADA', 'ENCERRADA'])
    .parse(texto(formulario, 'status'))
  const motivoHomologacao = texto(formulario, 'motivoHomologacao')
  if (status === 'ATIVA') {
    z.literal('sim').parse(texto(formulario, 'homologado'))
    z.string().min(10).max(500).parse(motivoHomologacao)
  }
  await definirStatusOferta(getDb(), ator, id, status, new Date(), motivoHomologacao)
  atualizar()
}
