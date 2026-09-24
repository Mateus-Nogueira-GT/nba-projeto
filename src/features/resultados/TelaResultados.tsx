import Link from 'next/link'
import { rotaDoJogador } from '@/modules/entrega/estatisticas/rotas'
import { rotaResultados, type JogoEncerradoResumo } from '@/modules/entrega/resultados'
import type { Atributo, NivelApito } from '@/modules/motor/tipos'
import { EstadoVazio, NumeroGrande } from '@/ui/blocos'
import { Abas } from '@/ui/controles'
import { contar, decimal, diaDaRodada, hora, linha as fmtLinha } from '@/ui/formato'
import { Minigrafico } from '@/ui/graficos'
import { IconeAvancar, IconeVoltar } from '@/ui/icones'
import {
  ATRIBUTO_CURTO,
  corDoApito,
  IndicadorApito,
  ROTULO_ATRIBUTO,
  SeloAoVivo,
  SeloModoFire,
  SeloNivel, PilulaOdd } from '@/ui/marcas'
import { FotoJogador, LogoTime } from '@/ui/midia'
import { oddDaLinha } from '@/ui/odd'
import { identidadeDoTime } from '@/ui/times'
import type { CardConferido, DadosDosResultados, JogoDaNoite, LinhaDoPlacar, PlacarDoNip } from './carregar'
import s from './Resultados.module.css'

/** A unidade escrita depois do número ("25 pontos") — nunca antes, que é a gramática da linha. */
const UNIDADE: Record<Atributo, string> = {
  PONTOS: 'pontos',
  REBOTES: 'rebotes',
  ASSISTENCIAS: 'assistências',
}

/** Percentual inteiro. A taxa da noite e a da temporada nunca são % de confiança. */
const inteiro = (taxa: number) => `${Math.round(taxa * 100)}%`

const dataHora = (quando: Date, fuso: string) =>
  quando.toLocaleString('pt-BR', { timeZone: fuso, dateStyle: 'short', timeStyle: 'short' })

type Veredito = 'bateu' | 'falhou' | 'dnp' | 'aguardando' | 'pre' | 'vivo'

const ROTULO_VEREDITO: Record<Veredito, string> = {
  bateu: 'Bateu',
  falhou: 'Não bateu',
  dnp: 'DNP · neutro',
  aguardando: 'Aguardando oficial',
  pre: 'Pré-jogo',
  vivo: 'Em andamento',
}

function vereditoDe(c: CardConferido, j: JogoDaNoite): Veredito {
  if (j.conferido) {
    if (c.card.fez === null) return 'dnp'
    return c.card.bateuLinhaMaisBaixa === true ? 'bateu' : 'falhou'
  }
  if (j.estado === 'AGUARDANDO_OFICIAL') return 'aguardando'
  if (j.estado === 'PRE') return 'pre'
  return 'vivo'
}

function Selo({ v }: { v: Veredito }) {
  return (
    <span className={s.veredito} data-v={v}>
      {v === 'bateu' && <span aria-hidden>✓</span>}
      {v === 'falhou' && <span aria-hidden>✕</span>}
      {ROTULO_VEREDITO[v]}
    </span>
  )
}

function Cabecalho({ d }: { d: DadosDosResultados }) {
  return (
    <header className={s.cabecalho}>
      <div className={s.cabecalhoTexto}>
        <span className="sobretitulo-marca">Resultados da rodada</span>
        <h1 className="titulo-marca">{diaDaRodada(d.data)}</h1>
      </div>
      <nav className={s.setas} aria-label="Navegar entre rodadas">
        <Link href={d.anterior} className={s.seta} aria-label="Rodada anterior">
          <IconeVoltar tamanho={18} />
        </Link>
        {d.proxima === null ? (
          <span className={s.seta} aria-disabled="true" aria-label="Próxima rodada (indisponível)">
            <IconeAvancar tamanho={18} />
          </span>
        ) : (
          <Link href={d.proxima} className={s.seta} aria-label="Próxima rodada">
            <IconeAvancar tamanho={18} />
          </Link>
        )}
        <Link href="/" className={s.hoje}>
          Lista de hoje
        </Link>
      </nav>
    </header>
  )
}

function Filtros({ d }: { d: DadosDosResultados }) {
  const f = d.filtros
  return (
    <div className={s.filtros}>
      <Abas
        rotulo="Estratégia"
        abas={[
          { chave: 'todas', rotulo: 'Todas', href: rotaResultados(d.data, { ...f, estrategia: undefined }), ativo: !f.estrategia },
          {
            chave: 'lista',
            rotulo: 'Lista Secreta',
            href: rotaResultados(d.data, { ...f, estrategia: 'LISTA_SECRETA' }),
            ativo: f.estrategia === 'LISTA_SECRETA',
          },
          {
            chave: 'fire',
            rotulo: 'Fire Live',
            href: rotaResultados(d.data, { ...f, estrategia: 'FIRE_LIVE' }),
            ativo: f.estrategia === 'FIRE_LIVE',
          },
        ]}
      />
      <form action={`/resultados/${d.data}`} className={s.formFiltros} aria-label="Filtros de resultados">
        {f.estrategia && <input type="hidden" name="estrategia" value={f.estrategia} />}
        <div className={s.campo}>
          <label htmlFor="filtro-atributo">Atributo</label>
          <select id="filtro-atributo" name="atributo" defaultValue={f.atributo ?? ''}>
            <option value="">Todos</option>
            {(Object.keys(ROTULO_ATRIBUTO) as Atributo[]).map((a) => (
              <option key={a} value={a}>
                {ROTULO_ATRIBUTO[a]}
              </option>
            ))}
          </select>
        </div>
        <div className={s.campo}>
          <label htmlFor="filtro-time">Time da curadoria NIP</label>
          <select id="filtro-time" name="time" defaultValue={f.timeId ?? ''}>
            <option value="">Todos</option>
            {d.times.map((t) => (
              <option key={t.id} value={t.id}>
                {identidadeDoTime(t.sigla).nome}
              </option>
            ))}
          </select>
        </div>
        <div className={s.acoesFiltro}>
          <button type="submit" className={s.primario}>
            Aplicar
          </button>
          {(f.atributo || f.timeId) && (
            <Link href={rotaResultados(d.data, { estrategia: f.estrategia })} className={s.limpar}>
              Limpar
            </Link>
          )}
        </div>
      </form>
    </div>
  )
}

/**
 * A NOITE em números. "Bateram" e "Na noite" são taxas de conferência — nunca
 * dividem espaço com um % de confiança. A taxa é sobre os CONFERIDOS (DNP é
 * neutro), e quando a base difere do que está em tela ela vem escrita.
 */
function Numeros({ d }: { d: DadosDosResultados }) {
  const { recap, temporada } = d
  const rotuloTaxa = d.filtrado ? 'Nos filtros' : 'Na noite'
  return (
    <dl className={s.numeros}>
      <NumeroGrande rotulo="Apitos" valor={String(recap.publicados)} />
      <NumeroGrande
        rotulo="Bateram"
        valor={recap.conferidos === 0 ? '—' : String(recap.bateram)}
        tom={recap.conferidos === 0 ? 'neutro' : 'bom'}
      />
      {d.emCurso ? (
        <NumeroGrande rotulo={rotuloTaxa} valor="—" apoio="aguardando o fim da noite" />
      ) : (
        <NumeroGrande
          rotulo={rotuloTaxa}
          valor={recap.taxa === null ? '—' : inteiro(recap.taxa)}
          apoio={
            recap.taxa !== null && (d.filtrado || recap.conferidos !== recap.publicados)
              ? `${recap.bateram} de ${recap.conferidos}`
              : undefined
          }
        />
      )}
      <NumeroGrande
        rotulo="Temporada"
        valor={temporada.conferidos === 0 ? '—' : `${decimal((temporada.acertos / temporada.conferidos) * 100)}%`}
        apoio={`${temporada.acertos.toLocaleString('pt-BR')} de ${temporada.conferidos.toLocaleString('pt-BR')} · ${contar(temporada.rodadas, 'rodada')}`}
      />
    </dl>
  )
}

function TabelaDoPlacar({ titulo, linhas }: { titulo: string; linhas: LinhaDoPlacar[] }) {
  const comDado = linhas.filter((l) => l.total > 0)
  return (
    <div className={s.nipBloco}>
      <p className={s.nipTitulo}>{titulo}</p>
      {comDado.length === 0 ? (
        <p className={s.nipVazio}>Ainda sem rodadas conferidas.</p>
      ) : (
        <ul className={s.nipLista}>
          {comDado.map((l) => {
            const taxa = l.acertos / l.total
            return (
              <li key={l.chave}>
                <span className={s.nipRotulo} style={l.grau ? { color: `var(--confianca-${l.grau})` } : undefined}>
                  {l.rotulo}
                </span>
                <span className={s.nipTrilho} aria-hidden>
                  <span style={{ width: `${Math.round(taxa * 100)}%` }} data-tom={taxa >= 0.6 ? 'bom' : taxa < 0.45 ? 'ruim' : 'neutro'} />
                </span>
                <span className={`${s.nipValor} num`}>
                  <strong>{Math.round(taxa * 100)}%</strong> {l.acertos}/{l.total}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/**
 * PLACAR DO NIP: quanto cada faixa de confiança e cada nível acertou de fato.
 * Se a nota de confiança é boa, a faixa mais alta tem de acertar mais — e a
 * tela mostra isso às claras, erro incluído.
 */
export function Placar({ placar, semTitulo = false }: { placar: PlacarDoNip; semTitulo?: boolean }) {
  if (placar.rodadas === 0) return null
  return (
    <section className={s.nipPlacar} aria-labelledby="t-placar">
      <header className={s.nipCabecalho}>
        <h2 id="t-placar" className={semTitulo ? 'so-leitor' : undefined}>
          Placar do NIP
        </h2>
        <p>
          Quanto cada faixa acertou nas últimas {contar(placar.rodadas, 'rodada')} conferidas. Jogador que não entrou
          não conta.
        </p>
      </header>
      <div className={s.nipGrade}>
        <TabelaDoPlacar titulo="Por nota de confiança" linhas={placar.porConfianca} />
        <TabelaDoPlacar titulo="Por nível do jogador" linhas={placar.porNivel} />
      </div>
    </section>
  )
}

function adversarioDe(jogo: JogoEncerradoResumo | null, timeId: string | null) {
  if (!jogo || timeId === null) return null
  if (timeId === jogo.casaId) return `vs ${jogo.visitanteSigla}`
  if (timeId === jogo.visitanteId) return `@ ${jogo.casaSigla}`
  return null
}

/** O turbo que bateu, ou quem passou mais longe da linha mais baixa. */
function ApitoDaNoite({ d }: { d: DadosDosResultados }) {
  const a = d.apitoDaNoite
  if (!a) return null
  const { card } = a
  const apoio = [
    card.linhaConferida === null
      ? ROTULO_ATRIBUTO[card.atributo]
      : `${ROTULO_ATRIBUTO[card.atributo]} ${fmtLinha(card.linhaConferida)}+`,
    card.timeSigla,
    adversarioDe(a.jogo, card.timeId),
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <section className={s.destaque} aria-label="Apito da noite">
      <FotoJogador
        nome={card.nome}
        fotoUrl={card.fotoUrl}
        tamanho={56}
        anel={corDoApito(card.nivelApito as NivelApito, card.turbo)}
        timeSigla={card.timeSigla}
      />
      <div className={s.destaqueTexto}>
        <p className={s.destaqueRotulo}>Apito da noite</p>
        <Link href={rotaDoJogador(card.jogadorId)} className={s.destaqueNome}>
          {card.nome}
        </Link>
        <p className={s.apoio}>{apoio}</p>
      </div>
      <div className={s.destaqueNumero}>
        <span className="num">{card.fez}</span>
        <span className={s.apoio}>{UNIDADE[card.atributo]}</span>
      </div>
    </section>
  )
}

function CabecalhoDoJogo({ j, fuso }: { j: JogoDaNoite; fuso: string }) {
  const { jogo } = j
  const placar = jogo.placarCasa !== null && jogo.placarVisitante !== null && jogo.status !== 'AGENDADO'
  const quartos = Math.max(jogo.quartosCasa.length, jogo.quartosVisitante.length)
  return (
    <header className={s.jogo}>
      <div className={s.confronto}>
        <LogoTime sigla={jogo.visitanteSigla} tamanho={24} />
        <strong>{jogo.visitanteSigla}</strong>
        {placar ? (
          /* O vencedor em tinta cheia, o perdedor esmaecido: quem ganhou se lê
             sem contar os dois números. Empate (jogo em curso) fica igual. */
          <span className={`${s.placar} num`}>
            <span data-vencedor={jogo.placarVisitante! >= jogo.placarCasa! || undefined}>
              {jogo.placarVisitante}
            </span>
            {' – '}
            <span data-vencedor={jogo.placarCasa! >= jogo.placarVisitante! || undefined}>
              {jogo.placarCasa}
            </span>
          </span>
        ) : (
          <span className={s.fraco}>@</span>
        )}
        <strong>{jogo.casaSigla}</strong>
        <LogoTime sigla={jogo.casaSigla} tamanho={24} />
      </div>
      {quartos > 0 && (
        <table className={s.quartos}>
          <caption className="so-leitor">Pontos por quarto</caption>
          <thead>
            <tr>
              <th scope="col">
                <span className="so-leitor">Time</span>
              </th>
              {Array.from({ length: quartos }, (_, i) => (
                <th key={i} scope="col">
                  {i < 4 ? `${i + 1}º` : `P${i - 3}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              [jogo.visitanteSigla, jogo.quartosVisitante],
              [jogo.casaSigla, jogo.quartosCasa],
            ].map(([sigla, pts]) => (
              <tr key={sigla as string}>
                <th scope="row">{sigla as string}</th>
                {Array.from({ length: quartos }, (_, i) => (
                  <td key={i} className="num">
                    {(pts as number[])[i] ?? '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <span className={s.jogoEstado}>
        {jogo.status === 'AO_VIVO' ? (
          <SeloAoVivo texto={jogo.quartoAtual ? `${jogo.quartoAtual}º Q` : 'Ao vivo'} />
        ) : jogo.status === 'ENCERRADO' ? (
          'Final'
        ) : (
          <span className="num">{hora(jogo.dataHoraUtc, fuso)}</span>
        )}
      </span>
    </header>
  )
}

function LinhaConferida({ c, j }: { c: CardConferido; j: JogoDaNoite }) {
  const { card, item } = c
  const v = vereditoDe(c, j)
  const realizado =
    v === 'bateu' || v === 'falhou' ? String(card.fez) : v === 'dnp' ? '—' : null
  // A forma da odd é do RULESET (`unica`/`media`/faixa) — a tela só escreve.
  const odd = oddDaLinha(item?.oddFaixa)
  return (
    <li className={s.linha} data-v={v}>
      <Link href={rotaDoJogador(card.jogadorId)} className={s.jogador}>
        <FotoJogador
          nome={card.nome}
          fotoUrl={card.fotoUrl}
          tamanho={40}
          anel={corDoApito(card.nivelApito as NivelApito, card.turbo)}
          timeSigla={card.timeSigla}
        />
        <span className={s.identidade}>
          <span className={s.nome}>{card.nome}</span>
          <span className={s.meta}>
            <SeloNivel nivel={card.nivelJogador} />
            {/* Nível do apito e turbo ESCRITOS: o anel colorido da foto não
                pode ser o único canal (cor sozinha não informa). */}
            <IndicadorApito
              nivel={card.nivelApito as NivelApito}
              turbo={card.turbo}
              opd={item?.metodo === 'OPD'}
              opdOrigemNivel={item?.opdOrigemNivel ?? null}
            />
            {item?.modoFire && <SeloModoFire />}
            <span>
              {card.timeSigla}
              {item?.posicao ? ` · ${item.posicao}` : ''}
              {c.adversario ? ` · ${c.adversario.emCasa ? 'vs' : '@'} ${c.adversario.sigla}` : ''}
            </span>
          </span>
        </span>
      </Link>
      <div className={s.cLinha}>
        <span className={s.rotuloCelula}>Linha prevista · jogo inteiro</span>
        <strong className="num">
          {card.linhaConferida === null
            ? 'Sem linha registrada'
            : `${fmtLinha(card.linhaConferida)}+ ${ATRIBUTO_CURTO[card.atributo]}`}
        </strong>
        {item?.mediaTemporada != null && (
          <span className={`${s.apoioCelula} num`}>média {decimal(item.mediaTemporada)}</span>
        )}
      </div>
      {/* A ODD é o que faz o assinante montar a múltipla: ela volta para a
          linha conferida, na forma que o ruleset mandou na materialização. */}
      <div className={s.cOdd}>
        <span className={s.rotuloCelula}>Odd</span>
        <PilulaOdd odd={odd} />
      </div>
      <div className={s.cLinhas}>
        <span className={s.rotuloCelula}>Linhas do apito</span>
        <span className={s.chipsLinha}>
          {card.linhas.map((l) => (
            <span
              key={l.linha}
              className={s.chipLinha}
              data-bateu={l.bateu === null ? undefined : l.bateu}
              title={l.bateu === null ? 'sem veredito' : l.bateu ? 'bateu' : 'não bateu'}
            >
              <span className="num">{fmtLinha(l.linha)}+</span>
              <span aria-hidden>{l.bateu === null ? '·' : l.bateu ? '✓' : '✕'}</span>
              <span className="so-leitor">{l.bateu === null ? 'sem veredito' : l.bateu ? 'bateu' : 'não bateu'}</span>
            </span>
          ))}
        </span>
      </div>
      <div className={s.cFez}>
        <span className={s.rotuloCelula}>Realizado</span>
        {realizado === null ? (
          <span className={s.fraco}>{v === 'aguardando' ? 'Aguardando dado oficial' : '—'}</span>
        ) : (
          <strong className={`${s.fez} num`}>
            {realizado}
            {v !== 'dnp' && <small> {UNIDADE[card.atributo]}</small>}
          </strong>
        )}
      </div>
      <div className={s.cUltimos}>
        <span className={s.rotuloCelula}>Últ. 5 na linha</span>
        {/* Com o VALOR de cada jogo, e a última contornada: é a desta rodada. */}
        <Minigrafico jogos={c.ultimos} valores destacarUltimo={c.destacarUltimo} />
      </div>
      <div className={s.cVeredito}>
        <Selo v={v} />
      </div>
    </li>
  )
}

/**
 * O vazio do GRÁTIS numa rodada em curso (decisão de 24/09): a lista existe,
 * o jogo é que ainda não terminou. "Sem lista publicada" e "nestes filtros"
 * explicariam o vazio com uma mentira; o que se escreve é o que é.
 */
function VazioPorEncerrar() {
  return <EstadoVazio titulo="Nenhum jogo encerrado ainda" texto="Os resultados entram aqui conforme os jogos terminam." />
}

function Lista({ d }: { d: DadosDosResultados }) {
  return (
    <section className={s.secao} aria-labelledby="titulo-lista">
      <div className={s.secaoTopo}>
        <h2 id="titulo-lista" className={s.secaoTitulo}>
          Lista Secreta
        </h2>
        <p className={s.secaoApoio}>
          {d.filtrado ? 'Resumo dos filtros' : 'Resumo da rodada'} · jogo inteiro · temporada com todos os
          atributos e times
        </p>
      </div>
      <Numeros d={d} />
      <Placar placar={d.placar} />
      <ApitoDaNoite d={d} />
      {d.recap.publicados === 0 ? (
        d.jogosPorEncerrar ? (
          <VazioPorEncerrar />
        ) : (
          <EstadoVazio titulo="Nenhuma entrada da Lista Secreta nestes filtros" />
        )
      ) : (
        <div className={s.jogos}>
          {d.jogos.map((j) => (
            <section key={j.jogo.jogoId} className={s.blocoJogo} aria-label={`${j.jogo.visitanteSigla} @ ${j.jogo.casaSigla}`}>
              <CabecalhoDoJogo j={j} fuso={d.fuso} />
              {/* Jogo acabou e o box não chegou: NUNCA inferir ✓/✗ de dado
                  parcial. O carimbo é o DESTE jogo, nunca o da rodada. */}
              {j.estado === 'AGUARDANDO_OFICIAL' && (
                <p className={s.aguardando}>
                  Aguardando dado oficial · última atualização {dataHora(j.jogo.atualizadoEm, d.fuso)}
                </p>
              )}
              <ul className={s.linhas}>
                {j.cards.map((c) => (
                  <LinhaConferida key={c.card.chave} c={c} j={j} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </section>
  )
}

function FireLive({ d }: { d: DadosDosResultados }) {
  const conferidos = d.fire.filter((c) => c.bateu !== null)
  const bateram = conferidos.filter((c) => c.bateu).length
  return (
    <section className={s.secao} aria-labelledby="titulo-fire">
      <div className={s.secaoTopo}>
        <h2 id="titulo-fire" className={s.secaoTitulo}>
          Fire Live · 1º quarto
        </h2>
        <p className={s.secaoApoio}>
          {d.filtrado ? 'Nos filtros' : 'Na rodada'}: {contar(d.fire.length, 'sinal', 'sinais')} · {bateram} de{' '}
          {conferidos.length} alvos conferidos atingidos
        </p>
      </div>
      {d.fire.length === 0 ? (
        d.jogosPorEncerrar ? (
          <VazioPorEncerrar />
        ) : (
          <EstadoVazio titulo="Nenhum sinal do Fire Live nestes filtros" />
        )
      ) : (
        <ul className={`${s.linhas} ${s.caixa}`}>
          {d.fire.map((c) => {
            const v: Veredito =
              c.estado === 'DNP' ? 'dnp' : c.estado === 'PENDENTE' ? 'aguardando' : c.bateu ? 'bateu' : 'falhou'
            return (
              <li key={c.id} className={`${s.linha} ${s.linhaFire}`} data-v={v}>
                <Link href={rotaDoJogador(c.jogadorId)} className={s.jogador}>
                  <FotoJogador nome={c.nome} fotoUrl={c.fotoUrl} tamanho={40} timeSigla={c.timeSigla} />
                  <span className={s.identidade}>
                    <span className={s.nome}>{c.nome}</span>
                    <span className={s.meta}>
                      {identidadeDoTime(c.timeSigla).nome} · {ROTULO_ATRIBUTO[c.atributo]}
                    </span>
                  </span>
                </Link>
                <div className={s.cLinha}>
                  <span className={s.rotuloCelula}>Alvo · 1º quarto</span>
                  <strong className="num">
                    {c.alvo === null ? 'Sem alvo' : `${c.alvo}+ ${ATRIBUTO_CURTO[c.atributo]}`}
                  </strong>
                </div>
                <div className={s.cFez}>
                  <span className={s.rotuloCelula}>Realizado · 1º quarto</span>
                  {c.estado === 'CONFERIDO' && c.valor !== null ? (
                    <strong className={`${s.fez} num`}>
                      {c.valor}
                      <small> {UNIDADE[c.atributo]}</small>
                    </strong>
                  ) : (
                    <span className={s.fraco}>
                      {c.estado === 'DNP' ? 'DNP · neutro' : 'Aguardando fechamento ou dado oficial'}
                    </span>
                  )}
                </div>
                <div className={s.cVeredito}>
                  <span className={s.veredito} data-v={v}>
                    {v === 'bateu' ? '✓ Alvo atingido' : v === 'falhou' ? '✕ Alvo não atingido' : ROTULO_VEREDITO[v]}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/**
 * Os greens do Fire Live em bloco PRÓPRIO: marcos do 1º quarto, não
 * conferência de linha. A escrita é "25 pontos no 1º quarto", com o marco
 * nomeado — nunca "Pontos 25", que é a gramática da linha.
 */
function Greens({ d }: { d: DadosDosResultados }) {
  if (d.greens.length === 0) return null
  return (
    <section className={s.secao} aria-labelledby="titulo-greens">
      <div className={s.secaoTopo}>
        <h2 id="titulo-greens" className={s.secaoTitulo}>
          Greens do Fire Live
        </h2>
        <p className={s.secaoApoio}>Marcos atingidos no 1º quarto</p>
      </div>
      <ul className={`${s.linhas} ${s.caixa}`}>
        {d.greens.map((g) => (
          <li key={g.id} className={s.green}>
            <span className={s.greenMarca} aria-hidden>
              ✓
            </span>
            <span className={s.identidade}>
              <Link href={rotaDoJogador(g.jogadorId)} className={s.nome}>
                {g.nome}
              </Link>
              <span className={s.meta}>
                <SeloNivel nivel={g.nivelJogador} />
                <span>marco {g.marco}</span>
              </span>
            </span>
            <strong className={`${s.greenValor} num`}>
              {g.valor} {UNIDADE[g.atributo]}
              <small> no 1º quarto</small>
            </strong>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function TelaResultados({ dados: d }: { dados: DadosDosResultados }) {
  return (
    <div className={s.tela}>
      <Cabecalho d={d} />
      <Filtros d={d} />
      {d.vazio ? (
        <EstadoVazio
          titulo="Sem lista publicada neste dia"
          texto="Use as setas para navegar até uma rodada com lista."
          acao={{ rotulo: 'Rodada anterior', href: d.anterior }}
        />
      ) : (
        <>
          {d.mostrarLista && <Lista d={d} />}
          {d.mostrarFire && <FireLive d={d} />}
          <Greens d={d} />
        </>
      )}
    </div>
  )
}
