import Link from 'next/link'
import { getDb } from '@/modules/dominio/db/cliente'
import { dataDeReferencia, somarDias } from '@/modules/dominio/rodada'
import { calendarioDoRuleset } from '@/modules/dominio/temporada'
import { jogosDoDiaResumo, ordenarPorSinal } from '@/modules/entrega/lista-por-jogo'
import { agruparPorJogador } from '@/modules/entrega/lista-secreta'
import { diasDaTemporada } from '@/modules/entrega/resultados'
import { resumoDaNoiteCacheado } from '@/app/_cache/rodada'
import { lerFeedCacheado } from '@/app/_cache/feed'
import { taxaDaTemporadaCacheada } from '@/app/_cache/temporada'
import { configuracaoChat } from '@/modules/entrega/chat-limites'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import { exigirNivel } from '@/modules/plataforma/assinatura/guarda'
import { atende } from '@/modules/plataforma/assinatura/nivel-do-plano'
import { Secao } from '@/ui/blocos'
import { diaCurto, hora } from '@/ui/formato'
import { IconeAvancar, IconeTurbo } from '@/ui/icones'
import { ATRIBUTO_CURTO, PilulaConfianca, SeloAoVivo } from '@/ui/marcas'
import { FotoJogador, LogoTime } from '@/ui/midia'
import { linha as fmtLinha } from '@/ui/formato'
import { CampoDoAssistente } from '@/features/assistente/CampoDoAssistente'
import s from './Resumo.module.css'

/**
 * A coluna direita da Lista quando nenhum apito está aberto: o que um
 * apostador quer saber de relance antes de escolher — os jogos, como foi a
 * última noite, a taxa da temporada e os turbos do dia.
 */
export async function ResumoDaRodada() {
  const { acesso } = await exigirNivel('GRATIS', '/')
  const ruleset = await rulesetAtivo()
  const { fuso } = ruleset.rodada
  const hoje = dataDeReferencia(new Date(), fuso)
  const assinante = atende(acesso.nivel, 'MVP')

  // A última noite é igual para todos e muda poucas vezes por dia: pelo
  // cache (tag da lateral). Os jogos de hoje são ao vivo — ficam diretos.
  const [jogos, { ultima, recap }] = await Promise.all([
    jogosDoDiaResumo(getDb(), hoje, fuso),
    resumoDaNoiteCacheado(hoje),
  ])
  const [taxa, feed] = await Promise.all([
    // A taxa da temporada é agregado caro e igual para todos: pelo cache da
    // Tarefa 2, com a tag da lateral que os crons da rodada já invalidam.
    ultima
      ? taxaDaTemporadaCacheada(somarDias(ultima, 1), diasDaTemporada(ultima, calendarioDoRuleset(ruleset)))
      : null,
    // O feed pago só para quem passou pelo `atende` acima — e pelo cache.
    assinante ? lerFeedCacheado(hoje) : null,
  ])
  const turbos = feed ? ordenarPorSinal(agruparPorJogador(feed.conteudo.itens)).filter((i) => i.turbo).slice(0, 4) : []

  return (
    <div className={s.resumo}>
      <Secao titulo="Jogos de hoje">
        <ul className={s.jogos}>
          {jogos.map((j) => (
            <li key={j.id} className={s.jogo}>
              <span className={s.times}>
                <LogoTime sigla={j.visitanteSigla} tamanho={20} />
                <span>{j.visitanteSigla}</span>
                {j.status !== 'AGENDADO' && j.placarVisitante !== null ? (
                  <strong className="num">
                    {j.placarVisitante}–{j.placarCasa}
                  </strong>
                ) : (
                  <span className={s.fraco}>@</span>
                )}
                <span>{j.casaSigla}</span>
                <LogoTime sigla={j.casaSigla} tamanho={20} />
              </span>
              {j.status === 'AO_VIVO' ? (
                <SeloAoVivo texto={j.quartoAtual ? `${j.quartoAtual}º Q` : 'Ao vivo'} />
              ) : j.status === 'ENCERRADO' ? (
                <span className={s.fraco}>Final</span>
              ) : (
                <span className={`${s.hora} num`}>{hora(j.dataHoraUtc, fuso)}</span>
              )}
            </li>
          ))}
        </ul>
      </Secao>

      {recap && recap.noiteEncerrada && (
        <Secao
          titulo={`Noite de ${diaCurto(recap.dataReferencia)}`}
          acao={
            <Link href={`/resultados/${recap.dataReferencia}`} className={s.link}>
              Ver <IconeAvancar tamanho={14} />
            </Link>
          }
        >
          <dl className={s.numeros}>
            <div>
              <dt>Bateram</dt>
              <dd className="num">
                {recap.bateram}
                <span>/{recap.conferidos}</span>
              </dd>
            </div>
            <div>
              <dt>Taxa</dt>
              <dd className="num" data-tom="bom">
                {recap.taxa === null ? '—' : `${Math.round(recap.taxa * 100)}%`}
              </dd>
            </div>
          </dl>
          {recap.apitoDaNoite && (
            <div className={s.destaque}>
              <FotoJogador nome={recap.apitoDaNoite.nome} fotoUrl={recap.apitoDaNoite.fotoUrl} tamanho={36} />
              <span className={s.destaqueTexto}>
                <span className={s.rotulo}>Apito da noite</span>
                <strong>{recap.apitoDaNoite.nome}</strong>
                <span className={s.fraco}>
                  fez {recap.apitoDaNoite.fez ?? '—'} {ATRIBUTO_CURTO[recap.apitoDaNoite.atributo]}
                </span>
              </span>
            </div>
          )}
        </Secao>
      )}

      {taxa && taxa.conferidos > 0 && (
        <Secao titulo="Temporada">
          <dl className={s.numeros}>
            <div>
              <dt>Acertos</dt>
              <dd className="num">
                {taxa.acertos}
                <span>/{taxa.conferidos}</span>
              </dd>
            </div>
            <div>
              <dt>Taxa</dt>
              <dd className="num" data-tom="bom">
                {Math.round((taxa.acertos / taxa.conferidos) * 100)}%
              </dd>
            </div>
          </dl>
          <p className={s.nota}>
            Em {taxa.rodadas} {taxa.rodadas === 1 ? 'rodada conferida' : 'rodadas conferidas'}.
          </p>
        </Secao>
      )}

      {turbos.length > 0 && (
        <Secao titulo="Turbos de hoje">
          <ul className={s.turbos}>
            {turbos.map((i) => (
              <li key={i.chave}>
                <Link href={`/apito/${i.jogadorId}?atributo=${i.atributo}`} scroll={false} className={s.turbo}>
                  <FotoJogador nome={i.nome} fotoUrl={i.fotoUrl} tamanho={36} anel="var(--apito-turbo)" />
                  <span className={s.destaqueTexto}>
                    <strong>{i.nome}</strong>
                    <span className={s.fraco}>
                      <IconeTurbo tamanho={12} className={s.raio} />
                      {i.linha !== null ? `+${fmtLinha(i.linha)} ` : ''}
                      {ATRIBUTO_CURTO[i.atributo]} · {i.timeSigla}
                    </span>
                  </span>
                  <PilulaConfianca valor={i.confianca} grau={i.grauConfianca} />
                </Link>
              </li>
            ))}
          </ul>
        </Secao>
      )}
      {/* A doca do assistente segue a regra do botão: nível E chat ligado. */}
      {assinante && configuracaoChat().habilitado && (
        <div className={s.doca}>
          <CampoDoAssistente />
        </div>
      )}
    </div>
  )
}
