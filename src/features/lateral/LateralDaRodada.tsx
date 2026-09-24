import Link from 'next/link'
import { Secao } from '@/ui/blocos'
import { diaDaRodada } from '@/ui/formato'
import { IconeAvancar } from '@/ui/icones'
import { carregarLateral } from './carregar'
import { Classificacao } from './Classificacao'
import s from './Lateral.module.css'

const inteiro = (fracao: number) => `${Math.round(fracao * 100)}%`

/**
 * A COLUNA DA RODADA das telas de seção (Ao Vivo, Estatísticas, Gestão,
 * Resultados) — o que o front anterior chamava de lateral.
 *
 * Mostra o que o resumo da Lista não mostra: os apitos PUBLICADOS da última
 * noite, o estado "noite em curso" (em vez de sumir com o bloco) e a
 * classificação por conferência. Só dado grátis: nada aqui lê o feed pago.
 */
export async function LateralDaRodada() {
  const dados = await carregarLateral()
  const { noite, temporada, classificacao } = dados

  return (
    <div className={s.lateral}>
      {noite === null ? (
        <Secao titulo="Última noite">
          <p className={s.apoio}>Ainda sem noite conferida nesta temporada.</p>
        </Secao>
      ) : (
        <Secao
          titulo={`Noite de ${diaDaRodada(noite.data)}`}
          acao={
            <Link href={`/resultados/${noite.data}`} className={s.link}>
              Ver a noite <IconeAvancar tamanho={14} />
            </Link>
          }
        >
          <dl className={s.numeros}>
            <div>
              <dt>Apitos</dt>
              <dd className="num">{noite.publicados}</dd>
            </div>
            <div>
              <dt>Bateram</dt>
              {/* Enquanto a noite não termina, "—": taxa parcial seria número
                  inventado sobre jogos que ainda estão rolando. */}
              <dd className="num">{noite.noiteEncerrada ? noite.bateram : '—'}</dd>
            </div>
            <div>
              <dt>Na noite</dt>
              <dd className="num" data-tom={noite.noiteEncerrada ? 'bom' : undefined}>
                {noite.noiteEncerrada && noite.taxa !== null ? inteiro(noite.taxa) : '—'}
              </dd>
            </div>
          </dl>
          {!noite.noiteEncerrada && <p className={s.apoio}>Aguardando o fim da noite.</p>}
          {temporada && temporada.conferidos > 0 && (
            <p className={s.apoio}>
              Temporada: {inteiro(temporada.acertos / temporada.conferidos)} em{' '}
              {temporada.conferidos} apitos.
            </p>
          )}
        </Secao>
      )}

      <Secao titulo="Classificação" apoio={`Temporada ${classificacao.temporada}`}>
        <Classificacao classificacao={classificacao} />
      </Secao>
    </div>
  )
}
