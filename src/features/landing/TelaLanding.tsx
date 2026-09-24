import { Montserrat, Roboto } from 'next/font/google'
import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { ORDEM_DOS_NIVEIS, ROTULO_DO_NIVEL, type NivelDoPlano } from '@/modules/plataforma/assinatura/nivel-do-plano'
import type { Sku } from '@/modules/plataforma/assinatura/sku'
import type { NivelApito } from '@/modules/motor/tipos'
import { BENEFICIOS_POR_NIVEL } from '@/features/assinatura/matriz'
import { diaCurto, linha as formatarLinha } from '@/ui/formato'
import { Logo } from '@/ui/Logo'
import { ATRIBUTO_CURTO, corDoApito, IndicadorApito, PilulaConfianca, SeloAoVivo, SeloNivel } from '@/ui/marcas'
import { FotoJogador } from '@/ui/midia'
import type { AcertoDaVitrine, DadosDaLanding } from './carregar'
import { CHECKS_DO_APITO, CHECKS_DO_HEROI, COMPARATIVO, FAIXA, FERRAMENTAS, PASSOS, PERGUNTAS, type Icone } from './conteudo'
import {
  IcAlvo,
  IcAoVivo,
  IcBarras,
  IcCarteira,
  IcCheck,
  IcEntrar,
  IcEscudo,
  IcFiltro,
  IcLista,
  IcMais,
  IcRaio,
  IcRobo,
  IcSeta,
  IcSino,
  IcTendencia,
  IcTrofeu,
  IcX,
} from './icones'
import s from './Landing.module.css'

/*
 * Tipografia da landing, no padrão das LPs Plus Mídia: Montserrat pesada
 * (800/900) nos títulos e Roboto no corpo. O app continua com as fontes dele.
 */
const fonteTitulo = Montserrat({ weight: ['700', '800', '900'], subsets: ['latin'], variable: '--lp-titulo' })
const fonteCorpo = Roboto({ weight: ['400', '500', '700'], subsets: ['latin'], variable: '--lp-corpo' })

const CADASTRO = '/cadastrar'
const ENTRAR = '/entrar'

const ICONE: Record<Icone, (p: { tamanho?: number }) => ReactNode> = {
  lista: IcLista,
  aoVivo: IcAoVivo,
  alvo: IcAlvo,
  tendencia: IcTendencia,
  barras: IcBarras,
  carteira: IcCarteira,
  trofeu: IcTrofeu,
  robo: IcRobo,
  sino: IcSino,
  raio: IcRaio,
  filtro: IcFiltro,
  escudo: IcEscudo,
}

function Ic({ nome, tamanho }: { nome: Icone; tamanho?: number }) {
  const C = ICONE[nome]
  return <C tamanho={tamanho} />
}

/** Cabeçalho de seção: rótulo em caixa alta, título pesado, destaque em azul. */
function Cabecalho({
  rotulo,
  titulo,
  destaque,
  texto,
  id,
  esquerda = false,
}: {
  rotulo: string
  titulo: string
  destaque?: string
  texto?: string
  id: string
  esquerda?: boolean
}) {
  return (
    <header className={s.cabecalho} data-esquerda={esquerda || undefined}>
      <p className={s.rotulo}>{rotulo}</p>
      <h2 id={id} className={s.h2}>
        {titulo}
        {destaque && (
          <>
            {' '}
            <span className={s.azul}>{destaque}</span>
          </>
        )}
      </h2>
      {texto && <p className={s.lead}>{texto}</p>}
    </header>
  )
}

function Moldura({ imagem, url, alt }: { imagem: string; url: string; alt: string }) {
  return (
    <div className={s.navegador}>
      <div className={s.navegadorBarra} aria-hidden>
        <span className={s.pontos}>
          <i />
          <i />
          <i />
        </span>
        <span className={s.endereco}>{url}</span>
      </div>
      <Image src={imagem} alt={alt} width={2160} height={1350} className={s.print} sizes="(max-width: 1023px) 100vw, 620px" />
    </div>
  )
}

/** Notificação flutuante no herói: a forma do push que o app manda. */
function Aviso({ titulo, texto, hora, className }: { titulo: string; texto: string; hora: string; className?: string }) {
  return (
    <div className={`${s.aviso} ${className ?? ''}`} aria-hidden>
      <span className={s.avisoIcone}>
        <Image src="/icons/app-192.png" alt="" width={34} height={34} />
      </span>
      <span className={s.avisoCorpo}>
        <span className={s.avisoTopo}>
          <strong>{titulo}</strong>
          <em>{hora}</em>
        </span>
        <span>{texto}</span>
      </span>
    </div>
  )
}

/** O mercado do acerto: a linha conferida (a mais baixa) e o atributo. */
function mercado(a: AcertoDaVitrine): string {
  return `+${formatarLinha(a.linha)} ${ATRIBUTO_CURTO[a.atributo]}`
}

/** "VIS 104 × 110 CAS" — o placar do jogo em que o acerto aconteceu. */
function PlacarDoJogo({ placar }: { placar: AcertoDaVitrine['placar'] }) {
  return (
    <p className={`${s.placar} num`}>
      {placar.visitanteSigla} <strong>{placar.placarVisitante ?? '—'}</strong>
      <span>×</span>
      <strong>{placar.placarCasa ?? '—'}</strong> {placar.casaSigla}
    </p>
  )
}

function reais(valor: number): string {
  return `R$ ${String(Math.round(valor)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`
}

/* ---------------------------------------------------------------- Bento */

/**
 * Grade de recursos no desenho do "Bento Product Features" (21st.dev,
 * @kavikatiyar): um card alto à esquerda, quatro no meio e um largo embaixo.
 * Cada card mostra a PEÇA DE VERDADE do app, não um ícone genérico.
 *
 * A peça de verdade aqui é a noite CONFERIDA, nunca a lista de hoje: a
 * landing é pública, e o que ela pode mostrar do produto é o que Resultados
 * já abre a todo nível (decisão D2, 23/09). De hoje, só quantos apitos há.
 */
function Bento({ dados }: { dados: DadosDaLanding }) {
  const noite = dados.noite
  const acertos = noite?.acertos ?? []
  const [a] = acertos
  const { gestao } = dados
  const limites = gestao.limites
  return (
    <div className={s.bento}>
      <article className={`${s.bloco} ${s.blocoAlto}`}>
        <div className={s.blocoTopo}>
          <p className={s.blocoRotulo}>Resultado conferido</p>
          <h3>Quem bateu na última noite</h3>
          <p>
            {noite
              ? `Rodada de ${diaCurto(noite.dataReferencia)}, conferida jogo a jogo. Um jogador por linha, com o mercado e o que ele fez.`
              : 'Toda noite a NIP confere o que apitou, jogo a jogo. Um jogador por linha, com o mercado e o que ele fez.'}
          </p>
        </div>
        {acertos.length > 0 ? (
          <ul className={s.miniLista}>
            {acertos.slice(0, 5).map((item) => (
              <li key={item.chave}>
                <FotoJogador
                  nome={item.nome}
                  fotoUrl={item.fotoUrl}
                  tamanho={34}
                  anel={corDoApito(item.nivelApito as NivelApito, item.turbo)}
                />
                <span className={s.miniNome}>
                  <strong>{item.nome}</strong>
                  <span>
                    {item.timeSigla} · {mercado(item)} · fez <b className="num">{item.fez}</b>
                  </span>
                </span>
                <PilulaConfianca valor={item.confianca} grau={item.grau} />
              </li>
            ))}
          </ul>
        ) : (
          <p className={s.blocoLegenda}>Ainda não há noite conferida nesta temporada.</p>
        )}
        <p className={s.blocoRodape}>
          <span className="num">{dados.totalDeApitos}</span> apitos na rodada de hoje
        </p>
      </article>

      <article className={s.bloco}>
        <p className={s.blocoRotulo}>Nota de confiança</p>
        {/* Sem acerto conferido (ou sem nota), o card NÃO inventa um número: "—",
            como a pílula de confiança faz com null (regra 3 do CLAUDE.md). */}
        <p className={`${s.numeraco} num`} style={{ color: 'var(--confianca-5)' }}>
          {a?.confianca != null ? `${Math.round(a.confianca)}%` : '—'}
        </p>
        <p className={s.blocoLegenda}>Mede a força da leitura. Não é chance de acerto.</p>
      </article>

      <article className={s.bloco}>
        <p className={s.blocoRotulo}>Força do apito</p>
        <ul className={s.forcas}>
          <li>
            <IndicadorApito nivel={1} turbo={false} />
            <span>1 jogo abaixo da média</span>
          </li>
          <li>
            <IndicadorApito nivel={2} turbo={false} />
            <span>2 seguidos</span>
          </li>
          <li>
            <IndicadorApito nivel={3} turbo={false} />
            <span>3 seguidos</span>
          </li>
          <li>
            <IndicadorApito nivel={3} turbo />
            <span>Turbo</span>
          </li>
        </ul>
      </article>

      <article className={s.bloco}>
        <div className={s.blocoLinha}>
          <p className={s.blocoRotulo}>A noite conferida</p>
          {a && <SeloNivel nivel={a.nivelJogador} />}
        </div>
        {noite && noite.conferidos > 0 ? (
          <>
            <p className={`${s.numeraco} num`} style={{ color: 'var(--bateu-texto)' }}>
              {noite.bateram} de {noite.conferidos}
            </p>
            {a && <PlacarDoJogo placar={a.placar} />}
            <p className={s.blocoLegenda}>
              {a ? `${a.nome} bateu ${mercado(a)}: fez ${a.fez}.` : 'Apitados que bateram a linha na última noite.'}
            </p>
          </>
        ) : (
          <p className={s.blocoLegenda}>Quantos apitados bateram a linha, noite a noite. Quem não entrou não conta.</p>
        )}
      </article>

      <article className={s.bloco}>
        <div className={s.blocoLinha}>
          <p className={s.blocoRotulo}>Fire Live</p>
          <SeloAoVivo texto="1º Q" />
        </div>
        {/* O jogo AO VIVO é pago: o card conta o que o Fire Live faz, sem mostrar a noite em curso. */}
        <p className={s.blocoLegenda}>O 1º quarto ao vivo, jogador por jogador.</p>
      </article>

      <article className={`${s.bloco} ${s.blocoLargo}`}>
        <div className={s.blocoTopo}>
          <p className={s.blocoRotulo}>Gestão de banca</p>
          <h3>O tamanho certo de cada entrada</h3>
        </div>
        <dl className={s.banca}>
          <div>
            <dt>Banca</dt>
            <dd className="num">{reais(gestao.banca)}</dd>
          </div>
          <div>
            <dt>Unidade</dt>
            <dd className="num">{gestao.unidade != null ? reais(gestao.unidade) : '—'}</dd>
          </div>
          <div>
            <dt>Stop win</dt>
            <dd className="num" data-tom="bateu">
              {limites ? reais(limites.stopWin) : '—'}
            </dd>
          </div>
          <div>
            <dt>Stop loss</dt>
            <dd className="num" data-tom="falhou">
              {limites ? reais(limites.stopLoss) : '—'}
            </dd>
          </div>
        </dl>
      </article>
    </div>
  )
}

/* ---------------------------------------------------------------- Planos */

const SKU_DO_PLANO: Record<'MVP' | 'ALL_STAR', { mensal: Sku; temporada: Sku }> = {
  MVP: { mensal: 'MVP_MENSAL', temporada: 'MVP_TEMPORADA' },
  ALL_STAR: { mensal: 'ALL_STAR_MENSAL', temporada: 'ALL_STAR_TEMPORADA' },
}

const CHAMADA: Record<NivelDoPlano, string> = {
  GRATIS: 'Para conhecer a NIP.',
  MVP: 'A metodologia inteira, todo dia.',
  ALL_STAR: 'Tudo do MVP e mais acesso.',
}

function Preco({ centavos, sufixo }: { centavos: number; sufixo: string }) {
  const inteiro = Math.floor(centavos / 100)
  const resto = centavos === 0 ? '' : `,${String(centavos % 100).padStart(2, '0')}`
  return (
    <span className={s.preco}>
      <span className={s.precoMoeda}>R$</span>
      <strong className="num">{inteiro}</strong>
      {resto && <span className={`${s.precoCentavos} num`}>{resto}</span>}
      {sufixo && <span className={s.precoSufixo}>{sufixo}</span>}
    </span>
  )
}

/**
 * Card no desenho do "Pricing Section with Frequency Toggle" (21st.dev,
 * @efferd): cabeçalho com selos no canto, lista no meio, botão no rodapé.
 * O alternador aqui é CSS puro (rádios + :has), sem JavaScript.
 */
function Planos({ precos }: { precos: DadosDaLanding['precos'] }) {
  return (
    <section id="planos" className={`${s.secao} ${s.faixaEscura}`} aria-labelledby="t-planos">
      <div className={s.conteudo}>
        <div className={s.planosEnvelope}>
          <input type="radio" name="modalidade" value="mensal" id="m-mensal" className={s.radio} defaultChecked />
          <input type="radio" name="modalidade" value="temporada" id="m-temporada" className={s.radio} />
          <Cabecalho
            id="t-planos"
            rotulo="Planos"
            titulo="Escolha seu plano"
            destaque="e comece hoje."
            texto="Comece no Grátis. Quando quiser a Lista Secreta e o Fire Live, é só subir de plano."
          />
          <div className={s.alternador} role="group" aria-label="Período do plano">
            <label htmlFor="m-mensal">Mensal</label>
            <label htmlFor="m-temporada">
              Temporada <span className={s.melhorPreco}>economize</span>
            </label>
          </div>
          <div className={s.planos}>
            {ORDEM_DOS_NIVEIS.map((nivel) => {
              const skus = nivel === 'GRATIS' ? null : SKU_DO_PLANO[nivel]
              const popular = nivel === 'MVP'
              return (
                <article key={nivel} className={s.plano} data-popular={popular || undefined} aria-labelledby={`p-${nivel}`}>
                  <div className={s.planoCabeca}>
                    <div className={s.planoSelos}>
                      {popular && <span className={s.seloPopular}>Recomendado</span>}
                      {skus &&
                        precos &&
                        (['mensal', 'temporada'] as const).map((m) => {
                          const p = precos.porSku[skus[m]]
                          if (!p.deCentavos) return null
                          const desconto = Math.round((1 - p.centavos / p.deCentavos) * 100)
                          return (
                            <span key={m} className={s.seloDesconto} data-modalidade={m}>
                              −{desconto}%
                            </span>
                          )
                        })}
                    </div>
                    <h3 id={`p-${nivel}`} className={s.planoNome}>
                      {ROTULO_DO_NIVEL[nivel]}
                    </h3>
                    <p className={s.planoChamada}>{CHAMADA[nivel]}</p>
                    <div className={s.planoValor}>
                      {!skus ? (
                        <>
                          <Preco centavos={0} sufixo="" />
                          <span className={s.cobranca}>para sempre</span>
                        </>
                      ) : precos ? (
                        (['mensal', 'temporada'] as const).map((m) => {
                          const p = precos.porSku[skus[m]]
                          return (
                            <div key={m} data-modalidade={m}>
                              <Preco centavos={p.centavos} sufixo={m === 'mensal' ? '/mês' : '/temporada'} />
                              <span className={s.cobranca}>
                                {p.deCentavos ? (
                                  <>
                                    de <s>{`R$ ${(p.deCentavos / 100).toFixed(2).replace('.', ',')}`}</s> ·{' '}
                                  </>
                                ) : null}
                                {m === 'mensal' ? 'cobrança mensal' : 'vale até o fim da temporada'}
                              </span>
                            </div>
                          )
                        })
                      ) : null}
                    </div>
                  </div>
                  <ul className={s.beneficios}>
                    {BENEFICIOS_POR_NIVEL[nivel].map((b) => {
                      const emBreve = b.endsWith('(em breve)')
                      return (
                        <li key={b} data-em-breve={emBreve || undefined}>
                          <IcCheck tamanho={15} />
                          <span>
                            {emBreve ? b.replace(' (em breve)', '') : b}
                            {emBreve && <span className={s.emBreve}>em breve</span>}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                  <div className={s.planoPe}>
                    <Link href={CADASTRO} className={popular ? s.botao : s.botaoEscuro} data-largo>
                      {nivel === 'GRATIS' ? 'Criar conta grátis' : `Quero o ${ROTULO_DO_NIVEL[nivel]}`}
                    </Link>
                  </div>
                </article>
              )
            })}
          </div>
          <p className={s.seguro}>
            <IcEscudo tamanho={15} /> Pagamento pelo Mercado Pago · Grátis sem cartão
          </p>
        </div>
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------- Página */

export function TelaLanding({ dados }: { dados: DadosDaLanding }) {
  // Os avisos do herói são a forma do push, com os acertos da noite
  // CONFERIDA no lugar da lista de hoje (que é paga). As HORAS ("19:00",
  // "23:41"…) são cenário ilustrativo do desenho do push, não dado: o bloco
  // inteiro é aria-hidden e não tem carimbo real.
  const [a, b, c] = dados.noite?.acertos ?? []
  return (
    <div className={`${s.pagina} ${fonteTitulo.variable} ${fonteCorpo.variable}`}>
      {/* ---------- Navegação ---------- */}
      <header className={s.nav}>
        <div className={s.navDentro}>
          <Link href="/conheca" aria-label="NIP, início" className={s.navMarca}>
            <Logo largura={96} prioridade />
          </Link>
          <nav className={s.navLinks} aria-label="Seções">
            <a href="#recursos">Recursos</a>
            <a href="#como-funciona">Como funciona</a>
            <a href="#planos">Planos</a>
            <Link href="/placar">Placar</Link>
            <a href="#faq">Dúvidas</a>
          </nav>
          <div className={s.navAcoes}>
            <Link href={ENTRAR} className={s.botaoContorno}>
              <IcEntrar tamanho={15} /> Entrar
            </Link>
            <Link href={CADASTRO} className={s.botao} data-pequeno>
              Começar agora
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* ---------- Herói ---------- */}
        <section className={s.heroi} aria-labelledby="t-heroi">
          <div className={s.heroiDentro}>
            <div className={s.heroiTexto}>
              <p className={s.selo}>
                <span className={s.seloPonto} /> NBA · Temporada 2025-26
              </p>
              <h1 id="t-heroi" className={s.h1}>
                Os apitos da NBA,
                <br />
                <span className={s.azul}>antes da bola subir.</span>
              </h1>
              <p className={s.heroiLead}>
                Todo dia a NIP cruza média, sequência e desfalque confirmado de cada jogador e entrega uma lista curta:
                quem tem oportunidade, em qual mercado, com a odd das casas e a nota de confiança. No 1º quarto, o Fire
                Live avisa quem está batendo o alvo.
              </p>
              <div className={s.acoes}>
                <Link href={CADASTRO} className={s.botao} data-grande>
                  Quero ver a lista de hoje <IcSeta tamanho={16} />
                </Link>
                <a href="#planos" className={s.botaoEscuro} data-grande>
                  Ver planos
                </a>
              </div>
              <ul className={s.checksHeroi}>
                {CHECKS_DO_HEROI.map((t) => (
                  <li key={t}>
                    <IcCheck tamanho={14} />
                    {t}
                  </li>
                ))}
              </ul>
            </div>

            <div className={s.heroiVisual}>
              <div className={s.brilho} aria-hidden />
              <div className={s.celular}>
                <div className={s.celularTela}>
                  <Image src="/landing/celular-lista.jpg" alt="A Lista Secreta no celular" width={780} height={1688} priority sizes="300px" />
                </div>
              </div>
              <Aviso className={s.aviso1} titulo="Lista Secreta publicada" texto={`${dados.totalDeApitos} apitos na rodada`} hora="19:00" />
              {a && (
                <Aviso
                  className={s.aviso2}
                  titulo={`Bateu · Apito N${a.nivelApito}${a.turbo ? ' · Turbo' : ''}`}
                  texto={`${a.nome} ${mercado(a)} · fez ${a.fez}`}
                  hora="23:41"
                />
              )}
              {a && (
                <Aviso
                  className={s.aviso3}
                  titulo="Resultado conferido"
                  texto={`${a.placar.visitanteSigla} ${a.placar.placarVisitante ?? '—'} × ${a.placar.placarCasa ?? '—'} ${a.placar.casaSigla} · ${dados.noite!.bateram} de ${dados.noite!.conferidos} bateram`}
                  hora="23:58"
                />
              )}
              {c && <Aviso className={s.aviso4} titulo={`Bateu · Apito N${c.nivelApito}`} texto={`${c.nome} ${mercado(c)} · fez ${c.fez}`} hora="23:52" />}
              {!c && b && <Aviso className={s.aviso4} titulo={`Bateu · Apito N${b.nivelApito}`} texto={`${b.nome} ${mercado(b)} · fez ${b.fez}`} hora="23:52" />}
            </div>
          </div>
        </section>

        {/* ---------- Faixa corrida ---------- */}
        <section className={s.faixa} aria-label="O que a NIP entrega">
          <div className={s.faixaTrilho}>
            {[0, 1].map((copia) => (
              <ul key={copia} className={s.faixaLista} aria-hidden={copia === 1 || undefined}>
                {FAIXA.map((f) => (
                  <li key={f.texto}>
                    <span className={s.faixaIcone} style={{ color: f.cor }}>
                      <Ic nome={f.icone} tamanho={16} />
                    </span>
                    {f.texto}
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </section>

        {/* ---------- Cena: o produto no notebook ---------- */}
        <section className={s.cena} aria-labelledby="t-cena">
          <Cabecalho
            id="t-cena"
            rotulo="A plataforma"
            titulo="O box score de 30 times"
            destaque="resumido em uma lista."
            texto="Abriu a NIP, já vê quem apitou, contra quem joga, a linha, a odd nas casas e como foram os últimos 5 jogos."
          />
          <div className={s.notebook}>
            <div className={s.notebookTela}>
              <Image src="/landing/app-lista.jpg" alt="A Lista Secreta no computador" width={2160} height={1350} sizes="(max-width: 1023px) 100vw, 920px" />
            </div>
            <div className={s.notebookBase} aria-hidden />
            {a && (
              <div className={`${s.chip} ${s.chip1}`} aria-hidden>
                <span className={s.chipIcone} style={{ color: 'var(--bateu-texto)' }}>
                  <IcTrofeu tamanho={16} />
                </span>
                <span>
                  <strong>Conferido</strong>
                  <em className="num">
                    {a.placar.visitanteSigla} {a.placar.placarVisitante ?? '—'}–{a.placar.placarCasa ?? '—'} {a.placar.casaSigla}
                  </em>
                </span>
              </div>
            )}
            {a && (
              <div className={`${s.chip} ${s.chip2}`} aria-hidden>
                <span className={s.chipIcone} style={{ color: 'var(--confianca-4)' }}>
                  <IcAlvo tamanho={16} />
                </span>
                <span>
                  <strong>
                    {a.nome.split(' ').at(-1)} · {mercado(a)}
                  </strong>
                  <em>
                    {a.confianca !== null && (
                      <>
                        Confiança <b>{Math.round(a.confianca)}%</b> ·{' '}
                      </>
                    )}
                    fez {a.fez}
                  </em>
                </span>
              </div>
            )}
          </div>
        </section>

        {/* ---------- Recursos (bento) ---------- */}
        <section id="recursos" className={s.secao} aria-labelledby="t-recursos">
          <div className={s.conteudo}>
            <Cabecalho
              id="t-recursos"
              rotulo="O que tem dentro"
              titulo="Cada número"
              destaque="no lugar certo."
              texto="Nada de tela cheia de estatística solta. A NIP mostra só o que pesa na decisão."
            />
            <Bento dados={dados} />
          </div>
        </section>

        {/* ---------- O porquê do apito ---------- */}
        <section className={`${s.secao} ${s.faixaEscura}`} aria-labelledby="t-apito">
          <div className={`${s.conteudo} ${s.dividido}`}>
            <Moldura imagem="/landing/app-apito.jpg" url="nip.app/apito" alt="O detalhe de um apito" />
            <div className={s.divididoTexto}>
              <Cabecalho
                id="t-apito"
                rotulo="Detalhe do apito"
                titulo="Todo apito vem"
                destaque="com o porquê."
                texto="Toque no jogador e veja por que ele entrou na lista, contra quem joga e como chega para o jogo."
                esquerda
              />
              <ul className={s.pilulas}>
                {CHECKS_DO_APITO.map((t) => (
                  <li key={t}>
                    <IcCheck tamanho={14} />
                    {t}
                  </li>
                ))}
              </ul>
              <a href="#planos" className={s.botao} data-grande>
                Ver planos <IcSeta tamanho={16} />
              </a>
            </div>
          </div>
        </section>

        {/* ---------- Ferramentas ---------- */}
        <section className={s.secao} aria-labelledby="t-ferramentas">
          <div className={s.conteudo}>
            <Cabecalho
              id="t-ferramentas"
              rotulo="Ferramentas"
              titulo="Da lista ao resultado,"
              destaque="sem trocar de aba."
              texto="Escolher o jogador, acompanhar o 1º quarto, dimensionar a entrada e conferir no fim da noite."
            />
            <div className={s.ferramentas}>
              {FERRAMENTAS.map((f, i) => (
                <article key={f.url} className={s.ferramenta}>
                  <div className={s.ferramentaTexto}>
                    <span className={`${s.ferramentaNumero} num`}>{String(i + 1).padStart(2, '0')}</span>
                    <h3 className={s.h3}>
                      {f.titulo[0]} <span className={s.azul}>{f.titulo[1]}</span>
                    </h3>
                    <p>{f.texto}</p>
                    <ul className={s.listaCheck}>
                      {f.pontos.map((p) => (
                        <li key={p}>
                          <IcCheck tamanho={14} />
                          {p}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <Moldura imagem={f.imagem} url={f.url} alt={f.titulo.join(' ')} />
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- Como funciona ---------- */}
        <section id="como-funciona" className={`${s.secao} ${s.faixaEscura}`} aria-labelledby="t-passos">
          <div className={s.conteudo}>
            <Cabecalho id="t-passos" rotulo="Como funciona" titulo="Do cadastro à" destaque="primeira rodada." />
            <ol className={s.passos}>
              {PASSOS.map((p, i) => (
                <li key={p.titulo} className={s.passo}>
                  <span className={s.passoNo}>
                    <Ic nome={p.icone} tamanho={18} />
                  </span>
                  <span className={`${s.passoNumero} num`}>Passo {i + 1}</span>
                  <h3>{p.titulo}</h3>
                  <p>{p.texto}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ---------- Comparativo (no desenho do "Dark Matrix", 21st.dev) ---------- */}
        <section className={s.secao} aria-labelledby="t-comparativo">
          <div className={s.conteudo}>
            <Cabecalho
              id="t-comparativo"
              rotulo="Comparativo"
              titulo="Com a NIP"
              destaque="ou no braço."
              texto="Os números existem em qualquer site. O que muda é quanto tempo você leva para chegar numa decisão."
            />
            <div className={s.tabelaCaixa}>
              <table className={s.tabela}>
                <thead>
                  <tr>
                    <th scope="col" className={s.criterioCab}>
                      O que você precisa
                    </th>
                    <th scope="col" className={s.colNip}>
                      <span className={s.cabNip}>
                        <Logo largura={54} />
                      </span>
                      <span className="so-leitor">Com a NIP</span>
                    </th>
                    <th scope="col" className={s.criterioCab}>
                      No braço
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARATIVO.map((l) => (
                    <tr key={l.criterio}>
                      <th scope="row">
                        <span className={s.criterio}>
                          <Ic nome={l.icone} tamanho={15} />
                          {l.criterio}
                        </span>
                      </th>
                      <td className={s.colNip}>
                        <span className={s.sim}>
                          <IcCheck tamanho={15} />
                          {l.nip}
                        </span>
                      </td>
                      <td>
                        <span className={s.nao}>
                          <IcX tamanho={13} />
                          {l.manual}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ---------- Chamada ---------- */}
        <section className={s.chamada} aria-labelledby="t-chamada">
          <div className={s.chamadaCard}>
            <p className={s.rotulo} data-claro>
              Rodada de hoje
            </p>
            <h2 id="t-chamada" className={s.chamadaTitulo}>
              A próxima rodada
              <br />
              já tem lista.
            </h2>
            <p>Crie a conta grátis, veja a plataforma por dentro e assine quando quiser a lista inteira.</p>
            <Link href={CADASTRO} className={s.botaoBranco}>
              Quero começar agora <IcSeta tamanho={16} />
            </Link>
          </div>
        </section>

        <Planos precos={dados.precos} />

        {/* ---------- Dúvidas ---------- */}
        <section id="faq" className={s.secao} aria-labelledby="t-faq">
          <div className={`${s.conteudo} ${s.faqGrade}`}>
            <div>
              <Cabecalho
                id="t-faq"
                rotulo="Dúvidas"
                titulo="Antes de"
                destaque="assinar."
                texto="O que mais perguntam para a gente. Se ficou alguma, comece no Grátis e veja por dentro."
                esquerda
              />
              <Link href={CADASTRO} className={s.botao} data-grande>
                Criar conta grátis
              </Link>
            </div>
            <div className={s.faq}>
              {PERGUNTAS.map((p, i) => (
                <details key={p.pergunta} className={s.pergunta} open={i === 0}>
                  <summary>
                    {p.pergunta}
                    <span className={s.perguntaIcone}>
                      <IcMais tamanho={14} />
                    </span>
                  </summary>
                  <p>{p.resposta}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* ---------- Rodapé ---------- */}
      <footer className={s.rodape}>
        <div className={s.rodapeGrade}>
          <div className={s.rodapeMarca}>
            <Logo largura={110} />
            <p>Análise da NBA para quem decide com número. Lista Secreta, Fire Live, estatística e gestão de banca.</p>
          </div>
          <div>
            <p className={s.rodapeTitulo}>Plataforma</p>
            <a href="#recursos">Recursos</a>
            <a href="#como-funciona">Como funciona</a>
            <a href="#planos">Planos</a>
            <Link href={ENTRAR}>Entrar</Link>
          </div>
          <div>
            <p className={s.rodapeTitulo}>Ajuda</p>
            <a href="#faq">Dúvidas</a>
            <Link href="/placar">Placar do NIP</Link>
            <Link href="/como-funciona">Metodologia</Link>
          </div>
          <div>
            <p className={s.rodapeTitulo}>Jogo responsável</p>
            <p className={s.rodapeTexto}>
              <span className={s.selo18}>18+</span> Proibido para menores. Aposte com responsabilidade.
            </p>
          </div>
        </div>
        <div className={s.rodapeBase}>
          <span>© {new Date().getFullYear()} NIP · NBA Intelligence Platform</span>
          <span>A NIP é uma ferramenta de análise e não garante resultado. Nota de confiança não é probabilidade de acerto.</span>
        </div>
      </footer>
    </div>
  )
}
