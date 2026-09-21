import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { isNotNull } from 'drizzle-orm'
import { bancoDeTeste } from '../../dominio/__tests__/ajuda-banco'
import { jogadores } from '../../dominio/db/schema'
import { identidadesDeApresentacao } from '../../dominio/identidade-apresentacao'
import { normalizarTexto } from '../../dominio/texto'
import { carregarRuleset } from '../../motor/ruleset/carregar'
import { semearDemo } from '../demo/semear'
import { aplicarFotos, MAPA_FOTOS, urlDaFoto } from '../demo/fotos'
import { lerListaDeNiveis } from '../niveis/parser'

const ruleset = carregarRuleset(readFileSync('config/ruleset.v1.yaml', 'utf8'))
const listaDoCj = lerListaDeNiveis(readFileSync('data/fontes/introducao-ia-nba.md', 'utf8'))

describe('fotos da demonstração', () => {
  let banco: Awaited<ReturnType<typeof bancoDeTeste>>
  beforeAll(async () => {
    banco = await bancoDeTeste()
    await semearDemo(banco.db, ruleset, new Date('2026-08-24T18:00:00.000Z'))
  }, 120_000)
  afterAll(async () => banco.fechar())

  it('todo nome do mapa resolve para um jogador semeado', async () => {
    // A foto resolve o UUID pela identidade, mesmo após corrigir o nome exibido.
    const identidades = [...(await identidadesDeApresentacao(banco.db)).values()]
    for (const [alias, personId] of Object.entries(MAPA_FOTOS)) {
      const matches = identidades.filter((i) => i.aliases.includes(alias))
      expect(matches, alias).toHaveLength(1)
      expect(matches[0]!.personId, alias).toBe(personId)
    }
  })

  it('todo nome da lista do CJ tem entrada no mapa — na grafia exata do documento', () => {
    // A identidade 04 põe rosto em todo card. Um nome fora do mapa é uma
    // silhueta no meio da Lista Secreta — e a lista do CJ é documento vivo,
    // então este teste é o que avisa quando entra um nome novo sem foto.
    //
    // Só PONTOS: `elencosDaLista` (simulacao.ts) filtra por PONTOS porque é
    // essa lista que a demo semeia como elenco — rebotes e assistências são
    // recortes de 3-4 nomes, nunca entram em quadra na simulação e por isso
    // nunca aparecem num card. Cobrir as três seções aqui pediria foto para
    // gente que a demo nunca desenha, e reabriria justamente o
    // dessincronismo que este teste existe para pegar.
    //
    // Comparação por `normalizarTexto`, não por string exata: é a mesma régua
    // que `identidadeNbaPorAlias` usa para casar alias curado com nome da
    // lista (e que `chaveDeNome`, em cadastro.ts, usa para decidir se duas
    // linhas do documento são o mesmo jogador). "Klay Thompson" e
    // "klay thompson" já caem no mesmo UUID por causa disso — cobrar uma
    // chave do mapa por STRING exata seria mais rígido que o mecanismo que
    // este teste guarda, e falharia numa diferença que a resolução real
    // nem enxerga.
    const pontos = listaDoCj.jogadores.filter((j) => j.atributo === 'PONTOS')
    expect(pontos.length).toBeGreaterThan(200)
    const chavesDoMapa = new Set(Object.keys(MAPA_FOTOS).map(normalizarTexto))
    const nomesNormalizados = new Set(pontos.map((j) => normalizarTexto(j.nomeNaLista)))
    for (const chave of nomesNormalizados) expect(chavesDoMapa.has(chave), chave).toBe(true)
  })

  it('nenhum personId se repete — dois nomes com a mesma foto é um rosto errado', () => {
    const ids = Object.values(MAPA_FOTOS).filter((id) => id !== null)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('com o CDN respondendo, pelo menos 90% dos jogadores semeados ganham foto', async () => {
    const antes = new Map(
      (await banco.db.select().from(jogadores)).map((jogador) => [jogador.id, jogador]),
    )
    const r = await aplicarFotos(banco.db, async () => true)
    expect(r.puladas).toEqual([])
    expect(r.gravadas).toBe(Object.values(MAPA_FOTOS).filter((id) => id !== null).length)
    // O único sem foto é ambiguidade declarada, não falha de curadoria.
    expect(r.semId).toEqual(['Wiggins'])

    // Denominador (e numerador) restritos a PONTOS, não aos três atributos
    // somados. `cadastro.ts` cria uma linha em `jogadores` para todo nome que
    // aparece em QUALQUER seção do documento — pontos, rebotes ou
    // assistências — porque em produção a tabela é o cadastro canônico do
    // provedor e um jogador existe nela independente de ter uma linha na
    // demo. Mas quem decide o que a demonstração DESENHA em card é
    // `elencosDaLista` (simulacao.ts), e ela filtra só PONTOS: rebotes e
    // assistências são recortes de 3-4 nomes por time que nunca entram em
    // quadra na simulação. Contar um jogador de rebotes-only ou
    // assistências-only contra a cobertura de foto mede a foto de alguém que
    // nenhum assinante jamais vê num card.
    //
    // ATENÇÃO — isto está amarrado a `niveis.atributos: [PONTOS]` no
    // ruleset (config/ruleset.v1.yaml). No dia em que REBOTES e ASSISTÊNCIAS
    // forem religados ali (quando o CJ mandar as tabelas de % e odds dos
    // dois), esses jogadores passam a aparecer em card de verdade e vão
    // genuinamente precisar de foto — este filtro (e o `MAPA_FOTOS`) têm que
    // ser revisitados junto com a religação, não deixados para trás.
    //
    // A comparação usa `identidadesDeApresentacao` (mesma projeção da
    // primeira asserção deste describe) porque `jogadores.nomeCompleto` já
    // pode ser o nome OFICIAL da curadoria (ex.: "Shai" na lista vira "Shai
    // Gilgeous-Alexander" em `nomeCompleto`) — comparar direto com o nome da
    // lista perderia justamente os jogadores curados, que são a maioria do
    // `MAPA_FOTOS`. `aliases` inclui todo `mapaJogadores.nomeNaLista`
    // confirmado, então cobre a grafia exata da lista independente de
    // curadoria, e `normalizarTexto` é a mesma régua de `chaveDeNome`
    // (cadastro.ts) usada para gerar esses aliases.
    const pontos = listaDoCj.jogadores.filter((j) => j.atributo === 'PONTOS')
    const nomesPontos = new Set(pontos.map((j) => normalizarTexto(j.nomeNaLista)))
    const identidades = await identidadesDeApresentacao(banco.db)
    const idsPontos = new Set(
      [...identidades]
        .filter(([, i]) => i.aliases.some((alias) => nomesPontos.has(normalizarTexto(alias))))
        .map(([id]) => id),
    )

    const [todos, comFoto] = await Promise.all([
      banco.db.select().from(jogadores),
      banco.db.select().from(jogadores).where(isNotNull(jogadores.fotoUrl)),
    ])
    const todosPontos = todos.filter((jogador) => idsPontos.has(jogador.id))
    const comFotoPontos = comFoto.filter((jogador) => idsPontos.has(jogador.id))
    expect(comFotoPontos.length / todosPontos.length).toBeGreaterThanOrEqual(0.9)
    for (const jogador of todos) {
      const original = antes.get(jogador.id)!
      // Somente a URL muda: UUID, nome, time e todos os demais dados ficam.
      expect({ ...jogador, fotoUrl: original.fotoUrl }).toEqual(original)
    }
  })

  it('só grava URL que o verificador aprovou', async () => {
    // Limpa o que o teste anterior gravou: aqui o verificador aprova UMA url.
    await banco.db.update(jogadores).set({ fotoUrl: null })
    const aprovadas = new Set([urlDaFoto(MAPA_FOTOS['Shai']!)])
    const r = await aplicarFotos(banco.db, async (url) => aprovadas.has(url))
    expect(r.gravadas).toBe(1)
    const comId = Object.values(MAPA_FOTOS).filter((id) => id !== null).length
    expect(r.puladas.length).toBe(comId - 1)
    const comFoto = await banco.db.select().from(jogadores).where(isNotNull(jogadores.fotoUrl))
    expect(comFoto).toHaveLength(1)
    expect(comFoto[0]!.fotoUrl).toContain('cdn.nba.com')
  })

  it('uma falha de rede deixa só aquela foto pendente e permite preencher o restante', async () => {
    await banco.db.update(jogadores).set({ fotoUrl: null })
    const indisponivel = urlDaFoto(MAPA_FOTOS['Brunson']!)
    const resultado = await aplicarFotos(banco.db, async (url) => {
      if (url === indisponivel) throw new TypeError('fetch failed')
      return true
    })

    expect(resultado.puladas).toEqual(['Brunson'])
    expect(resultado.semId).toEqual(['Wiggins'])
    const comId = Object.values(MAPA_FOTOS).filter((id) => id !== null).length
    expect(resultado.gravadas).toBe(comId - 1)
    const comFoto = await banco.db.select().from(jogadores).where(isNotNull(jogadores.fotoUrl))
    expect(comFoto).toHaveLength(comId - 1)
  })
})
