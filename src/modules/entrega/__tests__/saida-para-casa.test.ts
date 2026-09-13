import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bancoDeTeste } from '@/modules/dominio/__tests__/ajuda-banco'
import {
  campanhasAfiliados,
  linksAfiliados,
  ofertasAfiliados,
  parceirosAfiliados,
  usuarios,
} from '@/modules/dominio/db/schema'
import {
  criarCampanhaComLink,
  criarCasaComercial,
  criarOferta,
  criarParceiro,
  definirSaidaDoApito,
  type AtorAfiliados,
} from '@/modules/plataforma/afiliados/servico'

import { saidaDoApito } from '../saida-para-casa'

/**
 * A SAÍDA DO APITO — o único link que o detalhe oferece como porta para a
 * casa parceira (spec 12/09, §5.4). Continua ADR-0004: a função só LÊ o que
 * o admin marcou; nunca escolhe por heurística.
 */

let banco: Awaited<ReturnType<typeof bancoDeTeste>>

beforeAll(async () => {
  banco = await bancoDeTeste()
})

afterAll(async () => {
  await banco?.fechar()
})

// Parceiro → oferta ATIVA → campanha (ATIVA por padrão) → dois links ativos,
// pelos mesmos serviços que o admin usa. A oferta nasce RASCUNHO no serviço;
// a homologação completa (acordo + motivo) é regra de OUTRO módulo — aqui
// importa só o `status` que `saidaDoApito` lê, então vira ATIVA por update
// direto, como o próprio teste da tela pausa a oferta mais abaixo.
async function semear() {
  const sufixo = Math.random().toString(36).slice(2)
  const [admin] = await banco.db
    .insert(usuarios)
    .values({ email: `admin-saida-${sufixo}@teste.com`, senhaHash: 'x', papel: 'ADMIN' })
    .returning()
  const ator: AtorAfiliados = { usuarioId: admin!.id, papel: 'ADMIN' }
  const agora = new Date('2026-09-12T00:00:00.000Z')

  const casa = await criarCasaComercial(banco.db, ator, `Casa da saída ${sufixo}`, agora)
  const oferta = await criarOferta(
    banco.db,
    ator,
    {
      casaId: casa.id,
      nome: `Oferta da saída ${sufixo}`,
      modalidade: 'HIBRIDO',
      moeda: 'BRL',
      urlDestino: 'https://casa-saida.test/nba',
      hostDestino: 'casa-saida.test',
    },
    agora,
  )
  await banco.db
    .update(ofertasAfiliados)
    .set({ status: 'ATIVA' })
    .where(eq(ofertasAfiliados.id, oferta.id))

  const parceiro = await criarParceiro(
    banco.db,
    ator,
    { codigo: `parceiro-saida-${sufixo}`, nomePublico: 'Parceiro da saída' },
    agora,
  )
  const link1 = await criarCampanhaComLink(
    banco.db,
    ator,
    {
      parceiroId: parceiro.id,
      ofertaId: oferta.id,
      nome: `Campanha saída 1 ${sufixo}`,
      canal: 'SOCIAL',
      codigo: `saida-link-1-${sufixo}`,
      tipoDestino: 'CASA',
    },
    agora,
  )
  const link2 = await criarCampanhaComLink(
    banco.db,
    ator,
    {
      parceiroId: parceiro.id,
      ofertaId: oferta.id,
      nome: `Campanha saída 2 ${sufixo}`,
      canal: 'SOCIAL',
      codigo: `saida-link-2-${sufixo}`,
      tipoDestino: 'CASA',
    },
    agora,
  )
  return { ator, oferta, link1, link2 }
}

describe('saída do apito para a casa parceira', () => {
  it('sem link marcado, não há saída — a tela não inventa destino', async () => {
    await semear()
    expect(await saidaDoApito(banco.db)).toBeNull()
  })

  it('marcar um link o torna a saída; marcar outro desmarca o anterior (só existe um)', async () => {
    const { ator, oferta, link1, link2 } = await semear()
    await definirSaidaDoApito(banco.db, ator, link1.id, new Date())
    expect(await saidaDoApito(banco.db)).toEqual({ codigo: link1.codigo, rotulo: oferta.nome })
    await definirSaidaDoApito(banco.db, ator, link2.id, new Date())
    expect((await saidaDoApito(banco.db))?.codigo).toBe(link2.codigo)
    const marcados = await banco.db
      .select()
      .from(linksAfiliados)
      .where(eq(linksAfiliados.saidaDoApito, true))
    expect(marcados).toHaveLength(1)
  })

  // As QUATRO condições de "tudo ativo" são a invariante desta task — cada
  // uma isolada, com as outras três de pé, para que nenhuma vire trava
  // fantasma: um refactor que derrubasse o filtro de `ativo` ou o de
  // campanha não seria pego por um teste que só mexe em oferta ou parceiro.

  it('link inativo não serve de saída mesmo com campanha e oferta ativas', async () => {
    const { ator, link1 } = await semear()
    await definirSaidaDoApito(banco.db, ator, link1.id, new Date())
    await banco.db
      .update(linksAfiliados)
      .set({ ativo: false })
      .where(eq(linksAfiliados.id, link1.id))
    expect(await saidaDoApito(banco.db)).toBeNull()
  })

  it('campanha não-ATIVA não serve de saída mesmo com link e oferta ativos', async () => {
    const { ator, link1 } = await semear()
    await definirSaidaDoApito(banco.db, ator, link1.id, new Date())
    await banco.db
      .update(campanhasAfiliados)
      .set({ status: 'PAUSADA' })
      .where(eq(campanhasAfiliados.id, link1.campanhaId))
    expect(await saidaDoApito(banco.db)).toBeNull()
  })

  it('oferta pausada não serve de saída mesmo com link e campanha ativos', async () => {
    const { ator, oferta, link2 } = await semear()
    await definirSaidaDoApito(banco.db, ator, link2.id, new Date())
    await banco.db
      .update(ofertasAfiliados)
      .set({ status: 'PAUSADA' })
      .where(eq(ofertasAfiliados.id, oferta.id))
    expect(await saidaDoApito(banco.db)).toBeNull()
  })

  // Achado da revisão final: suspender um parceiro pelo painel não desativa
  // os links dele — sem este filtro, o CTA continuava desenhado e cada
  // toque caía em `/oferta-indisponivel`.
  it('parceiro suspenso não serve de saída mesmo com link, campanha e oferta ativos', async () => {
    const { ator, link1 } = await semear()
    await definirSaidaDoApito(banco.db, ator, link1.id, new Date())
    await banco.db
      .update(parceirosAfiliados)
      .set({ status: 'SUSPENSO' })
      .where(eq(parceirosAfiliados.id, link1.campanha.parceiroId))
    expect(await saidaDoApito(banco.db)).toBeNull()
  })
})
