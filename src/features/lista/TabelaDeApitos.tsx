import Link from 'next/link'
import type { Lente } from '@/modules/plataforma/preferencias'
import { decimal, delta, hora, linha as fmtLinha } from '@/ui/formato'
import { Minigrafico } from '@/ui/graficos'
import { oddDaLinha } from '@/ui/odd'
import { IconeOrdenar } from '@/ui/icones'
import {
  corDoApito,
  IndicadorApito,
  PilulaConfianca,
  PilulaMercado,
  PilulaOdd,
  ROTULO_ATRIBUTO,
  ROTULO_NIVEL,
  SeloAoVivo,
  SeloModoFire,
  SeloNivel,
  SeloTurbo,
} from '@/ui/marcas'
import { FotoJogador, LogoTime } from '@/ui/midia'
import { contar } from '@/ui/formato'
import { hrefDaLista, type ColunaOrdenavel, type EstadoDaTabela } from './estado'
import type { GrupoDaLista, LinhaDaLista } from './carregar'
import { margem } from './carregar'
import { EstrelaAcompanhar } from '@/features/ao-vivo/EstrelaAcompanhar'
import { LinkDaLinha } from './LinkDaLinha'
import s from './Tabela.module.css'

const COLUNAS: { chave: string; rotulo: string; ordena?: ColunaOrdenavel; classe: string }[] = [
  { chave: 'jogador', rotulo: 'Jogador', classe: s.cJogador! },
  { chave: 'mercado', rotulo: 'Linha', classe: s.cMercado! },
  { chave: 'apito', rotulo: 'Apito', ordena: 'sinal', classe: s.cApito! },
  { chave: 'confianca', rotulo: 'Confiança', ordena: 'confianca', classe: s.cConfianca! },
  { chave: 'odd', rotulo: 'Odd', ordena: 'odd', classe: s.cOdd! },
  { chave: 'media', rotulo: 'Média', ordena: 'media', classe: s.cMedia! },
  { chave: 'ultimos', rotulo: 'Últimos 5', ordena: 'ultimos', classe: s.cUltimos! },
  { chave: 'jogo', rotulo: 'Jogo', ordena: 'jogo', classe: s.cJogo! },
]

function Odd({ linha }: { linha: LinhaDaLista }) {
  return <PilulaOdd odd={oddDaLinha(linha.item.oddFaixa)} />
}

function Media({ linha }: { linha: LinhaDaLista }) {
  const { mediaTemporada } = linha.item
  if (mediaTemporada === null) return <span className={s.fraco}>—</span>
  const m = margem(linha.item)
  return (
    <span className={s.pilha}>
      <strong className="num">{decimal(mediaTemporada)}</strong>
      {Number.isFinite(m) && (
        <span className={`${s.apoio} num`} data-tom={m >= 0 ? 'bom' : 'ruim'}>
          {delta(m)} da linha
        </span>
      )}
    </span>
  )
}

function Ultimos({ linha }: { linha: LinhaDaLista }) {
  const jogos = [...linha.item.ultimos5].reverse()
  const acertos = jogos.filter((j) => j.bateu).length
  if (jogos.length === 0) return <span className={s.fraco}>—</span>
  return (
    <span className={s.ultimos}>
      {/* Onde há largura, o VALOR de cada jogo aparece dentro da barra — era
          assim no card anterior, e o número é o que se compara com a linha.
          Na coluna estreita sobram as barras, que ainda dizem bateu/não. */}
      <span className={s.ultimosBarras}>
        <Minigrafico jogos={jogos} altura={26} />
      </span>
      <span className={s.ultimosValores}>
        <Minigrafico jogos={jogos} valores />
      </span>
      <span className={`${s.apoio} num`}>
        {acertos}/{jogos.length}
      </span>
    </span>
  )
}

function Jogo({ linha, fuso }: { linha: LinhaDaLista; fuso: string }) {
  const { jogo, adversarioSigla, emCasa } = linha
  if (!jogo || !adversarioSigla) return <span className={s.fraco}>—</span>
  return (
    <span className={s.jogo}>
      <LogoTime sigla={adversarioSigla} tamanho={20} />
      <span className={s.pilha}>
        <span className={s.jogoConfronto}>
          {emCasa ? 'vs' : '@'} {adversarioSigla}
        </span>
        {jogo.status === 'AO_VIVO' ? (
          <SeloAoVivo texto={jogo.quartoAtual ? `${jogo.quartoAtual}º Q` : 'Ao vivo'} />
        ) : jogo.status === 'ENCERRADO' ? (
          <span className={s.apoio}>Encerrado</span>
        ) : (
          <span className={`${s.apoio} num`}>{hora(jogo.dataHoraUtc, fuso)}</span>
        )}
      </span>
    </span>
  )
}

/** O que a LENTE escolhe mostrar à direita da linha compacta (celular). */
function Lente({ linha, lente }: { linha: LinhaDaLista; lente: Lente }) {
  switch (lente) {
    case 'ULT5':
      return <Ultimos linha={linha} />
    case 'MEDIA_LINHA':
      return <Media linha={linha} />
    case 'ODDS':
      return <Odd linha={linha} />
    case 'HIERARQUIA':
      return linha.hierarquia ? (
        <span className={s.pilha}>
          <strong className="num">Nº {linha.hierarquia.posicao}</strong>
          <span className={s.apoio}>de {linha.hierarquia.total} no time</span>
        </span>
      ) : (
        <span className={s.fraco}>—</span>
      )
  }
}

function Linha({
  linha,
  fuso,
  lente,
  semOdd,
  href,
}: {
  linha: LinhaDaLista
  fuso: string
  lente: Lente
  semOdd: boolean
  href: string | undefined
}) {
  const { item } = linha
  const cor = corDoApito(item.nivelApito, item.turbo)
  const mercado =
    item.linha !== null
      ? `mais de ${fmtLinha(item.linha)} ${ROTULO_ATRIBUTO[item.atributo].toLowerCase()}`
      : item.alvo1Q !== null
        ? `alvo de ${item.alvo1Q} ${ROTULO_ATRIBUTO[item.atributo].toLowerCase()} no 1º quarto`
        : ROTULO_ATRIBUTO[item.atributo].toLowerCase()
  const rotulo = [
    item.nome,
    mercado,
    `apito nível ${item.nivelApito}${item.turbo ? ' turbo' : ''}`,
    item.modoFire ? 'modo fire' : null,
    item.opdOrigemNivel !== null ? `cruzou OPD nível ${item.opdOrigemNivel}` : null,
    item.confianca !== null ? `confiança ${Math.round(item.confianca)}%` : null,
    ROTULO_NIVEL[item.nivelJogador],
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <li className={s.itemLinha}>
      <LinkDaLinha
        jogadorId={item.jogadorId}
        atributo={item.atributo}
        rotulo={rotulo}
        className={s.linha!}
        href={href}
        destaque={item.turbo}
        style={{ ['--cor-apito' as string]: cor }}
      >
        <span className={s.cJogador}>
          <FotoJogador nome={item.nome} fotoUrl={item.fotoUrl} tamanho={40} anel={cor} timeSigla={item.timeSigla} />
          <span className={s.identidade}>
            <span className={s.nome}>{item.nome}</span>
            <span className={s.meta}>
              <SeloNivel nivel={item.nivelJogador} />
              {item.turbo && <SeloTurbo />}
              <span>
                {item.timeSigla}
                {item.posicao ? ` · ${item.posicao}` : ''}
              </span>
              {/* Entre 640 e 860px de coluna não existe célula de apito: sem
                  isto, o nível do apito não aparecia em lugar nenhum da linha. */}
              <span className={s.apitoNoJogador}>
                <IndicadorApito
                  nivel={item.nivelApito}
                  turbo={item.turbo}
                  opd={item.metodo === 'OPD'}
                  opdOrigemNivel={item.opdOrigemNivel}
                />
              </span>
              {item.modoFire && <SeloModoFire />}
              {/* A hierarquia não tem coluna própria: quando a lente pede, ela
                  entra aqui — é o único lugar onde cabe em qualquer largura. */}
              {lente === 'HIERARQUIA' && linha.hierarquia && (
                <span className={s.hierarquia}>
                  Nº {linha.hierarquia.posicao} de {linha.hierarquia.total}
                </span>
              )}
            </span>
            {/* A narrativa da materialização — some quando a coluna encolhe. */}
            {item.narrativa ? <span className={s.narrativa}>{item.narrativa}</span> : null}
          </span>
        </span>
        <span className={s.cMercado}>
          <PilulaMercado linha={item.linha} atributo={item.atributo} alvo1Q={item.alvo1Q} texto />
        </span>
        <span className={s.cMercadoCurto}>
          <PilulaMercado linha={item.linha} atributo={item.atributo} alvo1Q={item.alvo1Q} curto texto />
          <IndicadorApito nivel={item.nivelApito} turbo={item.turbo} opdOrigemNivel={item.opdOrigemNivel} />
        </span>
        <span className={s.cApito}>
          <IndicadorApito
            nivel={item.nivelApito}
            turbo={item.turbo}
            opd={item.metodo === 'OPD'}
            opdOrigemNivel={item.opdOrigemNivel}
          />
        </span>
        <span className={s.cConfianca}>
          <PilulaConfianca valor={item.confianca} grau={item.grauConfianca} />
        </span>
        {/* Sem odd (temporada anterior) a coluna não existe — nem célula, nem título. */}
        {!semOdd && (
          <span className={s.cOdd}>
            <Odd linha={linha} />
          </span>
        )}
        <span className={s.cMedia}>
          <Media linha={linha} />
        </span>
        <span className={s.cUltimos}>
          <Ultimos linha={linha} />
        </span>
        <span className={s.cJogo}>
          <Jogo linha={linha} fuso={fuso} />
        </span>
        <span className={s.cLente}>
          <Lente linha={linha} lente={lente} />
        </span>
      </LinkDaLinha>
      {/* Seguir sem abrir o apito: a estrela é IRMÃ do link (botão dentro de
          âncora é HTML inválido) e fica por cima, na borda direita da linha. */}
      <span className={s.estrelaLinha}>
        <EstrelaAcompanhar jogadorId={item.jogadorId} nome={item.nome} inicial={linha.seguido} />
      </span>
    </li>
  )
}

function CabecalhoDoGrupo({ grupo, fuso }: { grupo: GrupoDaLista; fuso: string }) {
  const n = grupo.linhas.length
  if (grupo.nivel) {
    return (
      <div className={s.grupo}>
        <SeloNivel nivel={grupo.nivel} />
        <span className={s.grupoConta}>{contar(n, 'apito')}</span>
      </div>
    )
  }
  const jogo = grupo.jogo
  if (!jogo) {
    return (
      <div className={s.grupo}>
        <span className={s.grupoTitulo}>Outros jogos</span>
        <span className={s.grupoConta}>{contar(n, 'apito')}</span>
      </div>
    )
  }
  const placar = jogo.placarVisitante !== null && jogo.placarCasa !== null
  return (
    <div className={s.grupo}>
      <span className={s.confronto}>
        <LogoTime sigla={jogo.visitanteSigla} tamanho={22} />
        <span className={s.grupoTitulo}>{jogo.visitanteSigla}</span>
        {placar && jogo.status !== 'AGENDADO' ? (
          <span className={`${s.placar} num`}>
            {jogo.placarVisitante} – {jogo.placarCasa}
          </span>
        ) : (
          <span className={s.arroba}>@</span>
        )}
        <span className={s.grupoTitulo}>{jogo.casaSigla}</span>
        <LogoTime sigla={jogo.casaSigla} tamanho={22} />
      </span>
      {jogo.status === 'AO_VIVO' ? (
        <SeloAoVivo texto={jogo.quartoAtual ? `Ao vivo · ${jogo.quartoAtual}º Q` : 'Ao vivo'} />
      ) : jogo.status === 'ENCERRADO' ? (
        <span className={s.grupoConta}>Encerrado</span>
      ) : (
        <span className={`${s.grupoHora} num`}>{hora(jogo.dataHoraUtc, fuso)}</span>
      )}
      <span className={s.grupoConta}>{contar(n, 'apito')}</span>
    </div>
  )
}

/**
 * A LEGENDA da nota de confiança, como a página de notas do SofaScore: as
 * faixas de cor e o que cada uma quer dizer, a um toque do título da coluna.
 * Usa o `popover` nativo do navegador, sem JavaScript.
 */
function LegendaConfianca({ faixas }: { faixas: { de: number; grau: number; rotulo_curto: string }[] }) {
  if (faixas.length === 0) return null
  return (
    <>
      <button type="button" popoverTarget="legenda-confianca" className={s.legendaBotao} aria-label="O que é a nota de confiança">
        i
      </button>
      <div id="legenda-confianca" popover="auto" className={s.legenda}>
        <p className={s.legendaTitulo}>Nota de confiança</p>
        <p className={s.legendaTexto}>
          A força da leitura da NIP para aquela linha. Não é chance de acerto nem promessa de resultado.
        </p>
        <ul className={s.legendaFaixas}>
          {[...faixas].reverse().map((f) => (
            <li key={f.grau}>
              <span className="num" style={{ color: `var(--confianca-${f.grau})` }}>
                {f.de}%+
              </span>
              <span>{f.rotulo_curto.toLowerCase()}</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}

export function TabelaDeApitos({
  grupos,
  estado,
  fuso,
  lente,
  faixasConfianca = [],
  semOdd = false,
  hrefDaLinha,
}: {
  grupos: GrupoDaLista[]
  estado: EstadoDaTabela
  fuso: string
  lente: Lente
  faixasConfianca?: { de: number; grau: number; rotulo_curto: string }[]
  /** Temporada anterior: não há odd coletada de uma rodada que já passou. */
  semOdd?: boolean
  /** Para onde TODA linha leva, quando não é o apito de hoje. */
  hrefDaLinha?: string
}) {
  return (
    <div className={s.tabela} data-sem-odd={semOdd || undefined}>
      <div className={s.cabecalho} role="presentation">
        {COLUNAS.filter((c) => !semOdd || c.chave !== 'odd').map((c) =>
          c.chave === 'confianca' ? (
            <span key={c.chave} className={`${c.classe} ${s.titulo} ${s.tituloComLegenda}`}>
              <Link
                href={hrefDaLista(estado, { ordenarPor: 'confianca' })}
                scroll={false}
                aria-current={estado.ordenarPor === 'confianca' ? 'true' : undefined}
                aria-label="Ordenar por confiança"
              >
                {c.rotulo}
                {estado.ordenarPor === 'confianca' && <IconeOrdenar tamanho={13} />}
              </Link>
              <LegendaConfianca faixas={faixasConfianca} />
            </span>
          ) : c.ordena ? (
            <Link
              key={c.chave}
              href={hrefDaLista(estado, { ordenarPor: c.ordena })}
              scroll={false}
              className={`${c.classe} ${s.titulo}`}
              aria-current={estado.ordenarPor === c.ordena ? 'true' : undefined}
              aria-label={`Ordenar por ${c.rotulo.toLowerCase()}`}
            >
              {c.rotulo}
              {estado.ordenarPor === c.ordena && <IconeOrdenar tamanho={13} />}
            </Link>
          ) : (
            <span key={c.chave} className={`${c.classe} ${s.titulo}`}>
              {c.rotulo}
            </span>
          ),
        )}
      </div>
      {grupos.map((g) => (
        <section key={g.chave} className={s.bloco} aria-label={g.jogo ? `${g.jogo.visitanteSigla} @ ${g.jogo.casaSigla}` : g.nivel ? ROTULO_NIVEL[g.nivel] : 'Outros jogos'}>
          <CabecalhoDoGrupo grupo={g} fuso={fuso} />
          <ol className={s.linhas}>
            {g.linhas.map((l) => (
              <Linha key={l.item.chave} linha={l} fuso={fuso} lente={lente} semOdd={semOdd} href={hrefDaLinha} />
            ))}
          </ol>
        </section>
      ))}
    </div>
  )
}
