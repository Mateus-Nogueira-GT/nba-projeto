import Link from 'next/link'
import type { AcessoComNivel } from '@/modules/plataforma/assinatura/direito'
import {
  NIVEIS_PAGOS,
  ORDEM_DOS_NIVEIS,
  ROTULO_DA_MODALIDADE,
  ROTULO_DO_NIVEL,
  type NivelDoPlano,
} from '@/modules/plataforma/assinatura/nivel-do-plano'
import type { PrecosDosPlanos } from '@/modules/plataforma/assinatura/precos'
import type { Oferta, Sku } from '@/modules/plataforma/assinatura/sku'
import { contratar } from './acoes'
import { BENEFICIOS_POR_NIVEL } from './matriz'
import { precoEmReais } from './preco'
import s from './Planos.module.css'

const SKU_DO_PLANO: Record<'MVP' | 'ALL_STAR', { mensal: Sku; temporada: Sku }> = {
  MVP: { mensal: 'MVP_MENSAL', temporada: 'MVP_TEMPORADA' },
  ALL_STAR: { mensal: 'ALL_STAR_MENSAL', temporada: 'ALL_STAR_TEMPORADA' },
}

const CHAMADA: Record<NivelDoPlano, string> = {
  GRATIS: 'Para conhecer a NIP.',
  MVP: 'A metodologia inteira, todo dia.',
  ALL_STAR: 'Tudo do MVP, com mais acesso e proximidade.',
}

/** "(em breve)" é promessa comercial ainda não entregue: aparece, mas dizendo a verdade. */
function Beneficio({ texto }: { texto: string }) {
  const emBreve = texto.endsWith('(em breve)')
  return (
    <li className={s.beneficio} data-em-breve={emBreve}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M5 12.5 10 17 19 7" />
      </svg>
      <span>
        {emBreve ? texto.replace(' (em breve)', '') : texto}
        {emBreve && <span className={s.emBreve}>em breve</span>}
      </span>
    </li>
  )
}

export function TelaPlanos({
  acesso,
  destacado,
  voltar,
  erro,
  precos,
  ofertas,
  checkoutHabilitado,
}: {
  acesso: AcessoComNivel
  destacado: NivelDoPlano | null
  voltar: string
  erro?: string
  precos: PrecosDosPlanos | null
  ofertas: Oferta[]
  checkoutHabilitado: boolean
}) {
  const substitui = ofertas.some((o) => o.substituiPlanoAtual)
  const ofertaDe = (sku: Sku) => ofertas.find((o) => o.sku === sku)

  return (
    <div className={s.tela}>
      <header className={s.cabecalho}>
        <div>
          <h1 className={s.titulo}>Planos</h1>
          <p className={s.subtitulo}>
            O que cada nível da NIP entrega. Você está no plano{' '}
            <strong>{ROTULO_DO_NIVEL[acesso.nivel]}</strong>.
          </p>
        </div>
        <Link href={voltar} className={s.voltar}>
          Voltar
        </Link>
      </header>

      {erro && (
        <p role="alert" className={s.erro}>
          {erro === 'limite' ? 'Muitas tentativas. Aguarde alguns minutos.' : 'O checkout está temporariamente indisponível.'}
        </p>
      )}
      {/* O AVISO VEM ANTES DOS BOTÕES: depois de cobrar, avisar já não é avisar. */}
      {substitui && (
        <p role="note" className={s.aviso}>
          Ao contratar, o seu plano atual é encerrado assim que o pagamento for confirmado, sem
          devolução do período restante.
        </p>
      )}

      <div className={s.grade}>
        {ORDEM_DOS_NIVEIS.map((nivel) => {
          const atual = acesso.nivel === nivel
          const pago = (NIVEIS_PAGOS as readonly string[]).includes(nivel)
          const skus = pago ? SKU_DO_PLANO[nivel as 'MVP' | 'ALL_STAR'] : null
          return (
            <section
              key={nivel}
              className={s.plano}
              data-destaque={nivel === destacado || (destacado === null && nivel === 'MVP')}
              data-atual={atual}
              aria-labelledby={`plano-${nivel}`}
            >
              <header className={s.planoTopo}>
                <div className={s.planoNomeLinha}>
                  <h2 id={`plano-${nivel}`} className={s.planoNome} aria-current={atual ? 'true' : undefined}>
                    {ROTULO_DO_NIVEL[nivel]}
                  </h2>
                  {atual && <span className={s.selo}>Seu plano</span>}
                </div>
                <p className={s.chamada}>{CHAMADA[nivel]}</p>
              </header>

              <div className={s.precos}>
                {!skus ? (
                  <p className={s.preco}>
                    <strong className="num">R$ 0</strong>
                  </p>
                ) : precos ? (
                  (['mensal', 'temporada'] as const).map((modalidade) => {
                    const sku = skus[modalidade]
                    const p = precos.porSku[sku]
                    const oferta = ofertaDe(sku)
                    return (
                      <div key={sku} className={s.opcao}>
                        <div className={s.opcaoTexto}>
                          <span className={s.modalidade}>{ROTULO_DA_MODALIDADE[modalidade === 'mensal' ? 'MENSAL' : 'TEMPORADA']}</span>
                          <span className={s.preco}>
                            {p.deCentavos && <s className={s.de}>{precoEmReais(p.deCentavos)}</s>}
                            <strong className="num">{precoEmReais(p.centavos)}</strong>
                            <span className={s.periodo}>{modalidade === 'mensal' ? '/ mês' : 'até o fim da temporada'}</span>
                          </span>
                        </div>
                        {oferta && (
                          <form action={contratar}>
                            <input type="hidden" name="sku" value={sku} />
                            <button type="submit" className={s.contratar}>
                              Contratar
                            </button>
                          </form>
                        )}
                      </div>
                    )
                  })
                ) : null}
              </div>

              <ul className={s.beneficios}>
                {BENEFICIOS_POR_NIVEL[nivel].map((b) => (
                  <Beneficio key={b} texto={b} />
                ))}
              </ul>
            </section>
          )
        })}
      </div>

      {ofertas.length === 0 && (
        <p className={s.nota}>
          {/* Nunca afirmar que a pessoa está "no topo": a lista também fica vazia para
              quem não está lá (janela de temporada fechada). */}
          {checkoutHabilitado && precos && acesso.nivel !== 'GRATIS'
            ? 'Não há plano para contratar acima do seu agora.'
            : 'A contratação pelo app chega em breve. Enquanto isso, fale com quem administra a sua conta.'}
        </p>
      )}
      <p className={s.nota}>
        {/* Sem a palavra "probabilidade", nem negada: a ressalva mora na
            metodologia (P12); na vitrine de preço ela não aparece
            (planos-assinar.test.tsx). */}
        A contratação acontece no ambiente seguro do Mercado Pago. O número em cada apito é a nota
        de confiança da análise NIP. <Link href="/conta">Ver minha conta</Link>
      </p>
    </div>
  )
}
