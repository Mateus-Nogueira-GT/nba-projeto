import { Quadra } from '@/ui/Quadra'
import Link from 'next/link'
import type { EstadoVazio, GrupoFireLive, ItemFireLiveNaTela } from '@/modules/entrega/fire-live/leitura'
import type { JogoResumo } from '@/modules/entrega/lista-por-jogo'
import { BotaoContorno, Chip } from '@/ui/controles'
import { EstadoVazio as Vazio } from '@/ui/blocos'
import { contar, hora } from '@/ui/formato'
import { IconeAoVivo, IconeFogo, IconeInfo, IconeTurbo, IconeOcultar } from '@/ui/icones'
import { rotaDoJogador } from '@/modules/entrega/estatisticas/rotas'
import {
  ATRIBUTO_CURTO,
  corDoApito,
  IndicadorApito,
  ROTULO_ATRIBUTO,
  SeloAoVivo,
  SeloModoFire,
  SeloNivel,
  SeloTurbo,
} from '@/ui/marcas'
import { FotoJogador, LogoTime } from '@/ui/midia'
import { exibir, ocultar } from './acoes'
import { AtualizarAoVivo } from './AtualizarAoVivo'
import { EstrelaAcompanhar } from './EstrelaAcompanhar'
import { SilhuetaPaga } from './SilhuetaPaga'
import { ESTADOS, hrefAoVivo, type DadosAoVivo, type RecorteAoVivo } from './carregar'
import { ExperienciaAoVivo } from './ExperienciaAoVivo'
import { FiltroDoJogo } from './FiltroDoJogo'
import s from './AoVivo.module.css'

/** "agora" · "há 3 min" · "há 2 h" — a defasagem do dado, sempre à vista. */
function decorrido(de: Date, agora: Date): string {
  const min = Math.max(0, Math.round((agora.getTime() - de.getTime()) / 60_000))
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  return h < 24 ? `há ${h} h` : `há ${Math.floor(h / 24)} d`
}

function dataHora(quando: Date, fuso: string): string {
  return quando.toLocaleString('pt-BR', { timeZone: fuso, dateStyle: 'short', timeStyle: 'short' })
}

/**
 * A tela vazia é a experiência DOMINANTE do Ao Vivo — ele só existe durante o
 * 1º quarto. Cada motivo tem o próprio texto, para não parecer defeito.
 */
function TextoVazio({
  estado,
  primeiroJogo,
  fuso,
  proximoJogo,
}: {
  estado: EstadoVazio
  primeiroJogo: Date | null
  fuso: string
  /** Data legível do próximo jogo agendado — só o hiato a usa. */
  proximoJogo?: string | null
}) {
  const textos: Record<EstadoVazio, { titulo: string; corpo: string }> = {
    SEM_JOGO_HOJE: {
      titulo: 'Sem jogos hoje',
      corpo: 'A NBA não tem partidas hoje. O Fire Live volta na próxima rodada.',
    },
    // A fachada do v2 não conhecia o hiato entre temporadas; o nosso back
    // conhece (`estadoDaTemporada`, lido em `carregar.ts`). Texto idêntico ao
    // da tela antiga do Fire Live: "sem jogos por mais um mês" não é "sem
    // jogos hoje" para quem paga.
    TEMPORADA_NAO_COMECOU: {
      titulo: 'A temporada ainda não começou',
      corpo: proximoJogo
        ? `A NBA volta em ${proximoJogo}, e o Fire Live volta com ela. Até lá, as estatísticas da temporada passada estão na aba STATS.`
        : 'A NBA está entre temporadas. O Fire Live volta quando a bola subir — até lá, as estatísticas da temporada passada estão na aba STATS.',
    },
    AGUARDANDO_PRIMEIRO_JOGO: {
      titulo: 'Ainda não começou',
      corpo: primeiroJogo
        ? `O primeiro jogo de hoje começa às ${hora(primeiroJogo, fuso)}. Os apitos aparecem aqui durante o 1º quarto.`
        : 'Os apitos aparecem aqui durante o 1º quarto de cada jogo.',
    },
    NENHUM_EM_1Q: {
      titulo: 'Nenhum jogo no 1º quarto agora',
      corpo: 'O Fire Live observa somente o 1º quarto. Quando o próximo jogo começar, ele volta a olhar.',
    },
    SEM_APITO_AINDA: {
      titulo: 'Observando o 1º quarto',
      corpo:
        'Jogo em andamento e ninguém cruzou o alvo ainda. O apito aparece aqui — e chega por push — no instante em que a marca for atingida.',
    },
  }
  const t = textos[estado]
  return <Vazio icone={<IconeAoVivo />} titulo={t.titulo} texto={t.corpo} />
}

function Cabecalho({ subtitulo, aoVivo }: { subtitulo: React.ReactNode; aoVivo: boolean }) {
  return (
    <header className={s.cabecalho}>
      <div>
        <span className="sobretitulo-marca">Fire Live</span>
        <div className={s.tituloLinha}>
          <h1 className="titulo-marca">Acontecendo</h1>
          {aoVivo && <SeloAoVivo texto="1º quarto" />}
        </div>
        <p className={s.subtitulo}>{subtitulo}</p>
      </div>
      <BotaoContorno href="/como-funciona" icone={<IconeInfo tamanho={20} />}>
        Como funciona
      </BotaoContorno>
    </header>
  )
}

/** O estado do jogo em uma palavra, para o seletor e o cabeçalho. */
function estadoDoGrupo(g: GrupoFireLive, fuso: string): { rotulo: string; vivo: boolean } {
  if (g.estado === 'EM_1Q') return { rotulo: '1º Q ao vivo', vivo: true }
  if (g.estado === 'FIM_1Q') return { rotulo: 'Fim do 1º Q', vivo: false }
  return { rotulo: hora(g.dataHoraUtc, fuso), vivo: false }
}

function Seletor({ grupos, ativo, recorte, fuso }: { grupos: GrupoFireLive[]; ativo: string | null; recorte: RecorteAoVivo; fuso: string }) {
  if (grupos.length === 0) return null
  return (
    <nav className={s.seletor} aria-label="Escolher jogo">
      {grupos.map((g) => {
        const e = estadoDoGrupo(g, fuso)
        const temPlacar = g.estado !== 'AGUARDANDO' && g.placarCasa !== null && g.placarVisitante !== null
        return (
          <Link
            key={g.jogoId}
            href={hrefAoVivo(recorte, { jogo: g.jogoId })}
            scroll={false}
            className={s.jogo}
            aria-current={g.jogoId === ativo ? 'page' : undefined}
          >
            <span className={s.jogoTimes}>
              <span className={s.jogoTime}>
                <LogoTime sigla={g.visitanteSigla} tamanho={22} />
                <strong>{g.visitanteSigla}</strong>
                {temPlacar && <span className={`${s.jogoPlacar} num`}>{g.placarVisitante}</span>}
              </span>
              <span className={s.jogoTime}>
                <LogoTime sigla={g.casaSigla} tamanho={22} />
                <strong>{g.casaSigla}</strong>
                {temPlacar && <span className={`${s.jogoPlacar} num`}>{g.placarCasa}</span>}
              </span>
            </span>
            <span className={s.jogoRodape} data-vivo={e.vivo}>
              {e.vivo && <span className={s.ponto} aria-hidden />}
              {e.rotulo}
              {g.itens.length > 0 && <span className={s.jogoConta}>· {contar(g.itens.length, 'apito')}</span>}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}

function Placar({ g, fuso }: { g: GrupoFireLive; fuso: string }) {
  const e = estadoDoGrupo(g, fuso)
  const temPlacar = g.estado !== 'AGUARDANDO' && g.placarCasa !== null && g.placarVisitante !== null
  // O jogo que ainda não começou fica MUDO: sem o realce do que está
  // acontecendo agora. E jogo em andamento sem placar mostra "—", nunca o
  // horário — dizer "21:00" sobre um jogo que já rola seria número errado.
  const semPlacarAoVivo = !temPlacar && g.estado !== 'AGUARDANDO'
  return (
    <div className={s.placar} data-live-score data-mudo={g.estado === 'AGUARDANDO' || undefined}>
      <span className={s.lado}>
        <LogoTime sigla={g.visitanteSigla} tamanho={44} />
        <strong>{g.visitanteSigla}</strong>
        <span className={s.ladoRotulo}>Visitante</span>
      </span>
      <span className={s.centro}>
        {temPlacar ? (
          <span className={`${s.placarNumeros} num`}>
            {g.placarVisitante}
            <span className={s.placarSep}>–</span>
            {g.placarCasa}
          </span>
        ) : (
          <span className={`${s.placarNumeros} num`}>
            {semPlacarAoVivo ? '—' : hora(g.dataHoraUtc, fuso)}
          </span>
        )}
        {e.vivo ? <SeloAoVivo texto={e.rotulo} /> : <span className={s.estadoMudo}>{g.estado === 'AGUARDANDO' ? 'Aguardando o 1º quarto' : e.rotulo}</span>}
      </span>
      <span className={s.lado}>
        <LogoTime sigla={g.casaSigla} tamanho={44} />
        <strong>{g.casaSigla}</strong>
        <span className={s.ladoRotulo}>Casa</span>
      </span>
      <div className={s.quadraPlacar}>
        <Quadra />
      </div>
    </div>
  )
}

/**
 * A barra rumo ao alvo do 1º quarto.
 *
 * ALVO ZERO NÃO É ALVO. Régua zero não desenha barra, não diz "alvo batido"
 * (0 ≥ 0 é verdade e seria mentira na tela) e não escreve "faltam 0": mostra
 * o que o jogador fez e para por aí.
 */
function Progresso({ item }: { item: ItemFireLiveNaTela }) {
  const unidade = ATRIBUTO_CURTO[item.atributo]
  const alvo = item.alvo1Q !== null && item.alvo1Q > 0 ? item.alvo1Q : null
  if (alvo === null) {
    return (
      <span className={s.progresso}>
        <span className={s.progressoTopo}>
          <span className="num">
            <strong className={s.progressoValor}>{item.valorNoQuarto}</strong>
            <span className={s.fraco}> {unidade} no 1º Q</span>
          </span>
          <span className={s.fraco}>Sem alvo</span>
        </span>
      </span>
    )
  }
  const batido = item.valorNoQuarto >= alvo
  const fracao = Math.min(1, item.valorNoQuarto / alvo)
  // O marco do modo fire só entra se cair DENTRO da régua (antes do alvo).
  const marco = item.alvoFire !== null && item.alvoFire.valor < alvo ? item.alvoFire : null
  return (
    <span className={s.progresso}>
      <span className={s.progressoTopo}>
        <span className="num">
          <strong className={s.progressoValor}>{item.valorNoQuarto}</strong>
          <span className={s.fraco}>
            {' '}
            / {alvo} {unidade}
          </span>
        </span>
        <span className={s.progressoEstado} data-batido={batido}>
          {batido ? 'Alvo batido' : `falta${alvo - item.valorNoQuarto > 1 ? 'm' : ''} ${alvo - item.valorNoQuarto} ${unidade}`}
        </span>
      </span>
      <span
        className={s.trilho}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={alvo}
        aria-valuenow={item.valorNoQuarto}
        aria-label={`${item.valorNoQuarto} de ${alvo} ${ROTULO_ATRIBUTO[item.atributo].toLowerCase()} no 1º quarto`}
      >
        <span className={s.trilhoCheio} data-batido={batido} style={{ width: `${fracao * 100}%` }} />
        {marco && <span className={s.marco} style={{ left: `${(marco.valor / alvo) * 100}%` }} aria-hidden />}
      </span>
      {/* A LEGENDA ESCRITA da régua: o marco do modo fire vem nomeado da
          entrega ("75% da média"), porque o percentual é regra do ruleset. Um
          traço sem nome na barra só se explica no `title`, que o celular não
          mostra. */}
      <span className={s.reguaLegenda}>
        {marco && (
          <span className={s.reguaMarco}>
            {marco.rotulo} · <span className="num">{marco.valor}</span>
          </span>
        )}
        <span className={s.reguaAlvo}>
          alvo · <span className="num">{alvo}</span>
        </span>
      </span>
    </span>
  )
}

/**
 * Uma linha de apito ao vivo.
 *
 * A análise é uma âncora que COBRE a linha, IRMÃ do conteúdo — nunca um `<a>`
 * em volta dele: o nome do jogador também é link (o segundo caminho para as
 * estatísticas) e âncora dentro de âncora é HTML inválido. Por isso o nome, a
 * estrela e o ocultar sobem uma camada e seguem clicáveis por cima.
 */
function LinhaAoVivo({
  item,
  emCasa,
  acompanhado,
}: {
  item: ItemFireLiveNaTela
  emCasa: boolean | null
  acompanhado: boolean
}) {
  const cor = corDoApito(item.nivelApito, item.turbo)
  const confronto = emCasa === null ? null : `${emCasa ? 'vs' : '@'} ${item.adversarioSigla}`
  return (
    <li
      className={s.item}
      data-live-key={item.chave}
      data-batido={item.alvo1Q !== null && item.alvo1Q > 0 && item.valorNoQuarto >= item.alvo1Q}
      data-seguido={acompanhado}
      style={{ ['--cor-apito' as string]: cor }}
    >
      <Link
        href={`/apito/${item.jogadorId}?atributo=${item.atributo}`}
        scroll={false}
        className={s.cobertura}
        aria-label={`${item.nome}, ${ROTULO_ATRIBUTO[item.atributo].toLowerCase()} no 1º quarto: ${item.valorNoQuarto} de ${item.alvo1Q ?? '—'}. Ver análise`}
      />
      <div className={s.linha}>
        <span className={s.cJogador}>
          <FotoJogador nome={item.nome} fotoUrl={item.fotoUrl} tamanho={40} anel={cor} timeSigla={item.timeSigla} />
          <span className={s.identidade}>
            <Link href={rotaDoJogador(item.jogadorId)} className={s.nome}>
              {item.nome}
            </Link>
            <span className={s.meta}>
              <SeloNivel nivel={item.nivelJogador} />
              <span>
                {item.timeSigla}
                {item.posicao ? ` · ${item.posicao}` : ''}
              </span>
              {confronto && <span className={s.confronto}>{confronto}</span>}
            </span>
          </span>
        </span>
        <span className={s.cProgresso}>
          <Progresso item={item} />
        </span>
        <span className={s.cApito}>
          <IndicadorApito
            nivel={item.nivelApito}
            turbo={item.turbo}
            opdOrigemNivel={item.opdOrigemNivel}
          />
          {item.turbo && <SeloTurbo />}
          {item.modoFire && (
            <span className={s.fire}>
              <IconeFogo tamanho={20} /> <SeloModoFire />
            </span>
          )}
        </span>
      </div>
      <span className={s.acoes}>
        <EstrelaAcompanhar jogadorId={item.jogadorId} nome={item.nome} inicial={acompanhado} />
        <form action={ocultar} className={s.ocultar}>
          <input type="hidden" name="jogadorId" value={item.jogadorId} />
          <button type="submit" aria-label={`Ocultar ${item.nome} desta tela`} title="Ocultar jogador">
            <IconeOcultar tamanho={20} />
          </button>
        </form>
      </span>
    </li>
  )
}

function Convite() {
  return (
    <div className={s.convite}>
      <p className={s.conviteTitulo}>O Fire Live começa no MVP</p>
      <p className={s.conviteTexto}>
        Os apitos do dia, o Fire Live e o assistente, com a metodologia NIP.
      </p>
      <a href="/assinar?nivel=MVP&voltar=%2Ffire-live" className={s.conviteAcao}>
        Ver planos
      </a>
    </div>
  )
}

/**
 * O grátis vê a MOLDURA do assinante com o conteúdo coberto: o confronto de
 * cada jogo e, abaixo, a silhueta dos apitos. Uma lista de siglas não diz o
 * que ele está perdendo.
 */
function Gratis({ jogos, fuso }: { jogos: JogoResumo[]; fuso: string }) {
  if (jogos.length === 0) {
    return (
      <>
        <Convite />
        <p className={s.fraco}>Sem jogos hoje.</p>
      </>
    )
  }
  return (
    <>
      <Convite />
      <div className={s.gratisJogos}>
        {jogos.map((j, i) => (
          <section key={j.id} className={s.gratisJogo} aria-label={`${j.visitanteSigla} @ ${j.casaSigla}`}>
            {/* UMA repetição do convite, depois do terceiro jogo: a faixa do
                topo sai da tela num scroll longo, e o convite a cada bloco
                viraria anúncio. */}
            {i === 3 && <Convite />}
            <div className={s.jogoGratis}>
              <LogoTime sigla={j.visitanteSigla} tamanho={22} />
              <strong>{j.visitanteSigla}</strong>
              {j.status !== 'AGENDADO' && j.placarVisitante !== null ? (
                <strong className="num">
                  {j.placarVisitante} – {j.placarCasa}
                </strong>
              ) : (
                <span className={s.fraco}>@</span>
              )}
              <strong>{j.casaSigla}</strong>
              <LogoTime sigla={j.casaSigla} tamanho={22} />
              <span className={s.jogoGratisEstado}>
                {j.status === 'AO_VIVO' ? (
                  <SeloAoVivo texto={j.quartoAtual ? `${j.quartoAtual}º Q` : 'Ao vivo'} />
                ) : j.status === 'ENCERRADO' ? (
                  'Final'
                ) : (
                  <span className="num">{hora(j.dataHoraUtc, fuso)}</span>
                )}
              </span>
            </div>
            <SilhuetaPaga />
          </section>
        ))}
      </div>
    </>
  )
}

export function TelaAoVivo({ dados, recorte }: { dados: DadosAoVivo; recorte: RecorteAoVivo }) {
  if (dados.tipo === 'gratis') {
    const vivo = dados.jogos.some((j) => j.status === 'AO_VIVO')
    return (
      <div className={s.tela}>
        <Cabecalho subtitulo="Os jogos de hoje e o 1º quarto de cada um." aoVivo={vivo} />
        <Gratis jogos={dados.jogos} fuso={dados.fuso} />
      </div>
    )
  }

  const d = dados
  const g = d.selecionado
  const emQuarto = d.grupos.some((x) => x.estado === 'EM_1Q')
  const acompanhados = new Set(d.experiencia.jogadoresAcompanhados)

  return (
    <div className={s.tela}>
      <Cabecalho
        aoVivo={emQuarto}
        subtitulo={
          <>
            Alvos do 1º quarto.{' '}
            {d.geradoEm !== null && <span className={s.carimbo}>Atualizado {decorrido(d.geradoEm, d.agora)}.</span>} O
            apito chega no push; a tela é o detalhe.
          </>
        }
      />

      <nav className={s.estados} aria-label="Estado do 1º quarto">
        {ESTADOS.map((c) => {
          const ativo = recorte.estado?.valor === c.valor
          return (
            <Chip key={c.valor} ativo={ativo} href={hrefAoVivo(recorte, { estado: ativo ? null : c.valor, jogo: null })}>
              {c.rotulo}
            </Chip>
          )
        })}
      </nav>

      {d.atualizaSozinha && <AtualizarAoVivo />}

      <Seletor grupos={d.grupos} ativo={g?.jogoId ?? null} recorte={recorte} fuso={d.fuso} />

      {d.jogoSolicitadoInvalido && g !== null && (
        <p role="status" className={s.aviso}>
          Este jogo não está mais neste recorte. Exibindo o jogo disponível agora.
        </p>
      )}

      {d.estadoVazio !== null && !d.temRecorte && d.grupos.length === 0 && (
        <TextoVazio
          estado={d.estadoVazio}
          primeiroJogo={d.primeiroJogoUtc}
          fuso={d.fuso}
          proximoJogo={d.proximoJogo}
        />
      )}

      {d.recorteVazio && (
        <Vazio titulo="Nada com esse filtro" texto="Nenhum jogo ou apito neste recorte." acao={{ rotulo: 'Ver todos', href: '/fire-live' }} />
      )}

      {d.tudoOculto && (
        <Vazio
          titulo="Todos os apitados estão ocultos"
          texto="Há apitos agora, mas você escolheu não acompanhar estes jogadores. Reative quem quiser na lista logo abaixo."
        />
      )}

      {g !== null && (
        <section className={s.painel} aria-label={`${g.visitanteSigla} @ ${g.casaSigla}`}>
          <ExperienciaAoVivo
            key={g.jogoId}
            estado={d.experiencia}
            snapshot={{
              jogoId: g.jogoId,
              placarCasa: g.placarCasa,
              placarVisitante: g.placarVisitante,
              alvos: g.itens.map((i) => ({
                chave: i.chave,
                jogadorId: i.jogadorId,
                atributo: i.atributo,
                observado: i.valorNoQuarto,
                alvo: i.alvo1Q,
                modoFire: i.modoFire,
                apitadoEm: i.apitadoEm,
              })),
            }}
          >
            <Placar g={g} fuso={d.fuso} />

            {g.estado === 'AGUARDANDO' && (
              <p className={s.apoio}>
                {contar(g.alvosAguardando, 'alvo')} aguardando o 1º quarto.
                {g.jogoId === d.primeiraEspera ? ' O push avisa no instante do apito.' : ''}
              </p>
            )}
            {g.estado !== 'AGUARDANDO' && g.itens.length === 0 && (
              <p className={s.apoio}>
                {d.temApitoNoJogo
                  ? 'Apitos deste jogo ocultos. Reative os jogadores abaixo para acompanhá-los.'
                  : recorte.time !== undefined
                    ? 'Nenhum apito deste time no jogo até agora.'
                    : 'Ninguém cruzou o alvo neste jogo ainda.'}
              </p>
            )}

            {g.itens.length > 0 && (
              <FiltroDoJogo
                contagem={(() => {
                  const batido = g.itens.filter((i) => i.alvo1Q !== null && i.alvo1Q > 0 && i.valorNoQuarto >= i.alvo1Q).length
                  return {
                    todos: g.itens.length,
                    batido,
                    faltando: g.itens.length - batido,
                    seguidos: g.itens.filter((i) => acompanhados.has(i.jogadorId)).length,
                  }
                })()}
              >
              <div className={s.tabela}>
                <div className={s.tabelaCabecalho} aria-hidden>
                  <span>Jogador</span>
                  <span>1º quarto</span>
                  <span>Apito</span>
                </div>
                <ul className={s.itens}>
                  {g.itens.map((item) => (
                    <LinhaAoVivo
                      key={item.chave}
                      item={item}
                      emCasa={
                        item.timeSigla === g.casaSigla
                          ? true
                          : item.timeSigla === g.visitanteSigla
                            ? false
                            : null
                      }
                      acompanhado={acompanhados.has(item.jogadorId)}
                    />
                  ))}
                </ul>
              </div>
              </FiltroDoJogo>
            )}
          </ExperienciaAoVivo>
        </section>
      )}

      {d.ocultos.length > 0 && (
        <section className={s.ocultos}>
          <h2 className={s.secaoTitulo}>Jogadores ocultos</h2>
          <ul className={s.listaOcultos}>
            {d.ocultos.map((j) => (
              <li key={j.id}>
                <form action={exibir} className={s.oculto}>
                  <span>{j.nome}</span>
                  <input type="hidden" name="jogadorId" value={j.id} />
                  <button type="submit">Mostrar de novo</button>
                </form>
              </li>
            ))}
          </ul>
          <p className={s.nota}>
            Ocultar tira o jogador desta tela em todos os seus aparelhos. As notificações continuam —
            silenciá-las por jogador é decisão que ainda vai ao CJ.
          </p>
        </section>
      )}

      <footer className={s.rodape}>
        <span>
          {d.geradoEm ? `Dados de ${dataHora(d.geradoEm, d.fuso)} · ao vivo` : 'Sem dado ao vivo ainda'}
        </span>
        <span className={s.legenda}>
          <IconeTurbo tamanho={20} /> turbo · <IconeFogo tamanho={20} /> modo fire
        </span>
      </footer>
    </div>
  )
}
