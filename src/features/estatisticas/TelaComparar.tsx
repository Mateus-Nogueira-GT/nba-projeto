import Link from 'next/link'

import { maisAntiga } from '@/modules/entrega/estatisticas/atualizacao'
import { rotaDaComparacao, rotaDoJogador, rotaDoJogo, rotaDoTime } from '@/modules/entrega/estatisticas/rotas'
import { Segmentado } from '@/ui/controles'
import { AVISO_TEMPORADA_ANTERIOR, SeletorTemporada } from '@/ui/SeletorTemporada'
import { FotoJogador, LogoTime } from '@/ui/midia'
import { IconeBusca } from '@/ui/icones'
import { FaixaAviso } from '@/ui/blocos'
import blocos from '@/ui/blocos.module.css'
import { CabecalhoStats, SecaoStats, Silhueta, UltimaAtualizacao } from './Comum'
import { GraficoDesempenho } from './GraficoDesempenho'
import type { DadosDaComparacao, LadoJogador, LadoTime, MediasDoTime } from './comparar'
import { aproveitamento, diaMes, melhorDaLinha, num, pct, type Vencedor } from './regras'
import s from './Comparar.module.css'

export type Linha = { rotulo: string; a: number | null; b: number | null; formato: (v: number | null) => string; menorEhMelhor?: boolean }

/**
 * Uma linha da tabela lado a lado: A à esquerda, B à direita, o melhor marcado.
 * O destaque é cor; o leitor de tela ouve "(melhor)" no lado vencedor.
 */
export function LinhaComparada({ l }: { l: Linha }) {
  const vencedor: Vencedor = melhorDaLinha(l.a, l.b, l.menorEhMelhor)
  const melhor = <span className="so-leitor"> (melhor)</span>
  return (
    <li className={s.linha} data-vencedor={vencedor ?? undefined}>
      <span className={`${s.valor} num`} data-lado="a" data-melhor={vencedor === 'a' || undefined}>
        {l.formato(l.a)}
        {vencedor === 'a' && melhor}
      </span>
      <span className={s.rotulo}>{l.rotulo}</span>
      <span className={`${s.valor} num`} data-lado="b" data-melhor={vencedor === 'b' || undefined}>
        {l.formato(l.b)}
        {vencedor === 'b' && melhor}
      </span>
    </li>
  )
}

function linhasDoJogador(a: LadoJogador, b: LadoJogador): Linha[] {
  const na = a.tela.perfilNumeros
  const nb = b.tela.perfilNumeros
  return [
    { rotulo: 'Pontos', a: na.ataque.pontos, b: nb.ataque.pontos, formato: num },
    { rotulo: 'Rebotes', a: na.defesa.rebotesTotal, b: nb.defesa.rebotesTotal, formato: num },
    { rotulo: 'Assistências', a: na.ataque.assistencias, b: nb.ataque.assistencias, formato: num },
    { rotulo: 'Minutos', a: na.posse.minutos, b: nb.posse.minutos, formato: num },
    { rotulo: 'FG%', a: na.ataque.fgPercentual, b: nb.ataque.fgPercentual, formato: pct },
    { rotulo: '3P%', a: na.ataque.tresPercentual, b: nb.ataque.tresPercentual, formato: pct },
    { rotulo: 'LL%', a: na.ataque.lancePercentual, b: nb.ataque.lancePercentual, formato: pct },
    { rotulo: 'Roubos', a: na.defesa.roubos, b: nb.defesa.roubos, formato: num },
    { rotulo: 'Tocos', a: na.defesa.bloqueios, b: nb.defesa.bloqueios, formato: num },
    { rotulo: 'Erros', a: na.posse.turnovers, b: nb.posse.turnovers, formato: num, menorEhMelhor: true },
    { rotulo: 'Faltas', a: na.posse.faltas, b: nb.posse.faltas, formato: num, menorEhMelhor: true },
  ]
}

function linhasDoTime(a: LadoTime, b: LadoTime): Linha[] {
  const ca = a.tela.campanha
  const cb = b.tela.campanha
  const ma: MediasDoTime = a.medias
  const mb: MediasDoTime = b.medias
  return [
    { rotulo: 'Vitórias', a: ca?.vitorias ?? null, b: cb?.vitorias ?? null, formato: num },
    { rotulo: 'Derrotas', a: ca?.derrotas ?? null, b: cb?.derrotas ?? null, formato: num, menorEhMelhor: true },
    { rotulo: 'Aproveitamento', a: ca?.aproveitamento ?? null, b: cb?.aproveitamento ?? null, formato: aproveitamento },
    { rotulo: 'Pontos marcados', a: ma.pontosMarcados, b: mb.pontosMarcados, formato: num },
    { rotulo: 'Pontos cedidos', a: ma.pontosCedidos, b: mb.pontosCedidos, formato: num, menorEhMelhor: true },
    { rotulo: 'Rebotes', a: ma.rebotes, b: mb.rebotes, formato: num },
    { rotulo: 'Assistências', a: ma.assistencias, b: mb.assistencias, formato: num },
    { rotulo: 'Bolas de 3 tentadas', a: ma.tresTentadas, b: mb.tresTentadas, formato: num },
    { rotulo: 'Bolas de 3 convertidas', a: ma.tresConvertidas, b: mb.tresConvertidas, formato: num },
    { rotulo: 'Erros', a: ma.erros, b: mb.erros, formato: num, menorEhMelhor: true },
  ]
}

export function TelaComparar({ dados }: { dados: DadosDaComparacao }) {
  const { tipo, seletor, fuso, fusoDia } = dados
  const idA = ladoId(dados.a)
  const idB = dados.modo === 'comparacao' ? ladoId(dados.b) : undefined
  // Período (só jogadores) e temporada escolhida viajam em todo link da tela.
  const periodo = dados.periodo
  const escolhida = seletor.escolhida
  const contextoDe = (t: string | undefined) => ({
    ...(periodo ? { periodo } : {}),
    ...(t ? { temporada: t } : {}),
  })
  const voltarPara = rotaDaComparacao(tipo, idA, idB, contextoDe(escolhida))
  const cabecalho = (lado: LadoJogador | LadoTime, posicao: 'a' | 'b') =>
    'perfil' in lado.tela ? (
      <Link href={rotaDoJogador(lado.tela.perfil.id)} className={s.lado} data-lado={posicao}>
        <FotoJogador fotoUrl={lado.tela.perfil.fotoUrl} nome={lado.tela.perfil.nome} tamanho={56} />
        <strong>{lado.tela.perfil.nome}</strong>
        <span className={s.fraco}>{[lado.tela.perfil.timeSigla, lado.tela.perfil.posicao].filter(Boolean).join(' · ')}</span>
      </Link>
    ) : (
      <Link href={rotaDoTime(lado.tela.time.id)} className={s.lado} data-lado={posicao}>
        <LogoTime sigla={lado.tela.time.sigla} tamanho={56} />
        <strong>{lado.tela.time.nome}</strong>
        <span className={s.fraco}>{lado.tela.campanha ? `${lado.tela.campanha.vitorias}–${lado.tela.campanha.derrotas}` : 'sem campanha'}</span>
      </Link>
    )

  return (
    <article className={s.pagina} aria-label="Comparação">
      <CabecalhoStats sobretitulo="Estatísticas" titulo={tipo === 'jogador' ? 'Comparar jogadores' : 'Comparar times'} voltar={{ href: '/estatisticas', rotulo: 'Estatísticas' }} />
      <SeletorTemporada
        temporadas={seletor.disponiveis}
        atual={seletor.temporada}
        hrefDe={(t) => rotaDaComparacao(tipo, idA, idB, contextoDe(t))}
      />
      {seletor.retroativa && <FaixaAviso>{AVISO_TEMPORADA_ANTERIOR}</FaixaAviso>}

      <header className={s.topo}>
        {cabecalho(dados.a, 'a')}
        <span className={s.versus} aria-hidden>×</span>
        {dados.modo === 'comparacao' ? cabecalho(dados.b, 'b') : <EscolhaDoSegundo dados={dados} />}
      </header>

      {dados.modo === 'comparacao' && !dados.profundidade && (
        <Silhueta forma="numeros" recurso="A comparação lado a lado" voltar={voltarPara} />
      )}

      {dados.modo === 'comparacao' && dados.profundidade && dados.tipo === 'jogador' && (
        <>
          <SecaoStats titulo="Médias da temporada" aux="por jogo">
            <ul className={s.linhas}>{linhasDoJogador(dados.a, dados.b).map((l) => <LinhaComparada key={l.rotulo} l={l} />)}</ul>
          </SecaoStats>
          <SecaoStats titulo="Forma recente" aux={rotuloDoPeriodo(dados.contexto.periodo)}>
            <Segmentado
              rotulo="Período da forma recente"
              opcoes={(['5', '10', 'temporada'] as const).map((p) => ({
                valor: p,
                rotulo: p === 'temporada' ? 'Temporada' : `Últimos ${p}`,
                href: rotaDaComparacao('jogador', idA, idB, { periodo: p, ...(escolhida ? { temporada: escolhida } : {}) }),
                ativo: dados.contexto.periodo === p,
              }))}
            />
            <div className={s.formas}>
              {[dados.a, dados.b].map((lado, i) => (
                <figure key={i} className={s.forma}>
                  <figcaption className={s.legenda}>{lado.tela.perfil.nome}</figcaption>
                  <GraficoDesempenho historico={lado.tela.historico} atributo={dados.contexto.atributo} fuso={fusoDia} hrefDoJogo={rotaDoJogo} />
                </figure>
              ))}
            </div>
          </SecaoStats>
        </>
      )}

      {dados.modo === 'comparacao' && dados.profundidade && dados.tipo === 'time' && (
        <>
          <SecaoStats titulo="Campanha e médias" aux={auxDasMedias(dados.a, dados.b)}>
            <ul className={s.linhas}>{linhasDoTime(dados.a, dados.b).map((l) => <LinhaComparada key={l.rotulo} l={l} />)}</ul>
          </SecaoStats>
          <SecaoStats titulo="Jogos entre eles" aux={`${dados.a.tela.time.sigla} ${dados.confrontos.vitoriasA} × ${dados.confrontos.vitoriasB} ${dados.b.tela.time.sigla}`}>
            {dados.confrontos.jogos.length === 0 ? (
              <p className={s.fraco}>Os dois ainda não se enfrentaram nesta temporada.</p>
            ) : (
              <ul className={s.confrontos}>
                {dados.confrontos.jogos.map((j) => (
                  <li key={j.jogoId}>
                    <Link href={rotaDoJogo(j.jogoId)}>
                      <span className="num">{diaMes(j.data, fusoDia)}</span>
                      <span>
                        {vencedorDoJogo(j) === 'casa' ? <strong>{j.siglaCasa}</strong> : j.siglaCasa}{' '}
                        <span className="num">{j.placarCasa}–{j.placarVisitante}</span>{' '}
                        {vencedorDoJogo(j) === 'visitante' ? <strong>{j.siglaVisitante}</strong> : j.siglaVisitante}
                      </span>
                      <span className={s.fraco}>
                        {vencedorDoJogo(j) === null ? 'sem vencedor' : `vitória de ${vencedorDoJogo(j) === 'casa' ? j.siglaCasa : j.siglaVisitante}`}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </SecaoStats>
        </>
      )}

      {dados.modo === 'comparacao' && (
        // A comparação é tão atual quanto o lado mais velho.
        <UltimaAtualizacao {...maisAntiga([dados.a.tela.atualizacao, dados.b.tela.atualizacao])} agora={dados.agora} fuso={fuso} />
      )}
    </article>
  )
}

function ladoId(lado: LadoJogador | LadoTime): string {
  return 'perfil' in lado.tela ? lado.tela.perfil.id : lado.tela.time.id
}

/** As médias dos times vêm só de jogos encerrados; a seção diz de quantos. */
function auxDasMedias(a: LadoTime, b: LadoTime): string {
  const jogos = (n: number) => `${n} ${n === 1 ? 'jogo encerrado' : 'jogos encerrados'}`
  if (a.medias.jogos === b.medias.jogos) return `médias por jogo dos últimos ${jogos(a.medias.jogos)}`
  return `médias por jogo dos últimos ${jogos(a.medias.jogos)} (${a.tela.time.sigla}) e ${jogos(b.medias.jogos)} (${b.tela.time.sigla})`
}

function rotuloDoPeriodo(periodo: '5' | '10' | 'temporada'): string {
  return periodo === 'temporada' ? 'temporada inteira' : `últimos ${periodo} jogos`
}

/** O lado B vazio: a busca filtrada pelo tipo; cada resultado completa a URL. */
function EscolhaDoSegundo({ dados }: { dados: Extract<DadosDaComparacao, { modo: 'escolha' }> }) {
  const a = ladoId(dados.a)
  return (
    <div className={s.escolha} data-lado="b">
      <form action="/estatisticas/comparar" method="get" role="search" className={s.busca}>
        <input type="hidden" name="tipo" value={dados.tipo} />
        <input type="hidden" name="a" value={a} />
        {dados.seletor.escolhida && <input type="hidden" name="temporada" value={dados.seletor.escolhida} />}
        {dados.periodo && <input type="hidden" name="periodo" value={dados.periodo} />}
        <label htmlFor="busca-comparar">Comparar com</label>
        <span className={s.campo}>
          <IconeBusca tamanho={18} />
          <input id="busca-comparar" name="q" defaultValue={dados.termo} placeholder={dados.tipo === 'jogador' ? 'Buscar jogador' : 'Buscar time'} />
        </span>
        {/* Mesmo desenho do BotaoSecundario (que é link, não submit). */}
        <button type="submit" className={`${blocos.secundario} ${s.botaoBuscar}`}>Buscar</button>
      </form>
      {dados.termo && dados.resultados.length === 0 && <p className={s.fraco}>Nada encontrado para “{dados.termo}”.</p>}
      <ul className={s.resultados}>
        {dados.resultados.map((r) => (
          <li key={r.id}>
            <Link
              href={rotaDaComparacao(dados.tipo, a, r.id, {
                ...(dados.periodo ? { periodo: dados.periodo } : {}),
                ...(dados.seletor.escolhida ? { temporada: dados.seletor.escolhida } : {}),
              })}
            >
              {r.nome}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Quem venceu o jogo, pelo placar. Sem placar completo ou empate: ninguém. */
function vencedorDoJogo(j: { placarCasa: number | null; placarVisitante: number | null }): 'casa' | 'visitante' | null {
  if (j.placarCasa === null || j.placarVisitante === null || j.placarCasa === j.placarVisitante) return null
  return j.placarCasa > j.placarVisitante ? 'casa' : 'visitante'
}
