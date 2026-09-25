import { Fragment } from 'react'
import Link from 'next/link'
import { BotaoContorno } from '@/ui/controles'
import { EstadoVazio, FaixaAviso } from '@/ui/blocos'
import { contar, diaDaRodada, hora, horaEmTexto } from '@/ui/formato'
import { IconeInfo, IconeRelogio } from '@/ui/icones'
import { LogoTime } from '@/ui/midia'
import { SeloAoVivo } from '@/ui/marcas'
import { AVISO_TEMPORADA_ANTERIOR, SeletorTemporada } from '@/ui/SeletorTemporada'
import type { JogoResumo } from '@/modules/entrega/lista-por-jogo'
import type { DadosDaLista, ListaRetroativa, SeletorDaLista } from './carregar'
import { AbasDeMercado, BarraDeControles } from './Controles'
import { hrefDaLista, SEM_RECORTE, type EstadoDaTabela } from './estado'
import { TabelaDeApitos } from './TabelaDeApitos'
import s from './Lista.module.css'

/** 23/08/2026 18:30 — o carimbo do rodapé, sempre no fuso do ruleset. */
function dataHora(quando: Date, fuso: string): string {
  return quando.toLocaleString('pt-BR', { timeZone: fuso, dateStyle: 'short', timeStyle: 'short' })
}

function Cabecalho({ subtitulo, resumo }: { subtitulo: string; resumo?: string | null }) {
  return (
    <header className={s.cabecalho}>
      <div>
        <span className="sobretitulo-marca">Lista Secreta</span>
        <h1 className="titulo-marca">Lista do dia</h1>
        <p className={s.subtitulo}>{subtitulo}</p>
        {/* Resumo editorial da rodada, gerado na materialização junto com as
            narrativas. Ausente é caso NORMAL (sem chave de LLM, provedor fora,
            texto reprovado pelo validador) — e ausência não abre espaço nenhum. */}
        {resumo ? <p className={s.resumoDoDia}>{resumo}</p> : null}
      </div>
      <BotaoContorno href="/como-funciona" icone={<IconeInfo tamanho={16} />}>
        Como funciona
      </BotaoContorno>
    </header>
  )
}

/** O convite para assinar — o texto do front anterior, com o nível na URL. */
function Convite({ total }: { total?: number }) {
  return (
    <div className={s.convite}>
      <p className={s.conviteTitulo}>
        {total ? `${contar(total, 'apito')} bloqueado${total === 1 ? '' : 's'} na rodada de hoje` : 'A Lista Secreta começa no MVP'}
      </p>
      <p className={s.conviteTexto}>
        Os apitos do dia, o Fire Live e o assistente, com a metodologia NIP. Quer ver antes se funciona? O resultado de
        cada noite é aberto para todos.
      </p>
      <div className={s.conviteAcoes}>
        <Link href="/assinar?nivel=MVP&voltar=%2F" className={s.conviteAcao}>
          Liberar a lista
        </Link>
        <Link href="/resultados" className={s.conviteLink}>
          Ver o resultado de ontem
        </Link>
      </div>
    </div>
  )
}

/**
 * O plano grátis vê a ESTRUTURA da lista — os jogos do dia e linhas-silhueta —
 * e nenhum dado pago. Nada do feed chega a esta renderização.
 */
function ListaGratis({
  jogos,
  fuso,
  bloqueados,
}: {
  jogos: JogoResumo[]
  fuso: string
  bloqueados: { total: number; porJogo: Record<string, number> }
}) {
  if (jogos.length === 0) {
    return (
      <div className={s.gratis}>
        <Convite />
        <p className={s.fraco}>Sem jogos hoje.</p>
      </div>
    )
  }
  return (
    <div className={s.gratis}>
      <Convite total={bloqueados.total} />
      {jogos.map((j, i) => (
        <Fragment key={j.id}>
          {/* UMA repetição, depois do terceiro jogo: no scroll longo do desktop
              a faixa do topo sai da tela e o resto ficava sem chamada. */}
          {i === 3 && <Convite />}
          <section className={s.silhuetaBloco} aria-label={`${j.visitanteSigla} @ ${j.casaSigla}`}>
            <div className={s.silhuetaJogo}>
              <LogoTime sigla={j.visitanteSigla} tamanho={22} />
              <strong>{j.visitanteSigla}</strong>
              {j.status !== 'AGENDADO' && j.placarVisitante !== null && j.placarCasa !== null ? (
                <span className={`${s.silhuetaPlacar} num`}>
                  {j.placarVisitante} – {j.placarCasa}
                </span>
              ) : (
                <span className={s.fraco}>@</span>
              )}
              <strong>{j.casaSigla}</strong>
              <LogoTime sigla={j.casaSigla} tamanho={22} />
              <span className={`${s.silhuetaHora} num`}>
                {j.status === 'AO_VIVO' ? (
                  <SeloAoVivo texto={j.quartoAtual ? `${j.quartoAtual}º Q ao vivo` : 'Ao vivo'} />
                ) : j.status === 'ENCERRADO' ? (
                  'Encerrado'
                ) : (
                  hora(j.dataHoraUtc, fuso)
                )}
              </span>
            </div>
            {(bloqueados.porJogo[j.id] ?? 0) > 0 && (
              <p className={s.silhuetaContagem}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
                  <rect x="5" y="11" width="14" height="10" rx="2" />
                  <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                </svg>
                {contar(bloqueados.porJogo[j.id]!, 'apito')} neste jogo
              </p>
            )}
            {Array.from({ length: Math.min(4, Math.max(1, bloqueados.porJogo[j.id] ?? 1)) }, (_, k) => k).map((k) => (
              <div key={k} className={s.silhuetaLinha} aria-hidden>
                <span className={s.sCirculo} />
                <span className={s.sBarra} style={{ width: 140 - k * 18 }} />
                <span className={s.sBarra} style={{ width: 72 }} />
                <span className={s.sBarra} style={{ width: 48 }} />
              </div>
            ))}
          </section>
        </Fragment>
      ))}
    </div>
  )
}

/** "2025-26 | 2026-27" — some sozinho com uma temporada só. */
function Seletor({ seletor }: { seletor: SeletorDaLista }) {
  return (
    <SeletorTemporada
      temporadas={seletor.temporadas}
      atual={seletor.temporada}
      hrefDe={(t) => `/?temporada=${encodeURIComponent(t)}`}
    />
  )
}

/** O dia dentro da temporada anterior: as setas só andam pelas datas dela. */
function NavegacaoDoDia({ retroativa, estado }: { retroativa: ListaRetroativa; estado: EstadoDaTabela }) {
  return (
    <nav className={s.navDia} aria-label="Navegar entre rodadas da temporada">
      {retroativa.anterior ? (
        <Link href={hrefDaLista(estado, { data: retroativa.anterior })}>← Rodada anterior</Link>
      ) : (
        <span aria-disabled="true">← Rodada anterior</span>
      )}
      <strong>{diaDaRodada(retroativa.data)}</strong>
      {retroativa.proxima ? (
        <Link href={hrefDaLista(estado, { data: retroativa.proxima })}>Próxima rodada →</Link>
      ) : (
        <span aria-disabled="true">Próxima rodada →</span>
      )}
    </nav>
  )
}

export function TelaLista({ dados, estado: estadoDaUrl }: { dados: DadosDaLista; estado: EstadoDaTabela }) {
  const dia = diaDaRodada(dados.hoje)
  const retroativa = dados.tipo === 'lista' ? dados.retroativa : null
  // Os links da tela levam a temporada já resolvida. Na anterior, ela e o
  // dia. Na de hoje, só se a pessoa ESCOLHEU a do calendário no seletor —
  // senão, no hiato, o primeiro filtro a devolveria à temporada anterior.
  // Lixo da URL nunca se propaga (não é igual à temporada em tela).
  const escolheuADoCalendario = !retroativa && estadoDaUrl.temporada === dados.seletor.temporada
  const estado: EstadoDaTabela = retroativa
    ? { ...estadoDaUrl, temporada: retroativa.temporada, data: retroativa.data }
    : { ...estadoDaUrl, temporada: escolheuADoCalendario ? dados.seletor.temporada : undefined, data: undefined }

  if (dados.tipo === 'gratis') {
    return (
      <div className={s.tela}>
        <Cabecalho subtitulo={`Rodada de ${dia} · ${contar(dados.jogos.length, 'jogo')}`} />
        <Seletor seletor={dados.seletor} />
        <ListaGratis jogos={dados.jogos} fuso={dados.fuso} bloqueados={dados.bloqueados} />
      </div>
    )
  }

  if (dados.tipo === 'aguardando') {
    // O hiato entre temporadas: os textos são os da home anterior, aprovados
    // na spec da temporada retroativa (22/09) — a saída é a aba que TEM dado.
    if (dados.saida === null && dados.hiato) {
      return (
        <div className={s.tela}>
          <Cabecalho subtitulo={`Rodada de ${dia}`} />
          <Seletor seletor={dados.seletor} />
          <EstadoVazio
            icone={<IconeRelogio />}
            titulo="A temporada ainda não começou"
            texto={
              dados.hiato.proximoJogo
                ? `A NBA volta em ${dados.hiato.proximoJogo}, e a Lista volta com ela. Até lá, as estatísticas da temporada ${dados.hiato.exibida} estão na aba STATS.`
                : `A NBA está entre temporadas. Até lá, as estatísticas da temporada ${dados.hiato.exibida} estão na aba STATS.`
            }
            acao={{ rotulo: 'Ver estatísticas', href: '/estatisticas' }}
          />
        </div>
      )
    }
    return (
      <div className={s.tela}>
        <Cabecalho subtitulo={`Rodada de ${dia}`} />
        <Seletor seletor={dados.seletor} />
        <EstadoVazio
          icone={<IconeRelogio />}
          titulo={
            dados.saida ? `Próxima lista às ${horaEmTexto(dados.saida, dados.fuso)}` : 'Sem jogos hoje'
          }
          texto={
            dados.saida
              ? 'A lista sai antes do primeiro jogo da rodada. Enquanto isso, a noite passada:'
              : 'Sem rodada hoje. Enquanto isso, a noite passada:'
          }
          acao={{ rotulo: 'Resultados de ontem', href: '/resultados' }}
        />
      </div>
    )
  }

  // Na temporada anterior nada foi publicado: sem "publicada às".
  const subtitulo = retroativa
    ? `Rodada de ${diaDaRodada(dados.dataReferencia)} · ${contar(dados.totalPublicado, 'entrada')} em ${contar(dados.jogosComApito, 'jogo')}`
    : `Rodada de ${diaDaRodada(dados.dataReferencia)} · publicada às ${horaEmTexto(dados.geradoEm, dados.fuso)} · ${contar(dados.totalPublicado, 'entrada')} em ${contar(dados.jogosComApito, 'jogo')}`
  const resultadoDoDia = retroativa
    ? `/resultados/${retroativa.data}?${new URLSearchParams({ temporada: retroativa.temporada })}`
    : null
  const nesteDia = retroativa ? 'Neste dia' : 'Hoje'
  // Publicada e vazia é diferente de recorte vazio: a primeira é da rodada, a
  // segunda é do filtro que a pessoa escolheu.
  const semEntradas = dados.totalPublicado === 0
  const recorteVazio = !semEntradas && dados.totalVisivel === 0

  return (
    <div className={s.tela}>
      <Cabecalho subtitulo={subtitulo} resumo={dados.resumoDoDia} />
      <Seletor seletor={dados.seletor} />
      {retroativa && <FaixaAviso>{AVISO_TEMPORADA_ANTERIOR}</FaixaAviso>}
      {retroativa && <NavegacaoDoDia retroativa={retroativa} estado={estado} />}
      <BarraDeControles
        semOdd={retroativa !== null}
        seguidosNaRodada={dados.seguidosNaRodada}
        estado={estado}
        opcoes={dados.opcoes}
        ordem={dados.ordem}
        lente={dados.lente}
        abas={
          <AbasDeMercado
            estado={estado}
            atributos={dados.opcoes.atributos}
            contagem={dados.contagemPorAtributo}
            total={dados.totalPublicado}
          />
        }
      />
      {semEntradas ? (
        resultadoDoDia ? (
          <EstadoVazio
            titulo="Nenhum apito neste dia"
            texto="A metodologia não apitou nenhum jogador nesta rodada."
            acao={{ rotulo: 'Resultado deste dia', href: resultadoDoDia }}
          />
        ) : (
          <EstadoVazio
            titulo="Nenhuma entrada para hoje"
            texto="A rodada saiu sem apito nenhum. Enquanto isso, veja como foi a noite passada."
            acao={{ rotulo: 'Resultados de ontem', href: '/resultados' }}
          />
        )
      ) : recorteVazio ? (
        <EstadoVazio
          titulo={
            estado.seguidos
              ? `Nenhum jogador que você segue apitou ${retroativa ? 'neste dia' : 'hoje'}`
              : 'Nenhum apito com esses filtros'
          }
          texto={
            estado.seguidos
              ? `${nesteDia} há ${contar(dados.totalPublicado, 'entrada')}. Para seguir um jogador, toque na estrela na ficha dele em Estatísticas ou no Ao Vivo.`
              : `${nesteDia} há ${contar(dados.totalPublicado, 'entrada')}. Tire algum filtro para vê-las.`
          }
          acao={{ rotulo: 'Limpar filtros', href: hrefDaLista(estado, SEM_RECORTE) }}
        />
      ) : (
        <>
          <p className={s.contagem} aria-live="polite">
            {dados.totalVisivel === dados.totalPublicado
              ? contar(dados.totalVisivel, 'entrada')
              : `${dados.totalVisivel} de ${dados.totalPublicado} entradas`}
          </p>
          <TabelaDeApitos
            grupos={dados.grupos}
            estado={estado}
            fuso={dados.fuso}
            lente={dados.lente}
            faixasConfianca={dados.faixasConfianca}
            semOdd={retroativa !== null}
            hrefDaLinha={resultadoDoDia ?? undefined}
          />
        </>
      )}
      {/* Toda tela informa o quão recente é o número que está sendo visto. */}
      {resultadoDoDia && retroativa ? (
        <footer className={s.rodape}>
          <span>
            Temporada {retroativa.temporada} · ruleset {dados.rulesetVersao}
          </span>
          <Link href={resultadoDoDia} className={s.rodapeLink}>
            Resultado deste dia →
          </Link>
        </footer>
      ) : (
        <footer className={s.rodape}>
          <span>
            Última atualização: {dataHora(dados.geradoEm, dados.fuso)} · ruleset {dados.rulesetVersao}
          </span>
          <Link href="/resultados" className={s.rodapeLink}>
            Resultados de ontem →
          </Link>
        </footer>
      )}
    </div>
  )
}
