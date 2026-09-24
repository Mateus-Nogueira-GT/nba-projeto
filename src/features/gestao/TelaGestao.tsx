import Link from 'next/link'
import type { EntradaDoPlano } from '@/modules/entrega/gestao'
import { Abas, Chip } from '@/ui/controles'
import { EstadoVazio, NumeroGrande } from '@/ui/blocos'
import { contar, decimal, diaDaRodada, hora, linha as fmtLinha } from '@/ui/formato'
import { IconeInfo } from '@/ui/icones'
import { ATRIBUTO_CURTO, corDoApito, IndicadorApito, PilulaMercado, SeloNivel } from '@/ui/marcas'
import { FotoJogador, LogoTime } from '@/ui/midia'
import { identidadeDoTime } from '@/ui/times'
import { registrarEntrada } from './acoes'
import type { DadosDaGestao } from './carregar'
import s from './Gestao.module.css'

/** Bancas de atalho — evita digitar num teclado de celular durante a rodada. */
const ATALHOS = [200, 500, 1000, 5000] as const

const dinheiro = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dinheiroCurto = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

function hrefGestao(banca: number, visao: 'sugeridas' | 'realizadas'): string {
  const p = new URLSearchParams()
  if (banca !== 1000) p.set('banca', String(banca))
  if (visao === 'realizadas') p.set('ver', 'realizadas')
  const q = p.toString()
  return q ? `/gestao?${q}` : '/gestao'
}

function Cabecalho({ d }: { d: DadosDaGestao }) {
  return (
    <>
      <header className={s.cabecalho}>
        <div>
          <span className="sobretitulo-marca">Gestão de banca</span>
          <h1 className="titulo-marca">Plano do dia</h1>
          <p className={s.subtitulo}>Plano de {diaDaRodada(d.hoje)}</p>
        </div>
      </header>
      <Abas
        rotulo="Visão"
        abas={[
          { chave: 'sugeridas', rotulo: 'Sugeridas', href: hrefGestao(d.banca, 'sugeridas'), ativo: d.visao === 'sugeridas' },
          {
            chave: 'realizadas',
            rotulo: 'Realizadas',
            href: hrefGestao(d.banca, 'realizadas'),
            ativo: d.visao === 'realizadas',
          },
        ]}
      />
      {d.erro && d.erroEm === null && (
        <p role="alert" className={s.erro}>
          {d.erro}
        </p>
      )}
    </>
  )
}

function Rodape() {
  return (
    <p className={s.rodape}>
      A plataforma é somente leitura: nenhuma aposta é enviada, nenhuma conta de casa é vinculada e
      nenhum valor é movimentado. Os números acima são sugestão de tamanho, e a decisão é sempre sua.
    </p>
  )
}

/** A banca: atalhos em chip e um GET puro — a banca fica na URL, sem JavaScript. */
function Banca({ d }: { d: DadosDaGestao }) {
  return (
    <section className={s.banca} aria-labelledby="titulo-banca">
      <div className={s.bancaTopo}>
        <h2 id="titulo-banca" className={s.rotulo}>
          Sua banca
        </h2>
        <span className={`${s.bancaValor} num`}>{dinheiro(d.plano.banca)}</span>
      </div>
      <div className={s.bancaControles}>
        <nav aria-label="Valor da banca" className={s.chips}>
          {ATALHOS.map((v) => (
            <Chip key={v} href={hrefGestao(v, 'sugeridas')} ativo={v === d.banca}>
              {dinheiroCurto(v)}
            </Chip>
          ))}
        </nav>
        <form method="get" action="/gestao" className={s.bancaForm}>
          <label htmlFor="banca" className={s.rotuloCampo}>
            Outro valor (R$)
          </label>
          <div className={s.bancaLinha}>
            <input
              id="banca"
              className={s.entrada}
              type="number"
              name="banca"
              min={1}
              step={1}
              defaultValue={d.banca}
              inputMode="numeric"
            />
            <button type="submit" className={s.primario}>
              Aplicar
            </button>
          </div>
        </form>
      </div>
    </section>
  )
}

function Numeros({ d }: { d: DadosDaGestao }) {
  const { plano } = d
  const pctExposto = plano.banca === 0 ? 0 : (plano.totalExposto / plano.banca) * 100
  return (
    <dl className={s.numeros}>
      <NumeroGrande
        rotulo="1 unidade"
        valor={plano.unidade === null ? '—' : dinheiro(plano.unidade)}
        apoio={
          d.unidadePercentual === null
            ? undefined
            : // Casa decimal só quando existe: 1% não vira "1,0%", e 1,5% não
              // é arredondado para 2% — o número é o do ruleset.
              `${decimal(d.unidadePercentual, d.unidadePercentual % 1 === 0 ? 0 : 1)}% da banca`
        }
      />
      <NumeroGrande
        rotulo="Teto por entrada"
        valor={plano.limites === null ? '—' : dinheiro(plano.limites.tetoPorEntrada)}
      />
      <NumeroGrande
        rotulo="Parar no lucro"
        valor={plano.limites === null ? '—' : `+${dinheiro(plano.limites.stopWin)}`}
        tom="bom"
      />
      <NumeroGrande
        rotulo="Parar no prejuízo"
        valor={plano.limites === null ? '—' : `−${dinheiro(plano.limites.stopLoss)}`}
        tom="ruim"
      />
      <NumeroGrande
        rotulo="Exposição total"
        valor={dinheiro(plano.totalExposto)}
        apoio={`${decimal(pctExposto, 1)}% da banca`}
      />
    </dl>
  )
}

function LinhaSugerida({
  e,
  hoje,
  erro,
  registrada,
}: {
  e: EntradaDoPlano
  hoje: string
  erro: string | null
  /** Já registrei esta entrada hoje: o formulário abre mostrando o que ficou. */
  registrada: boolean
}) {
  const { item, entrada } = e
  const idErro = `erro-${item.chave.replace(/[^a-zA-Z0-9]/g, '')}`
  const cor = corDoApito(item.nivelApito, item.turbo)
  return (
    <li className={s.linha} style={{ ['--cor-apito' as string]: cor }}>
      {/* O link e o form são IRMÃOS: um form dentro de uma âncora é HTML
          inválido, e o "Registrei" navegaria para o apito em vez de gravar. */}
      <Link href={`/apito/${item.jogadorId}?atributo=${item.atributo}`} className={s.jogador}>
        <FotoJogador nome={item.nome} fotoUrl={item.fotoUrl} tamanho={40} anel={cor} timeSigla={item.timeSigla} />
        <span className={s.identidade}>
          <span className={s.nome}>{item.nome}</span>
          <span className={s.meta}>
            <SeloNivel nivel={item.nivelJogador} />
            <PilulaMercado linha={item.linha} atributo={item.atributo} curto />
            <IndicadorApito nivel={item.nivelApito} turbo={item.turbo} />
          </span>
        </span>
      </Link>
      <div className={s.valor}>
        <strong className="num">{entrada === null ? '—' : dinheiro(entrada.valor)}</strong>
        <span className={s.apoio}>
          {entrada === null
            ? 'sem modelo'
            : `${decimal(entrada.unidades, entrada.unidades % 1 === 0 ? 0 : 1)} ${entrada.unidades === 1 ? 'unidade' : 'unidades'}`}
          {entrada?.limitadoPeloTeto && <span className={s.teto}>no teto</span>}
        </span>
      </div>
      {item.linha !== null ? (
        <details className={s.registrar} open={erro || registrada ? true : undefined}>
          <summary className={s.registrarGatilho}>
            {registrada ? 'Registrada hoje' : 'Registrar entrada'}
            {registrada && (
              <span className={s.registradaMarca} aria-hidden>
                ✓
              </span>
            )}
          </summary>
        <form action={registrarEntrada} className={s.registro}>
          <input type="hidden" name="dataReferencia" value={hoje} />
          <input type="hidden" name="jogadorId" value={item.jogadorId} />
          <input type="hidden" name="atributo" value={item.atributo} />
          <input type="hidden" name="linha" value={item.linha} />
          <div className={s.campo}>
            <label htmlFor={`un-${item.chave}`} className={s.rotuloCampo}>
              Unidades
            </label>
            <input
              id={`un-${item.chave}`}
              className={s.entrada}
              type="number"
              name="unidades"
              step={0.5}
              min={0.5}
              max={100}
              defaultValue={entrada?.unidades ?? 1}
              inputMode="decimal"
              aria-invalid={erro ? true : undefined}
              aria-describedby={erro ? idErro : undefined}
            />
          </div>
          <div className={s.campo}>
            <label htmlFor={`odd-${item.chave}`} className={s.rotuloCampo}>
              Odd <span className={s.opcional}>(opcional)</span>
            </label>
            {/* `min` espelha o que o Zod da ação já exige: sem JavaScript, uma
                odd abaixo de 1,01 é recusada antes do envio. */}
            <input
              id={`odd-${item.chave}`}
              className={s.entrada}
              type="number"
              name="odd"
              step={0.01}
              min={1.01}
              max={100}
              placeholder="—"
              inputMode="decimal"
              aria-invalid={erro ? true : undefined}
              aria-describedby={erro ? idErro : undefined}
            />
          </div>
          <button type="submit" className={s.registrei}>
            Registrei
          </button>
          {erro && (
            <p id={idErro} role="alert" className={s.erroCampo}>
              {erro}
            </p>
          )}
        </form>
        </details>
      ) : (
        <span className={s.semLinha}>Sem linha para registrar</span>
      )}
    </li>
  )
}

function Sugeridas({ d }: { d: DadosDaGestao }) {
  const { plano } = d
  if (!d.registra) {
    return (
      <div className={s.convite}>
        <p className={s.conviteTitulo}>Registrar entradas é do plano MVP</p>
        <p className={s.conviteTexto}>
          O plano do dia mostra quanto entrar em cada apito, proporcional ao nível do sinal, e guarda o
          que você fez em cada rodada.
        </p>
        <a href="/assinar?nivel=MVP&voltar=%2Fgestao" className={s.conviteAcao}>
          Ver planos
        </a>
        <div className={s.silhueta} aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className={s.silhuetaLinha}>
              <span className={s.sCirculo} />
              <span className={s.sBarra} style={{ width: 150 - i * 20 }} />
              <span className={s.sBarra} style={{ width: 70, marginLeft: 'auto' }} />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (!plano.temModelo) {
    return (
      <EstadoVazio
        titulo="Modelo de gestão ainda não definido"
        texto="Esta aba passa a sugerir tamanho de entrada assim que o modelo de gestão NIP for carregado."
      />
    )
  }

  return (
    <>
      {plano.origem === 'demonstracao' && (
        <div role="note" className={s.nota}>
          <IconeInfo tamanho={18} />
          <p>
            <strong>Modelo de demonstração.</strong> Os percentuais desta tela são um exemplo de
            proporcionalidade, não o modelo de gestão NIP — ele ainda não foi carregado. Não use como
            orientação financeira.
          </p>
        </div>
      )}
      <div className={s.painelBanca}>
        <Banca d={d} />
        <Numeros d={d} />
      </div>

      <section className={s.secao} aria-labelledby="titulo-sugeridas">
        <div className={s.secaoTopo}>
          <h2 id="titulo-sugeridas" className={s.secaoTitulo}>
            Entradas sugeridas para hoje
          </h2>
          <p className={s.secaoApoio}>
            {contar(plano.entradas.length, 'apito')} na lista · quanto entrar em cada um, proporcional ao
            nível do sinal
          </p>
        </div>
        {plano.entradas.length === 0 ? (
          <EstadoVazio
            titulo="A lista de hoje ainda não foi publicada"
            acao={{ rotulo: 'Ver as Entradas', href: '/' }}
          />
        ) : (
          <div className={s.tabela}>
            {d.gruposPorTime.map(([sigla, entradas]) => (
              <section key={sigla} className={s.grupo} aria-label={identidadeDoTime(sigla).nome}>
                <header className={s.grupoCabecalho}>
                  <LogoTime sigla={sigla} tamanho={22} />
                  <span className={s.grupoNome}>{identidadeDoTime(sigla).nome}</span>
                  <span className={`${s.grupoTotal} num`}>
                    {dinheiro(entradas.reduce((t, e) => t + (e.entrada?.valor ?? 0), 0))}
                  </span>
                </header>
                <ul className={s.linhas}>
                  {entradas.map((e) => (
                    <LinhaSugerida
                      key={e.item.chave}
                      e={e}
                      hoje={d.hoje}
                      erro={d.erroEm === `${e.item.jogadorId}|${e.item.atributo}` ? d.erro : null}
                      registrada={d.registradas.has(`${e.item.jogadorId}|${e.item.atributo}`)}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </section>
    </>
  )
}

/** O mês da pessoa em quatro números — só aparece depois do primeiro registro. */
function Retrospectiva({ d }: { d: DadosDaGestao }) {
  const r = d.retrospectiva
  if (r.entradas === 0) return null
  const conferidas = r.greens + r.reds
  const taxa = conferidas > 0 ? Math.round((r.greens / conferidas) * 100) : null
  const saldo = `${r.saldo >= 0 ? '+' : '−'}${decimal(Math.abs(r.saldo), 1)} un.`
  return (
    <section className={s.retrospectiva} aria-labelledby="titulo-retro">
      <div className={s.secaoTopo}>
        <h2 id="titulo-retro" className={s.secaoTitulo}>
          Seu mês
        </h2>
        <p className={s.secaoApoio}>
          Últimos {r.dias} dias do que você registrou, conferido com o resultado de cada noite.
        </p>
      </div>
      <dl className={s.numerosCurtos}>
        <NumeroGrande rotulo="Entradas" valor={String(r.entradas)} apoio={r.pendentes > 0 ? `${r.pendentes} aguardando` : undefined} />
        <NumeroGrande rotulo="Greens" valor={String(r.greens)} tom={r.greens > 0 ? 'bom' : 'neutro'} apoio={`${r.reds} red${r.reds === 1 ? '' : 's'}`} />
        <NumeroGrande rotulo="Acerto" valor={taxa === null ? '—' : `${taxa}%`} />
        <NumeroGrande rotulo="Saldo" valor={conferidas === 0 ? '—' : saldo} tom={conferidas === 0 ? 'neutro' : r.saldo >= 0 ? 'bom' : 'ruim'} apoio={`${decimal(r.unidades, 1)} un. apostadas`} />
      </dl>
    </section>
  )
}

function Realizadas({ d }: { d: DadosDaGestao }) {
  const total = d.realizadas.reduce((t, e) => t + e.unidades, 0)
  return (
    <section className={s.secao} aria-labelledby="titulo-realizadas">
      <div className={s.secaoTopo}>
        <h2 id="titulo-realizadas" className={s.secaoTitulo}>
          Entradas registradas hoje
        </h2>
        <p className={s.secaoApoio}>O que você digitou ter feito — não o que a NIP sugeriu.</p>
      </div>
      {d.realizadas.length === 0 ? (
        <EstadoVazio
          titulo="Nada registrado hoje"
          texto="Registre pela visão Sugeridas o que você fez fora daqui."
          acao={{ rotulo: 'Ir para Sugeridas', href: hrefGestao(d.banca, 'sugeridas') }}
        />
      ) : (
        <>
          <dl className={s.numerosCurtos}>
            <NumeroGrande rotulo="Registros" valor={String(d.realizadas.length)} />
            <NumeroGrande rotulo="Unidades" valor={decimal(total, total % 1 === 0 ? 0 : 1)} />
          </dl>
          <div className={s.tabela}>
            <div className={s.realizadaCabecalho} aria-hidden>
              <span>Jogador</span>
              <span>Linha</span>
              <span>Unidades</span>
              <span>Odd</span>
              <span>Hora</span>
            </div>
            <ul className={s.linhas}>
              {d.realizadas.map((e) => (
                <li key={e.id} className={s.realizada}>
                  <span className={s.nome}>{e.nomeExibido}</span>
                  <span className="num">
                    {ATRIBUTO_CURTO[e.atributo]} {fmtLinha(e.linha)}+
                  </span>
                  <span className="num">
                    {decimal(e.unidades, e.unidades % 1 === 0 ? 0 : 1)} un.
                  </span>
                  <span className="num">{e.odd === null ? '—' : decimal(e.odd, 2)}</span>
                  <span className={`${s.apoio} num`}>{hora(e.registradaEm, d.fuso)}</span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
      {/* A fronteira explícita: registrar o que o usuário fez aproxima a tela de
          um caderno de apostas, e o produto continua sendo somente leitura. */}
      <p role="note" className={s.rodape}>
        Somente leitura: a NIP não envia aposta nem sabe o que você apostou — só o que você registra.
      </p>
    </section>
  )
}

export function TelaGestao({ dados }: { dados: DadosDaGestao }) {
  return (
    <div className={s.tela}>
      <Cabecalho d={dados} />
      <Retrospectiva d={dados} />
      {dados.visao === 'sugeridas' ? <Sugeridas d={dados} /> : <Realizadas d={dados} />}
      <Rodape />
    </div>
  )
}
