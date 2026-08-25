import { redirect } from 'next/navigation'

import { montarTeoria } from '@/modules/entrega/teoria/conteudo'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import { CabecalhoTela, Moldura } from '@/components/navegacao'
import { Avatar, CardEntrada } from '@/design-system/componentes'
import { APITO, CONFIANCA_GRAU, MODO_FIRE, NIVEL_JOGADOR, TURBO } from '@/design-system/tokens/css'
import { semantico } from '@/design-system/tokens/semantico'
import type { Atributo, Nivel } from '@/modules/motor/tipos'
import { sessaoAtual } from '@/modules/plataforma/auth/cookies'
import '@/design-system/tokens/tokens.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Como funciona · IA da NBA' }

function n(v: number): string {
  return String(v).replace('.', ',')
}

const ATRIBUTO_ROTULO: Record<Atributo, string> = {
  PONTOS: 'Pontos',
  REBOTES: 'Rebotes',
  ASSISTENCIAS: 'Assistências',
}

function Secao({
  titulo,
  children,
}: {
  titulo: string
  children: React.ReactNode
}) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 17, margin: '0 0 8px' }}>{titulo}</h2>
      <div style={{ fontSize: 14, lineHeight: 1.6 }}>{children}</div>
    </section>
  )
}

function Caixa({
  children,
  destaque,
}: {
  children: React.ReactNode
  destaque?: boolean
}) {
  return (
    <div
      style={{
        padding: '12px 14px',
        borderRadius: 10,
        background: semantico.superficie,
        border: `1px solid ${destaque ? semantico.textoPrimario : semantico.divisor}`,
        margin: '10px 0',
      }}
    >
      {children}
    </div>
  )
}

/**
 * A METODOLOGIA DO CJ EXPLICADA AO ASSINANTE.
 *
 * Exige sessão, NÃO exige assinatura: quem criou conta e ainda não assinou
 * precisa entender o produto para decidir. O conteúdo pago (os apitos do dia)
 * continua trancado.
 *
 * Todo número vem de `montarTeoria(ruleset)` — trocar um valor no YAML muda
 * esta página sozinho. O documento do CJ é explícito sobre o local do aviso de
 * blowout: "essa mensagem precisa ser colocada na introdução das estratégias,
 * como um lembrete, não dentro delas".
 */
export default async function PaginaComoFunciona() {
  const sessao = await sessaoAtual()
  if (!sessao) redirect('/entrar?destino=/como-funciona')

  const ruleset = await rulesetAtivo()
  const t = montarTeoria(ruleset)
  const faixasConfianca = [...ruleset.confianca_exibicao.faixas].sort((a, b) => a.de - b.de)

  return (
    <Moldura aba={null}>
      <CabecalhoTela sobrancelha="METODOLOGIA DO CJ" titulo="COMO FUNCIONA" voltarHref="/" />
      <div>
        <p style={{ margin: '0 0 24px', color: semantico.textoSecundario, fontSize: 14 }}>
          As duas estratégias do Mestre da NBA, o que cada cor significa e como ler os
          percentuais. Leia uma vez: depois os cards se explicam sozinhos.
        </p>

        <Caixa destaque>
          <p style={{ margin: 0, fontWeight: 700 }}>Antes de tudo: o que o app faz</p>
          <p style={{ margin: '6px 0 0' }}>
            Ele lê os números da NBA, aplica os critérios do CJ e mostra os jogadores{' '}
            <strong>apitados</strong> — os que a análise aponta como bons candidatos. São duas
            estratégias: a <strong>Lista Secreta</strong>, publicada antes dos jogos, e o{' '}
            <strong>Fire Live</strong>, que observa o {t.fireLive.quarto}º quarto ao vivo.
          </p>
        </Caixa>

        <Secao titulo="Os quatro níveis de jogador">
          <p style={{ margin: '0 0 10px' }}>
            Todo jogador da lista tem um nível, definido pelo CJ, por atributo. Ele diz o que
            esperar daquele jogador — e muda os números de todas as regras abaixo.
          </p>
          <div style={{ display: 'grid', gap: 6 }}>
            {t.niveis.ordem.map((nivel) => (
              <div
                key={nivel}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: semantico.superficie,
                  borderLeft: `4px solid ${NIVEL_JOGADOR[nivel].cor}`,
                }}
              >
                <strong style={{ minWidth: 78 }}>{NIVEL_JOGADOR[nivel].rotulo}</strong>
                <span style={{ fontSize: 13, color: semantico.textoSecundario }}>
                  {nivel === 'MVP' && 'Superestrela consolidada, estatística consistentemente alta.'}
                  {nivel === 'ALL_STAR' && 'Grande destaque da liga, ainda abaixo do MVP.'}
                  {nivel === 'SUPORTE' && 'Oscila bastante, mas tem papel fundamental no time.'}
                  {nivel === 'RANDOLA' && 'Poucas aparições brilhantes, na maioria reserva.'}
                </span>
              </div>
            ))}
          </div>
        </Secao>

        <Secao titulo="A borda colorida: o nível do apito">
          <p style={{ margin: '0 0 10px' }}>
            A borda colorida do avatar no card mostra a <strong>força do apito</strong> — não
            confundir com o nível do jogador. Quanto mais jogos seguidos abaixo da média, mais
            forte.
          </p>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar nome="Jogador" fotoUrl={null} timeSigla="LAL" nivelApito={1} />
              <span style={{ fontSize: 13 }}>1 jogo abaixo</span>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar nome="Jogador" fotoUrl={null} timeSigla="LAL" nivelApito={2} />
              <span style={{ fontSize: 13 }}>2 jogos seguidos</span>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar nome="Jogador" fotoUrl={null} timeSigla="LAL" nivelApito={3} />
              <span style={{ fontSize: 13 }}>3 jogos seguidos</span>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar nome="Jogador" fotoUrl={null} timeSigla="LAL" nivelApito={3} turbo />
              <span style={{ fontSize: 13 }}>{TURBO.rotulo}</span>
            </span>
          </div>
          <p style={{ margin: '10px 0 0', fontSize: 13, color: semantico.textoSecundario }}>
            {APITO[1].rotulo} amarelo · {APITO[2].rotulo} laranja · {APITO[3].rotulo} verde ·{' '}
            {TURBO.rotulo} azul, com raios e fogo.
          </p>
        </Secao>

        <Secao titulo="Método 1 — Oscilação">
          <p style={{ margin: '0 0 8px' }}>
            Quando um jogador rende abaixo da própria média, a tendência é voltar a ela no jogo
            seguinte. É aí que ele apita.
          </p>
          <Caixa>
            <p style={{ margin: 0, fontSize: 13 }}>
              <strong>Exemplo do CJ.</strong> LeBron tem média de 25,7 pontos. Ele faz um jogo de
              20 ou menos — está oscilando. No jogo seguinte, apitado.
            </p>
          </Caixa>
          <p style={{ margin: '10px 0 6px' }}>Quantos pontos abaixo contam, por nível:</p>
          <ul style={{ margin: '0 0 10px', paddingLeft: 20 }}>
            {t.niveis.ordem.map((nivel) => (
              <li key={nivel}>
                <strong>{NIVEL_JOGADOR[nivel].rotulo}</strong>: {n(t.oscilacao.delta[nivel])} pontos
                abaixo da média
                {t.niveis.minimoOscilacao[nivel] > 1 && (
                  <> — e só apita a partir de {t.niveis.minimoOscilacao[nivel]} jogos seguidos</>
                )}
              </li>
            ))}
          </ul>
          {Object.entries(t.oscilacao.excecoes).map(([jogador, delta]) => (
            <p key={jogador} style={{ margin: '0 0 6px', fontSize: 13 }}>
              <strong>Exceção:</strong> por ter média muito alta, {jogador.replace('-', ' ')} só
              conta oscilação a partir de {n(delta)} pontos abaixo.
            </p>
          ))}
          <p style={{ margin: '6px 0 0', fontSize: 13, color: semantico.textoSecundario }}>
            Jogo não disputado não quebra a sequência: é como se a data não existisse.
          </p>
        </Secao>

        <Secao titulo="Método 2 — OPD (Oportunidade Por Desfalque)">
          <p style={{ margin: '0 0 8px' }}>
            Quando um titular não joga, quem está abaixo dele ganha protagonismo e tende a produzir
            mais. Apitam os <strong>{t.opd.janela} jogadores</strong> logo abaixo do desfalque:
          </p>
          <ul style={{ margin: '0 0 10px', paddingLeft: 20 }}>
            {Object.entries(t.opd.mapaNivel)
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([distancia, nivelApito]) => (
                <li key={distancia}>
                  {distancia === '1' ? 'O próximo da hierarquia' : `${distancia}º depois`} → apito{' '}
                  <strong>{APITO[nivelApito as 1 | 2 | 3].rotulo}</strong>
                </li>
              ))}
          </ul>
          <Caixa>
            <p style={{ margin: 0, fontSize: 13 }}>
              <strong>Exemplo do CJ.</strong> Nos Lakers, Luka é o principal. Confirmado que está
              fora, apitam Austin Reaves (verde), Grimes (laranja) e Kessler (amarelo).
            </p>
          </Caixa>
          <p style={{ margin: '8px 0 0', fontSize: 13, color: semantico.textoSecundario }}>
            O desfalque tem que ser de cima para baixo: se o nº 2 falta e o nº 1 joga, a estratégia
            não se aplica. As escalações oficiais saem até 1 hora antes do jogo, então a lista se
            atualiza durante o dia.
          </p>
        </Secao>

        <Secao titulo="O percentual e as linhas de pontos">
          <p style={{ margin: '0 0 8px' }}>
            Cada jogador apitado tem várias <strong>linhas</strong> de pontos, e cada linha tem sua
            própria nota. Toque em “linhas e confiança” no card para ver todas.
          </p>
          <Caixa destaque>
            <p style={{ margin: 0, fontSize: 13 }}>
              O percentual é a <strong>nota de confiança da análise do CJ</strong>. Não é
              probabilidade de acerto, nem promessa de resultado.
            </p>
          </Caixa>

          <p style={{ margin: '14px 0 6px', fontSize: 13 }}>
            A cor da nota na tela segue esta régua — quanto mais alta, mais forte a leitura:
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(112px, 1fr))',
              gap: 8,
            }}
          >
            {faixasConfianca.map((faixa) => (
              <div
                key={faixa.grau}
                style={{
                  padding: '10px 8px',
                  textAlign: 'center',
                  borderRadius: 10,
                  border: `1.5px solid ${CONFIANCA_GRAU[faixa.grau]}`,
                }}
              >
                <p
                  style={{
                    margin: 0,
                    fontFamily: semantico.fonteRotulo,
                    fontSize: 11,
                    letterSpacing: 1,
                    color: CONFIANCA_GRAU[faixa.grau],
                    textTransform: 'uppercase',
                  }}
                >
                  {faixa.rotulo}
                </p>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: semantico.textoSecundario }}>
                  {faixa.de}%+
                </p>
              </div>
            ))}
          </div>
          {ruleset.confianca_exibicao.origem === 'demonstracao' && (
            <p style={{ margin: '10px 0 0', fontSize: 12, color: semantico.alerta, lineHeight: 1.6 }}>
              Régua de demonstração: estes limiares são um exemplo de leitura visual — ainda não
              vieram do Mestre da NBA.
            </p>
          )}

          <p style={{ margin: '10px 0 6px', fontSize: 13 }}>
            Um apito mais forte melhora a nota: {NIVEL_JOGADOR.MVP.rotulo} ganha{' '}
            {n(t.confianca.bonus.MVP?.['3'] ?? 0)}% no nível 3, {NIVEL_JOGADOR.ALL_STAR.rotulo}{' '}
            {n(t.confianca.bonus.ALL_STAR?.['3'] ?? 0)}%. Randola nunca ganha bônus: usa sempre a
            tabela base.
          </p>
        </Secao>

        <Secao titulo="Pontos, rebotes e assistências">
          <p style={{ margin: '0 0 8px' }}>
            As estratégias funcionam igual nos três atributos — o que muda é a escala. Uma linha de
            25 faz sentido em pontos e nenhum sentido em assistências, então cada atributo tem sua
            própria tabela de linhas.
          </p>
          <div style={{ display: 'grid', gap: 8 }}>
            {t.atributos.map((a) => (
              <Caixa key={a.atributo}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>
                  {ATRIBUTO_ROTULO[a.atributo]}
                  {a.origem === 'demonstracao' && (
                    <span style={{ marginLeft: 8, fontWeight: 600, color: semantico.alerta }}>
                      · demonstração
                    </span>
                  )}
                </p>
                {Object.keys(a.linhas).length === 0 ? (
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: semantico.textoSecundario }}>
                    Ainda sem classificação — nenhum apito sai neste atributo.
                  </p>
                ) : (
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: semantico.textoSecundario }}>
                    {Object.entries(a.linhas)
                      .map(([nivel, linhas]) => `${NIVEL_JOGADOR[nivel as Nivel].rotulo}: ${(linhas ?? []).join(' · ')}`)
                      .join('   |   ')}
                  </p>
                )}
              </Caixa>
            ))}
          </div>
          {t.atributos.some((a) => a.origem === 'demonstracao') && (
            <p style={{ margin: '10px 0 0', fontSize: 12, color: semantico.alerta, lineHeight: 1.6 }}>
              Os atributos marcados como demonstração usam números de exemplo. A lista oficial de
              níveis de rebotes e assistências do Mestre da NBA ainda não foi carregada.
            </p>
          )}
        </Secao>

        <Secao titulo="As odds">
          <p style={{ margin: 0 }}>
            A plataforma <strong>não tem acesso direto</strong> à odd da sua casa de apostas — elas
            mudam todos os dias e variam entre casas. O que aparece é uma faixa de referência,
            próxima da média do mercado. Quando houver cobertura de casas, a faixa passa a ser
            calculada pela {t.odds.agregacao} de no mínimo {t.odds.casasMinimas} casas.
          </p>
        </Secao>

        <Secao titulo="Fire Live — o ao vivo do 1º quarto">
          <p style={{ margin: '0 0 8px' }}>
            Durante o {t.fireLive.quarto}º quarto, o app calcula um <strong>alvo</strong> para cada
            jogador. Quem cruza o alvo apita na hora — e a notificação chega no seu celular no exato
            momento.
          </p>
          <ul style={{ margin: '0 0 10px', paddingLeft: 20, fontSize: 13 }}>
            <li>
              Pontos, jogador classificado: média por quarto ×{' '}
              {n(t.fireLive.multiplicadores.pontosClassificado)} (mínimo{' '}
              {t.fireLive.travas.pontosAlvoMinimo} pontos)
            </li>
            <li>
              Pontos, {NIVEL_JOGADOR.RANDOLA.rotulo}: × {n(t.fireLive.multiplicadores.pontosRandola)}
            </li>
            <li>
              Pontos, fora da lista: × {n(t.fireLive.multiplicadores.pontosNaoClassificado)}
            </li>
            <li>Rebotes: × {n(t.fireLive.multiplicadores.rebotes)}</li>
            <li>
              Assistências: média por quarto + {t.fireLive.assistencias.valor} (só para quem tem
              média ≥ {t.fireLive.assistencias.mediaMinima})
            </li>
          </ul>
          <p style={{ margin: '0 0 8px', fontSize: 13 }}>
            <strong style={{ color: MODO_FIRE.cor }}>{MODO_FIRE.rotulo}</strong>:{' '}
            {NIVEL_JOGADOR.MVP.rotulo} e {NIVEL_JOGADOR.ALL_STAR.rotulo} que atingem{' '}
            {Math.round(t.fireLive.modoFire.percentual * 100)}% da média total já no{' '}
            {t.fireLive.quarto}º quarto entram em modo fire — tendência muito forte de pontuação
            alta.
          </p>
          <p style={{ margin: 0, fontSize: 13, color: semantico.textoSecundario }}>
            Em pontos, {t.fireLive.presencaTopo.bloqueiaNiveis.map((nv) => NIVEL_JOGADOR[nv].rotulo).join(' e ')}{' '}
            só apitam quando o topo do time está fora da partida — exceto{' '}
            {t.fireLive.presencaTopo.timesIsentos.join(', ')}.
          </p>
        </Secao>

        <Secao titulo="Notificações e greens">
          <p style={{ margin: '0 0 8px' }}>
            Além do apito, você é avisado quando o jogador <strong>bate uma marca</strong> — o
            green. As marcas comemoradas por nível:
          </p>
          <ul style={{ margin: '0 0 8px', paddingLeft: 20, fontSize: 13 }}>
            {t.niveis.ordem.map((nivel) => (
              <li key={nivel}>
                <strong>{NIVEL_JOGADOR[nivel].rotulo}</strong>:{' '}
                {(t.push.marcosGreen[nivel] ?? []).join(', ')} pontos
              </li>
            ))}
          </ul>
          <p style={{ margin: 0, fontSize: 13, color: semantico.textoSecundario }}>
            Você liga e desliga cada tipo de aviso separadamente em Minha conta.
          </p>
        </Secao>

        {/* O documento do CJ manda este lembrete morar AQUI, na introdução das
            estratégias — não dentro do card de cada jogador. */}
        <Secao titulo="Lembrete importante — jogo decidido">
          <Caixa destaque>
            <p style={{ margin: 0 }}>
              Se um jogo chegar ao {t.blowout.quarto}º quarto com{' '}
              <strong>{t.blowout.diferenca} pontos ou mais</strong> de diferença, considere encerrar
              as apostas que envolvam <strong>{t.blowout.aplicaA.toLowerCase()}</strong> daquela
              partida: com o jogo decidido, eles tendem a jogar menos minutos. Para jogadores
              reservas, não há essa indicação.
            </p>
          </Caixa>
        </Secao>

        <Secao titulo="Um exemplo de card">
          <CardEntrada
            nome="Austin Reaves"
            timeSigla="LAL"
            posicao="G"
            atributo="PONTOS"
            nivelJogador="ALL_STAR"
            nivelApito={3}
            confianca={92}
            grauConfianca={null}
            turbo={false}
            modoFire={false}
            opdOrigemNivel={3}
            alvo1Q={null}
            ultimos5={[
              { valor: 22, bateu: true },
              { valor: 19, bateu: true },
              { valor: 15, bateu: false },
              { valor: 21, bateu: true },
              { valor: 18, bateu: true },
            ]}
            mediaTemporada={19.4}
            oddFaixa={{ min: 1.47, max: 1.62, qtdCasas: 3, media: 1.55 }}
          />
          <p style={{ margin: '8px 0 0', fontSize: 13, color: semantico.textoSecundario }}>
            Nível do jogador na faixa metálica, força do apito na borda do avatar, e o cruzamento
            com a OPD sinalizado quando existe. O nome leva às estatísticas do jogador.
          </p>
        </Secao>

        {!t.matchup.habilitado && (
          <p style={{ fontSize: 12, color: semantico.textoSecundario }}>
            Em breve: <strong>matchup</strong> — estatísticas do adversário que o apitado vai
            enfrentar. Fica disponível {t.matchup.liberarAposDias} dias após o início da competição,
            quando os dados já estiverem consolidados.
          </p>
        )}
      </div>
    </Moldura>
  )
}
