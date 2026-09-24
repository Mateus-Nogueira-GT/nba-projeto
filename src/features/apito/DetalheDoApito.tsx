import Link from 'next/link'
import { rotaDoJogador } from '@/modules/entrega/estatisticas/rotas'
import { BotaoSecundario, EstadoVazio, NumeroGrande, Secao } from '@/ui/blocos'
import { dataHora, decimal, hora, linha as fmtLinha } from '@/ui/formato'
import { oddDaLinha } from '@/ui/odd'
import { IconeExterno, IconeFogo } from '@/ui/icones'
import {
  ATRIBUTO_CURTO,
  corDoApito,
  IndicadorApito,
  PilulaConfianca,
  PilulaMercado,
  ROTULO_ATRIBUTO,
  SeloAoVivo,
  SeloNivel,
  PilulaOdd,
  SeloTurbo,
} from '@/ui/marcas'
import { FotoJogador, LogoTime } from '@/ui/midia'
import type { DadosDoApito } from './carregar'
import { FormaNoAtributo } from './FormaNoAtributo'
import { Tendencias } from './Tendencias'
import s from './Apito.module.css'

type Dados = Extract<DadosDoApito, { tipo: 'apito' }>

const odd = (v: number) => decimal(v, 2)

function Cabecalho({ d }: { d: Dados }) {
  const { principal: p, detalhe } = d
  const cor = corDoApito(p.nivelApito, p.turbo)
  const faixa = p.oddFaixa
  return (
    <header className={s.cabecalho}>
      {d.fireLive && (
        <p className={s.sobrancelha}>
          <SeloAoVivo texto="Fire Live · 1º quarto" />
        </p>
      )}
      <div className={s.heroi}>
        <FotoJogador nome={p.nome} fotoUrl={p.fotoUrl} tamanho={72} anel={cor} timeSigla={p.timeSigla} />
        <div className={s.heroiTexto}>
          <h2 className={s.nome}>
            <Link href={rotaDoJogador(p.jogadorId)}>{p.nome}</Link>
          </h2>
          <p className={s.meta}>
            <SeloNivel nivel={p.nivelJogador} />
            <span>
              {p.timeSigla}
              {p.posicao ? ` · ${p.posicao}` : ''}
            </span>
            <IndicadorApito nivel={p.nivelApito} turbo={p.turbo} opd={p.metodo === 'OPD'} />
            {p.turbo && <SeloTurbo grande />}
          </p>
          <p className={s.mercado}>
            <PilulaMercado linha={p.linha} atributo={p.atributo} />
            <PilulaOdd odd={oddDaLinha(faixa)} />
          </p>
        </div>
      </div>
      <div className={s.proximo}>
        <span className={s.rotulo}>{detalhe.jogo.emCasa ? 'Em casa' : 'Fora'}</span>
        <span className={s.proximoJogo}>
          <LogoTime sigla={detalhe.jogo.visitanteSigla} tamanho={22} />
          <strong>{detalhe.jogo.visitanteSigla}</strong>
          <span className={s.fraco}>@</span>
          <strong>{detalhe.jogo.casaSigla}</strong>
          <LogoTime sigla={detalhe.jogo.casaSigla} tamanho={22} />
        </span>
        <span className={`${s.proximoHora} num`}>{hora(detalhe.jogo.dataHoraUtc, d.fuso)}</span>
      </div>
    </header>
  )
}

function Numeros({ d }: { d: Dados }) {
  const { principal: p, detalhe } = d
  const { acertos, total } = detalhe.bateu
  const linhaOuAlvo =
    p.linha !== null
      ? { rotulo: 'Linha', valor: `${fmtLinha(p.linha)}+` }
      : p.alvo1Q !== null
        ? { rotulo: 'Alvo 1Q', valor: String(p.alvo1Q) }
        : { rotulo: 'Linha', valor: '—' }
  return (
    <dl className={s.numeros}>
      {/* A nota veste a COR DO GRAU — é o canal de leitura da escala de
          confiança, e o grau 5 ainda ganha brilho, como no front anterior. */}
      <div className={s.confianca} data-grau={d.grauConfianca ?? undefined}>
        <NumeroGrande
          rotulo="Confiança"
          valor={p.confianca === null ? '—' : `${Math.round(p.confianca)}%`}
          apoio={d.rotuloConfianca ? d.rotuloConfianca.charAt(0) + d.rotuloConfianca.slice(1).toLowerCase() : undefined}
        />
      </div>
      <NumeroGrande
        rotulo="Bateu"
        valor={total === 0 ? '—' : `${acertos}/${total}`}
        tom={total === 0 ? 'neutro' : acertos / total >= 0.5 ? 'bom' : 'ruim'}
        apoio={total === 0 ? undefined : `últimos ${total}`}
      />
      <NumeroGrande
        rotulo="Média"
        valor={detalhe.mediaTemporada === null ? '—' : decimal(detalhe.mediaTemporada)}
        apoio="temporada"
      />
      <NumeroGrande
        rotulo={linhaOuAlvo.rotulo}
        valor={linhaOuAlvo.valor}
        apoio={detalhe.minutosMedia === null ? undefined : `${Math.round(detalhe.minutosMedia)} min/jogo`}
      />
    </dl>
  )
}

function PrimeiroQuarto({ d }: { d: Dados }) {
  const vivo = d.aoVivo
  if (!vivo) return null
  const alvo = vivo.alvo1Q ?? 0
  const progresso = alvo > 0 ? Math.min(1, vivo.valorNoQuarto / alvo) : 0
  const bateu = alvo > 0 && vivo.valorNoQuarto >= alvo
  return (
    <Secao titulo="1º quarto" apoio="O que o Fire Live observa">
      <div className={s.caixa}>
        <div className={s.quartoTopo}>
          <span className="num">
            <strong className={s.quartoValor}>{vivo.valorNoQuarto}</strong>
            <span className={s.fraco}> de {alvo} {ATRIBUTO_CURTO[vivo.atributo]}</span>
          </span>
          {bateu ? <span className={s.bateu}>Alvo batido</span> : <SeloAoVivo texto={vivo.encerrado ? 'Fim do 1º Q' : 'Em andamento'} />}
        </div>
        <div
          className={s.trilho}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={alvo}
          aria-valuenow={vivo.valorNoQuarto}
          aria-label={`${vivo.valorNoQuarto} de ${alvo} ${ROTULO_ATRIBUTO[vivo.atributo].toLowerCase()} no 1º quarto`}
        >
          <span className={s.trilhoCheio} data-bateu={bateu} style={{ width: `${progresso * 100}%` }} />
        </div>
        {vivo.modoFire && (
          <p className={s.nota}>
            <IconeFogo tamanho={14} className={s.fogo} /> Modo fire: alvo em {Math.round(d.percentualModoFire * 100)}% da média.
          </p>
        )}
      </div>
    </Secao>
  )
}

function PorQueEntrou({ d }: { d: Dados }) {
  const { detalhe, principal } = d
  return (
    <Secao titulo="Por que entrou">
      {principal.narrativa && <p className={s.narrativa}>{principal.narrativa}</p>}
      {detalhe.fatores.length === 0 ? (
        <p className={s.fraco}>A análise deste apito não trouxe fatores detalhados.</p>
      ) : (
        <ul className={s.fatores}>
          {detalhe.fatores.map((f) => {
            const destaque = f.destaque && f.texto.startsWith(f.destaque) ? f.destaque : null
            return (
              <li key={f.chave} className={s.fator}>
                <span className={s.fatorTitulo}>{f.titulo}</span>
                <p className={s.fatorTexto}>
                  {destaque ? (
                    <>
                      <strong>{destaque}</strong>
                      {f.texto.slice(destaque.length)}
                    </>
                  ) : (
                    f.texto
                  )}
                </p>
              </li>
            )
          })}
        </ul>
      )}
    </Secao>
  )
}

function OJogo({ d }: { d: Dados }) {
  const { jogo } = d.detalhe
  return (
    <Secao titulo="O jogo">
      <div className={s.caixa}>
        <div className={s.confronto}>
          <span className={s.lado}>
            <LogoTime sigla={jogo.visitanteSigla} tamanho={36} />
            <strong>{jogo.visitanteSigla}</strong>
          </span>
          <span className={s.confrontoMeio}>
            <span className={`${s.confrontoHora} num`}>{hora(jogo.dataHoraUtc, d.fuso)}</span>
            <span className={s.fraco}>{jogo.emCasa ? `${d.principal.timeSigla} em casa` : `${d.principal.timeSigla} fora`}</span>
          </span>
          <span className={s.lado}>
            <LogoTime sigla={jogo.casaSigla} tamanho={36} />
            <strong>{jogo.casaSigla}</strong>
          </span>
        </div>
        <div className={s.desfalques}>
          <span className={s.rotulo}>Desfalques</span>
          <p>{jogo.desfalques.length === 0 ? 'Sem desfalques' : jogo.desfalques.join(' · ')}</p>
        </div>
      </div>
    </Secao>
  )
}

function Linhas({ d }: { d: Dados }) {
  const { principal: p, linhas, casas, casasNaTela } = d
  if (linhas.length === 0)
    return (
      <Secao titulo={`Linhas de ${ROTULO_ATRIBUTO[p.atributo].toLowerCase()}`}>
        <p className={s.fraco}>
          Este apito nasceu ao vivo: ele tem alvo do 1º quarto, não linha pré-live.
        </p>
      </Secao>
    )
  const linhasComValor = linhas.map((l) => l.item.linha).filter((l): l is number => l !== null)
  // Quantas vezes passou de cada linha nos jogos do histórico — contagem do que
  // o detalhe já trouxe, não uma regra nova do motor.
  const historico = d.detalhe.blocos
  const passou = (linha: number) => historico.filter((b) => b.valor >= linha).length
  return (
    <Secao titulo={`Linhas de ${ROTULO_ATRIBUTO[p.atributo].toLowerCase()}`} apoio="Quanto mais alta a linha, menor a confiança.">
      <ul className={s.linhas}>
        {linhas.map((l) => (
          <li key={l.item.chave} className={s.linhaItem} aria-current={l.escolhida ? 'true' : undefined}>
            <span className={`${s.linhaValor} num`}>
              {l.item.linha === null ? '—' : `${fmtLinha(l.item.linha)}+`}
            </span>
            <span className={s.frequencia} aria-hidden>
              {historico.map((b, i) => (
                <span key={i} data-passou={l.item.linha !== null && b.valor >= l.item.linha} />
              ))}
            </span>
            <span className={`${s.linhaVezes} num`}>
              {l.item.linha === null ? '—' : `${passou(l.item.linha)}/${historico.length}`}
              <span className="so-leitor"> jogos acima da linha</span>
            </span>
            <PilulaConfianca valor={l.item.confianca} grau={l.item.grauConfianca} />
            <span className={s.linhaOdd}>
              <PilulaOdd
                odd={
                  l.faixa === null
                    ? null
                    : {
                        rotulo: 'Odd',
                        valor:
                          l.faixa[0] === l.faixa[1]
                            ? odd(l.faixa[0])
                            : `${odd(l.faixa[0])}–${odd(l.faixa[1])}`,
                        apoio: l.qtdCasas ? `${l.qtdCasas} ${l.qtdCasas === 1 ? 'casa' : 'casas'}` : null,
                      }
                }
              />
            </span>
            {l.escolhida && <span className={s.escolhida}>Apito</span>}
          </li>
        ))}
      </ul>
      {casas.length > 0 && linhasComValor.length > 0 && (
        <div className={s.rolagem} tabIndex={0} role="region" aria-label="Odds por casa">
          <table className={s.casas}>
            <caption className="so-leitor">Odd de cada casa por linha</caption>
            <thead>
              <tr>
                <th scope="col">Casa</th>
                {linhasComValor.map((l) => (
                  <th key={l} scope="col" className="num">
                    {fmtLinha(l)}+
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {casas.map((c) => (
                <tr key={c.casa}>
                  <th scope="row">{c.casa}</th>
                  {linhasComValor.map((l) => (
                    <td key={l} className="num">
                      {c.porLinha[l] === undefined ? '—' : odd(c.porLinha[l]!)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className={s.nota}>
        {casasNaTela === 1
          ? 'Cotação de uma casa, na última coleta.'
          : casasNaTela > 1
            ? `Faixa entre ${casasNaTela} casas na última coleta.`
            : 'Faixa da tabela de referência da plataforma.'}{' '}
        Referência de mercado: a odd da sua casa pode ser outra. Nenhuma aposta é feita por aqui.
      </p>
    </Secao>
  )
}

/** As tendências do apito, com a linha ajustável (ver `Tendencias.tsx`). */
function BlocoTendencias({ d }: { d: Dados }) {
  const linha = d.detalhe.linhaConferida ?? d.principal.linha
  if (linha === null || d.detalhe.blocos.length < 3) return null
  return (
    <Secao titulo="Tendências">
      <Tendencias
        blocos={d.detalhe.blocos}
        linhaBase={linha}
        unidade={ATRIBUTO_CURTO[d.principal.atributo]}
        adversarioSigla={d.detalhe.jogo.adversarioSigla ?? null}
      />
    </Secao>
  )
}

export function DetalheDoApito({ dados }: { dados: DadosDoApito }) {
  if (dados.tipo === 'sem-apito') {
    return (
      <div className={s.detalhe}>
        <EstadoVazio
          titulo="Sem apito para este jogador hoje"
          texto="A lista de hoje não sinalizou este jogador. Ele pode aparecer na próxima rodada."
          acao={{ rotulo: 'Ver estatísticas do jogador', href: rotaDoJogador(dados.jogadorId) }}
        />
      </div>
    )
  }
  const d = dados
  return (
    <article className={s.detalhe} aria-label={`Apito de ${d.principal.nome}`}>
      <Cabecalho d={d} />
      <Numeros d={d} />
      <PrimeiroQuarto d={d} />
      <Secao titulo={`Forma em ${ROTULO_ATRIBUTO[d.principal.atributo].toLowerCase()}`}>
        {d.detalhe.blocos.length === 0 ? (
          <p className={s.fraco}>Sem jogos anteriores nesta temporada.</p>
        ) : (
          <FormaNoAtributo blocos={d.detalhe.blocos} linha={d.detalhe.linhaConferida} />
        )}
      </Secao>
      <BlocoTendencias d={d} />
      <PorQueEntrou d={d} />
      <OJogo d={d} />
      <Linhas d={d} />
      <p className={s.rodapeNota}>
        O número é a <strong>nota de confiança</strong> da análise NIP; não é probabilidade de acerto.
        {d.geradoEm ? ` Última atualização: ${dataHora(d.geradoEm, d.fuso)}.` : ''}
      </p>
      <div className={s.acoes}>
        {d.saida && (
          <>
            {/* Link PATROCINADO: a marcação é exigência do acordo com a casa. */}
            <a
              className={s.casaParceira}
              href={`/ir/${d.saida.codigo}?apito=${encodeURIComponent(d.principal.chave)}`}
              target="_blank"
              rel="nofollow sponsored noopener noreferrer"
            >
              Ver na {d.saida.rotulo} <IconeExterno tamanho={16} />
            </a>
            <p className={s.nota}>
              Você sai da NIP. A odd da sua casa pode ser outra; nenhuma aposta é feita por aqui. 18+ ·
              Aposta não é investimento.
            </p>
          </>
        )}
        <BotaoSecundario href={rotaDoJogador(d.principal.jogadorId)}>Estatísticas do jogador</BotaoSecundario>
      </div>
    </article>
  )
}
