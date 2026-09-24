import type { ReactNode } from 'react'
import type { Atributo, Nivel, NivelApito } from '@/modules/motor/tipos'
import { Minigrafico } from '@/ui/graficos'
import { IconeFogo, IconeTurbo } from '@/ui/icones'
import { corDoApito, IndicadorApito, PilulaConfianca, PilulaMercado, ROTULO_NIVEL, SeloNivel } from '@/ui/marcas'
import { FotoJogador } from '@/ui/midia'
import { oddDaLinha } from '@/ui/odd'
import type { Metodologia } from './carregar'
import s from './Metodologia.module.css'

const n = (v: number) => String(v).replace('.', ',')

/**
 * A odd do exemplo na FORMA que o ruleset manda (`odds.exibicao`), pelo mesmo
 * `oddDaLinha` da lista: com `media` o exemplo mostrava uma faixa, e virar a
 * chave no YAML deixava a página explicando uma coisa e desenhando outra.
 */
function oddDoExemplo(exibicao: string) {
  const casas = { min: 1.47, max: 1.62, qtdCasas: 3 }
  return oddDaLinha(
    exibicao === 'casa_unica'
      ? { min: 1.85, max: 1.85, qtdCasas: 1, unica: 1.85 }
      : exibicao === 'media'
        ? { ...casas, media: 1.54 }
        : casas,
  )
}

const ROTULO_ATRIBUTO: Record<Atributo, string> = { PONTOS: 'Pontos', REBOTES: 'Rebotes', ASSISTENCIAS: 'Assistências' }

const DESCRICAO_NIVEL: Record<Nivel, string> = {
  MVP: 'Superestrela consolidada, estatística consistentemente alta.',
  ALL_STAR: 'Grande destaque da liga, ainda abaixo do MVP.',
  SUPORTE: 'Oscila bastante, mas tem papel fundamental no time.',
  RANDOLA: 'Poucas aparições brilhantes, na maioria reserva.',
}

const ROTULO_APITO: Record<NivelApito, string> = { 1: 'Nível 1', 2: 'Nível 2', 3: 'Nível 3' }

function Secao({ id, titulo, children }: { id: string; titulo: string; children: ReactNode }) {
  return (
    <section id={id} className={s.secao} aria-labelledby={`t-${id}`}>
      <h2 id={`t-${id}`} className={s.tituloSecao}>
        {titulo}
      </h2>
      {children}
    </section>
  )
}

function Caixa({ children, destaque = false }: { children: ReactNode; destaque?: boolean }) {
  return <div className={s.caixa} data-destaque={destaque}>{children}</div>
}

/** O sumário lateral (desktop) — a metodologia é longa, e se lê aos pedaços. */
export const SUMARIO: { id: string; rotulo: string }[] = [
  { id: 'o-que-faz', rotulo: 'O que o app faz' },
  { id: 'niveis', rotulo: 'Níveis de jogador' },
  { id: 'apito', rotulo: 'Nível do apito' },
  { id: 'oscilacao', rotulo: 'Oscilação' },
  { id: 'opd', rotulo: 'OPD' },
  { id: 'confianca', rotulo: 'Nota de confiança' },
  { id: 'atributos', rotulo: 'Atributos' },
  { id: 'odds', rotulo: 'Odds' },
  { id: 'fire-live', rotulo: 'Fire Live' },
  { id: 'greens', rotulo: 'Notificações e greens' },
  { id: 'blowout', rotulo: 'Jogo decidido' },
  { id: 'exemplo', rotulo: 'Exemplo de linha' },
]

/**
 * A METODOLOGIA NIP, escrita uma vez. Duas telas a mostram: `/como-funciona`
 * (leitura) e `/metodologia` (portão de aceite). Todo número vem do ruleset.
 */
export function ConteudoDaMetodologia({ ruleset, t, faixasConfianca }: Metodologia) {
  const oddExemplo = oddDoExemplo(ruleset.odds.exibicao)
  return (
    <div className={s.conteudo}>
      <Secao id="o-que-faz" titulo="Antes de tudo: o que o app faz">
        <Caixa destaque>
          <p>
            A NIP lê os números da NBA, aplica sua metodologia e mostra os jogadores{' '}
            <strong>apitados</strong> — os que a análise aponta como bons candidatos. São duas
            estratégias: a <strong>Lista Secreta</strong>, publicada antes dos jogos, e o{' '}
            <strong>Fire Live</strong>, que observa o {t.fireLive.quarto}º quarto ao vivo.
          </p>
        </Caixa>
      </Secao>

      <Secao id="niveis" titulo="Os quatro níveis de jogador">
        <p>
          Todo jogador da lista tem um nível, definido pela curadoria NIP, por atributo. Ele diz o
          que esperar daquele jogador — e muda os números de todas as regras abaixo.
        </p>
        <ul className={s.listaNiveis}>
          {t.niveis.ordem.map((nivel) => (
            <li key={nivel}>
              <SeloNivel nivel={nivel} />
              <span>{DESCRICAO_NIVEL[nivel]}</span>
            </li>
          ))}
        </ul>
      </Secao>

      <Secao id="apito" titulo="O nível do apito">
        <p>
          O anel colorido da foto e a barra à esquerda de cada linha mostram a{' '}
          <strong>força do apito</strong> — não confundir com o nível do jogador. Quanto mais jogos
          seguidos abaixo da média, mais forte.
        </p>
        <div className={s.exemplosApito}>
          {([1, 2, 3] as const).map((nivel) => (
            <div key={nivel} className={s.exemploApito}>
              <FotoJogador nome="Jogador Exemplo" fotoUrl={null} tamanho={44} anel={corDoApito(nivel, false)} />
              <IndicadorApito nivel={nivel} turbo={false} />
              <span>{nivel === 1 ? '1 jogo abaixo' : `${nivel} jogos seguidos`}</span>
            </div>
          ))}
          <div className={s.exemploApito}>
            <FotoJogador nome="Jogador Exemplo" fotoUrl={null} tamanho={44} anel={corDoApito(3, true)} />
            <IndicadorApito nivel={3} turbo />
            <span>Turbo</span>
          </div>
        </div>
        <p className={s.nota}>
          {ROTULO_APITO[1]} amarelo · {ROTULO_APITO[2]} laranja · {ROTULO_APITO[3]} verde · Turbo
          azul, com o raio <IconeTurbo tamanho={14} className={s.iconeTurbo} />.
        </p>
      </Secao>

      <Secao id="oscilacao" titulo="Método 1 — Oscilação">
        <p>
          Quando um jogador rende abaixo da própria média, a tendência é voltar a ela no jogo
          seguinte. É aí que ele apita.
        </p>
        <Caixa>
          <p>
            <strong>Exemplo da metodologia.</strong> LeBron tem média de 25,7 pontos. Ele faz um jogo
            de 20 ou menos — está oscilando. No jogo seguinte, apitado.
          </p>
        </Caixa>
        <p>Quantos pontos abaixo contam, por nível:</p>
        <ul className={s.lista}>
          {t.niveis.ordem.map((nivel) => (
            <li key={nivel}>
              <strong>{ROTULO_NIVEL[nivel]}</strong>: {n(t.oscilacao.delta[nivel])} pontos abaixo da
              média
              {t.niveis.minimoOscilacao[nivel] > 1 && (
                <> — e só apita a partir de {t.niveis.minimoOscilacao[nivel]} jogos seguidos</>
              )}
            </li>
          ))}
        </ul>
        {Object.entries(t.oscilacao.excecoes).map(([jogador, delta]) => (
          <p key={jogador} className={s.nota}>
            <strong>Exceção:</strong> por ter média muito alta, {jogador.replace('-', ' ')} só conta
            oscilação a partir de {n(delta)} pontos abaixo.
          </p>
        ))}
        <p className={s.nota}>Jogo não disputado não quebra a sequência: é como se a data não existisse.</p>
      </Secao>

      <Secao id="opd" titulo="Método 2 — OPD (Oportunidade Por Desfalque)">
        <p>
          Quando um titular não joga, quem está abaixo dele ganha protagonismo e tende a produzir
          mais. Apitam os <strong>{t.opd.janela} jogadores</strong> logo abaixo do desfalque:
        </p>
        <ul className={s.lista}>
          {Object.entries(t.opd.mapaNivel)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([distancia, nivelApito]) => (
              <li key={distancia}>
                {distancia === '1' ? 'O próximo da hierarquia' : `${distancia}º depois`} → apito{' '}
                <strong>{ROTULO_APITO[nivelApito as NivelApito]}</strong>
              </li>
            ))}
        </ul>
        <Caixa>
          <p>
            <strong>Exemplo da metodologia.</strong> Nos Lakers, Luka é o principal. Confirmado que
            está fora, apitam Austin Reaves (verde), Grimes (laranja) e Kessler (amarelo).
          </p>
        </Caixa>
        <p className={s.nota}>
          O desfalque tem que ser de cima para baixo: se o nº 2 falta e o nº 1 joga, a estratégia
          não se aplica. As escalações oficiais saem até 1 hora antes do jogo, então a lista se
          atualiza durante o dia.
        </p>
      </Secao>

      <Secao id="confianca" titulo="A nota de confiança e as linhas">
        <p>
          Cada jogador apitado tem várias <strong>linhas</strong>, e cada linha tem sua própria nota.
          Toque na linha da lista para ver todas; o nome abre as estatísticas do jogador.
        </p>
        <Caixa destaque>
          <p>
            O número é a <strong>nota de confiança da análise NIP</strong>. Não é probabilidade de
            acerto nem promessa de resultado.
          </p>
        </Caixa>
        <p>A cor da nota segue esta régua — quanto mais alta, mais forte a leitura:</p>
        <div className={s.regua}>
          {faixasConfianca.map((faixa) => (
            <div key={faixa.grau} className={s.faixa} style={{ borderColor: `var(--confianca-${faixa.grau})` }}>
              <span className={s.faixaRotulo} style={{ color: `var(--confianca-${faixa.grau})` }}>
                {faixa.rotulo}
              </span>
              <span className={s.nota}>{faixa.de} ou mais</span>
            </div>
          ))}
        </div>
        {ruleset.confianca_exibicao.origem === 'demonstracao' && (
          <p className={s.alerta}>
            Régua de demonstração: estes limiares são um exemplo de leitura visual — ainda não
            vieram da curadoria NIP.
          </p>
        )}
        <p>
          Um apito mais forte melhora a nota: {ROTULO_NIVEL.MVP} ganha{' '}
          {n(t.confianca.bonus.MVP?.['3'] ?? 0)} pontos na nota no nível 3;{' '}
          {ROTULO_NIVEL.ALL_STAR}, {n(t.confianca.bonus.ALL_STAR?.['3'] ?? 0)} pontos no nível 3.
          Randola nunca ganha bônus: usa sempre a tabela base.
        </p>
      </Secao>

      <Secao id="atributos" titulo="Pontos, rebotes e assistências">
        <p>
          Cada atributo tem classificação, hierarquia e parâmetros próprios. Uma linha de 25+ faz
          sentido em pontos e nenhum sentido em assistências, então cada atributo tem sua própria
          tabela de linhas.
        </p>
        <div className={s.rolagem} tabIndex={0} role="region" aria-label="Linhas por atributo e nível">
          <table className={s.tabela}>
            <thead>
              <tr>
                <th scope="col">Atributo</th>
                {t.niveis.ordem.map((nivel) => (
                  <th key={nivel} scope="col">
                    {ROTULO_NIVEL[nivel]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {t.atributos.map((a) => (
                <tr key={a.atributo}>
                  <th scope="row">
                    {ROTULO_ATRIBUTO[a.atributo]}
                    {a.origem === 'demonstracao' && <span className={s.demo}>demonstração</span>}
                  </th>
                  {t.niveis.ordem.map((nivel) => {
                    const linhas = (a.linhas as Partial<Record<Nivel, number[]>>)[nivel] ?? []
                    return (
                      <td key={nivel} className="num">
                        {linhas.length === 0 ? '—' : linhas.map((l) => `${l}+`).join(' · ')}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {t.atributos
          .filter((a) => Object.keys(a.linhas).length === 0)
          .map((a) => (
            <p key={a.atributo} className={s.nota}>
              {ROTULO_ATRIBUTO[a.atributo]}: ainda sem classificação — nenhum apito sai neste atributo.
            </p>
          ))}
        {t.atributos.some((a) => a.origem === 'demonstracao') && (
          <p className={s.alerta}>
            Os atributos marcados como demonstração usam números de exemplo. A lista oficial de níveis
            de rebotes e assistências da metodologia NIP ainda não foi carregada.
          </p>
        )}
      </Secao>

      <Secao id="odds" titulo="As odds">
        <p>
          As odds variam entre casas e ao longo do dia. Com cobertura de no mínimo{' '}
          {t.odds.casasMinimas} {t.odds.casasMinimas === 1 ? 'casa' : 'casas'}, a lista mostra{' '}
          {ruleset.odds.exibicao === 'media'
            ? 'a média das odds'
            : ruleset.odds.exibicao === 'casa_unica'
              ? 'a odd cotada'
              : 'a faixa entre a menor e a maior odd'}{' '}
          da última coleta. O detalhe reúne as cotações por casa disponíveis.
        </p>
        <p>
          Sem coleta suficiente, o detalhe pode mostrar a tabela de referência NIP, identificada como
          referência. Ela não é uma cotação atual da sua casa. A plataforma é somente leitura: não
          envia apostas nem vincula contas de casas.
        </p>
      </Secao>

      <Secao id="fire-live" titulo="Fire Live — o ao vivo do 1º quarto">
        <p>
          Durante o {t.fireLive.quarto}º quarto, o app calcula um <strong>alvo</strong> para cada
          jogador. Quando os dados recebidos confirmam o alvo, o app registra o apito e envia a
          notificação. Confira a última atualização da tela; o push avisa e a tela mostra o detalhe.
        </p>
        <ul className={s.lista}>
          <li>
            Pontos, jogador classificado: média por quarto × {n(t.fireLive.multiplicadores.pontosClassificado)} (mínimo{' '}
            {t.fireLive.travas.pontosAlvoMinimo} pontos)
          </li>
          <li>
            Pontos, {ROTULO_NIVEL.RANDOLA}: × {n(t.fireLive.multiplicadores.pontosRandola)}
          </li>
          <li>Pontos, fora da lista: × {n(t.fireLive.multiplicadores.pontosNaoClassificado)}</li>
          <li>Rebotes: × {n(t.fireLive.multiplicadores.rebotes)}</li>
          <li>
            Assistências: média por quarto + {t.fireLive.assistencias.valor} (só para quem tem média ≥{' '}
            {t.fireLive.assistencias.mediaMinima})
          </li>
        </ul>
        <Caixa>
          <p>
            <IconeFogo tamanho={16} className={s.iconeFogo} /> <strong className={s.modoFire}>Modo Fire</strong>:{' '}
            {ROTULO_NIVEL.MVP} e {ROTULO_NIVEL.ALL_STAR} que atingem{' '}
            {Math.round(t.fireLive.modoFire.percentual * 100)}% da média total já no{' '}
            {t.fireLive.quarto}º quarto entram em modo fire — tendência muito forte de pontuação alta.
          </p>
        </Caixa>
        <p className={s.nota}>
          Em pontos, {t.fireLive.presencaTopo.bloqueiaNiveis.map((nv) => ROTULO_NIVEL[nv]).join(' e ')} só
          apitam quando o topo do time está fora da partida — exceto{' '}
          {t.fireLive.presencaTopo.timesIsentos.join(', ')}.
        </p>
      </Secao>

      <Secao id="greens" titulo="Notificações e greens">
        <p>
          Além do apito, você é avisado quando o jogador <strong>bate uma marca</strong> — o green.
          As marcas comemoradas por nível:
        </p>
        <ul className={s.lista}>
          {t.niveis.ordem.map((nivel) => (
            <li key={nivel}>
              <strong>{ROTULO_NIVEL[nivel]}</strong>: {(t.push.marcosGreen[nivel] ?? []).join(', ')} pontos
            </li>
          ))}
        </ul>
        <p className={s.nota}>Você liga e desliga cada tipo de aviso separadamente em Minha conta.</p>
      </Secao>

      {/* O documento do CJ manda este lembrete morar aqui, na introdução das
          estratégias — não dentro da linha de cada jogador. */}
      <Secao id="blowout" titulo="Lembrete importante — jogo decidido">
        <Caixa destaque>
          <p>
            Se um jogo chegar ao {t.blowout.quarto}º quarto com{' '}
            <strong>{t.blowout.diferenca} pontos ou mais</strong> de diferença, considere encerrar as
            apostas que envolvam <strong>{t.blowout.aplicaA.toLowerCase()}</strong> daquela partida:
            com o jogo decidido, eles tendem a jogar menos minutos. Para jogadores reservas, não há
            essa indicação.
          </p>
        </Caixa>
      </Secao>

      <Secao id="exemplo" titulo="Um exemplo de linha da lista">
        <div className={s.linhaExemplo} aria-label="Exemplo ilustrativo de apito">
          <FotoJogador nome="Austin Reaves" fotoUrl={null} tamanho={44} anel={corDoApito(3, false)} timeSigla="LAL" />
          <span className={s.exemploIdentidade}>
            <strong>Austin Reaves</strong>
            <span className={s.exemploMeta}>
              <SeloNivel nivel="ALL_STAR" /> LAL · G
            </span>
          </span>
          <PilulaMercado linha={20} atributo="PONTOS" />
          <IndicadorApito nivel={3} turbo={false} opd />
          <PilulaConfianca valor={88} grau={3} />
          {/* Só o valor, como a `PilulaOdd` da Lista e o v2: o rótulo ("Odd",
              "Odd média") vai para o title e o leitor de tela, não para a tela. */}
          {oddExemplo && (
            <span className="num" title={oddExemplo.rotulo}>
              {oddExemplo.valor}
              <span className="so-leitor"> ({oddExemplo.rotulo.toLowerCase()})</span>
            </span>
          )}
          <Minigrafico
            jogos={[
              { valor: 18, bateu: false },
              { valor: 21, bateu: true },
              { valor: 15, bateu: false },
              { valor: 22, bateu: true },
              { valor: 24, bateu: true },
            ]}
          />
        </div>
        <p className={s.nota}>
          Números ilustrativos. O nível do jogador no selo, a força do apito no anel e na barra, o
          cruzamento com a OPD marcado quando existe. O nome leva às estatísticas do jogador.
        </p>
      </Secao>

      {!t.matchup.habilitado && (
        <p className={s.nota}>
          Em breve: <strong>matchup</strong> — estatísticas do adversário que o apitado vai enfrentar.
          Fica disponível {t.matchup.liberarAposDias} dias após o início da competição, quando os dados
          já estiverem consolidados.
        </p>
      )}
    </div>
  )
}
