import { notFound } from 'next/navigation'
import { z } from 'zod'

import { getDb } from '@/modules/dominio/db/cliente'
import { telaDoJogo } from '@/modules/entrega/estatisticas/jogo'
import type { LadoDaPartida, LinhaDoBoxScore } from '@/modules/entrega/estatisticas/jogo'
import {
  BASE_ESTATISTICAS,
  contextoEstatisticas,
  rotaDoJogador,
  rotaDoJogo,
  rotaDoTime,
} from '@/modules/entrega/estatisticas/rotas'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import { dataHora, diaCurto } from '@/components/formato'
import { CabecalhoTela, Moldura } from '@/components/navegacao'
import { Avatar, LogoTime, NotaPartida, Tabela, UltimaAtualizacao } from '@/design-system/componentes'
import type { Coluna } from '@/design-system/componentes'
import { NIVEL_JOGADOR } from '@/design-system/tokens/css'
import { semantico } from '@/design-system/tokens/semantico'
import { exigirNivel } from '@/modules/plataforma/assinatura/guarda'
import { atende } from '@/modules/plataforma/assinatura/nivel-do-plano'
import { ConviteDoPlano } from '@/components/planos/ConviteDoPlano'
import '@/design-system/tokens/tokens.css'
import { Secao, SemBanco, SOBRANCELHA_STATS } from '../../moldura'
import { AtualizarAoVivo } from '@/components/AtualizarAoVivo'

export const dynamic = 'force-dynamic'

function pct(v: number | null): string {
  return v === null ? '—' : `${v.toFixed(1).replace('.', ',')}%`
}

function minutos(v: number | null): string {
  return v === null ? '—' : String(Math.round(v))
}

function colunasDoBoxScore(timeSigla: string): Coluna<LinhaDoBoxScore>[] {
  return [
    {
      chave: 'jogador',
      rotulo: 'Jogador',
      alinhamento: 'esquerda',
      fixa: true,
      celula: (l) => (
        <a
          href={rotaDoJogador(l.jogadorId)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, color: semantico.textoPrimario }}
        >
          <Avatar
            nome={l.nome}
            fotoUrl={l.fotoUrl}
            timeSigla={timeSigla}
            nivelApito={null}
            tamanho={26}
            raio={8}
          />
          {l.nome}
        </a>
      ),
    },
    {
      chave: 'nota',
      rotulo: 'NOTA',
      descricao: 'nota da partida',
      celula: (l) => <NotaPartida nota={l.nota} />,
    },
    { chave: 'min', rotulo: 'MIN', descricao: 'minutos', celula: (l) => minutos(l.minutos) },
    { chave: 'pts', rotulo: 'PTS', descricao: 'pontos', celula: (l) => l.pontos },
    { chave: 'reb', rotulo: 'REB', descricao: 'rebotes', celula: (l) => l.rebotes },
    { chave: 'ast', rotulo: 'AST', descricao: 'assistências', celula: (l) => l.assistencias },
    { chave: 'rou', rotulo: 'ROU', descricao: 'roubos', celula: (l) => l.roubos },
    { chave: 'toc', rotulo: 'TOC', descricao: 'tocos', celula: (l) => l.bloqueios },
    { chave: 'to', rotulo: 'TO', descricao: 'turnovers', celula: (l) => l.turnovers },
    {
      chave: 'fg',
      rotulo: 'FG%',
      descricao: 'aproveitamento de quadra',
      celula: (l) => pct(l.fgPercentual),
    },
    {
      chave: 'tres',
      rotulo: '3P%',
      descricao: 'aproveitamento de três',
      celula: (l) => pct(l.tresPercentual),
    },
    {
      chave: 'll',
      rotulo: 'LL%',
      descricao: 'aproveitamento de lance livre',
      celula: (l) => pct(l.lancePercentual),
    },
  ]
}

function Placar({
  casa,
  visitante,
  aoVivo,
}: {
  casa: LadoDaPartida
  visitante: LadoDaPartida
  aoVivo: boolean
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
      {[casa, visitante].map((lado) => (
        <div key={lado.timeId} style={{ textAlign: 'center', minWidth: 96 }}>
          <a href={rotaDoTime(lado.timeId)} style={{ color: semantico.textoPrimario }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 6 }}>
              <LogoTime sigla={lado.sigla} tamanho={26} />
              <div style={{ fontFamily: semantico.fonteTitulo, fontSize: 22 }}>{lado.sigla}</div>
            </div>
          </a>
          <div style={{ fontSize: 34, fontWeight: 800 }}>{lado.placar ?? '—'}</div>
          {lado.forma.length > 0 && (
            <div style={{ fontSize: 11, color: semantico.textoSecundario, letterSpacing: 1 }}>
              {lado.forma.join(' ')}
            </div>
          )}
        </div>
      ))}
      {aoVivo && (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            color: semantico.vivoSelo,
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          <span
            aria-hidden
            className="ponto-ao-vivo"
            style={{
              display: 'inline-block',
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: semantico.vivoSelo,
            }}
          />
          AO VIVO
        </span>
      )}
    </div>
  )
}

function Quartos({ casa, visitante }: { casa: LadoDaPartida; visitante: LadoDaPartida }) {
  if (casa.quartos === null || visitante.quartos === null) return null
  const temProrrogacao = casa.quartos.prorrogacao > 0 || visitante.quartos.prorrogacao > 0

  // Tabela de verdade, não `<table>` na mão: herda legenda, `scope` nos
  // cabeçalhos e a rolagem horizontal segura em tela estreita de graça — o
  // mesmo componente que o box score já usa duas seções abaixo (achado da
  // revisão: a versão manual não tinha `<caption>` nem `scope`).
  const colunas: Coluna<LadoDaPartida>[] = [
    { chave: 'time', rotulo: 'Time', alinhamento: 'esquerda', fixa: true, celula: (l) => l.sigla },
    {
      chave: 'q1',
      rotulo: '1º',
      alinhamento: 'direita',
      destaque: true,
      celula: (l) => l.quartos!.q1,
    },
    { chave: 'q2', rotulo: '2º', alinhamento: 'direita', celula: (l) => l.quartos!.q2 },
    { chave: 'q3', rotulo: '3º', alinhamento: 'direita', celula: (l) => l.quartos!.q3 },
    { chave: 'q4', rotulo: '4º', alinhamento: 'direita', celula: (l) => l.quartos!.q4 },
  ]
  if (temProrrogacao) {
    colunas.push({
      chave: 'pr',
      rotulo: 'PR',
      alinhamento: 'direita',
      descricao: 'prorrogação',
      celula: (l) => l.quartos!.prorrogacao,
    })
  }
  colunas.push({
    chave: 'tot',
    rotulo: 'TOT',
    alinhamento: 'direita',
    descricao: 'total de pontos',
    // Mesma regra do placar grande, duas seções acima: ausência é '—', nunca
    // 0 — um 0 aqui lê como "o time fez zero pontos", não como "sem dado"
    // (achado da revisão: as duas telas discordavam sobre a mesma ausência).
    celula: (l) => l.placar ?? '—',
  })

  return (
    <>
      <p style={{ margin: '0 0 8px', fontSize: 12, color: semantico.textoSecundario }}>
        1º Q · o que o Fire Live observa
      </p>
      <Tabela
        legenda={`Pontos por quarto — ${casa.sigla} × ${visitante.sigla}`}
        colunas={colunas}
        linhas={[casa, visitante]}
        chaveDaLinha={(l) => l.timeId}
      />
    </>
  )
}

function Desfalques({ lado }: { lado: LadoDaPartida }) {
  if (lado.desfalques.length === 0) return null
  return (
    <div style={{ marginBottom: 10 }}>
      <p style={{ margin: '0 0 4px', fontSize: 12, color: semantico.textoSecundario }}>
        {lado.sigla}
      </p>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
        {lado.desfalques.map((d) => (
          <li key={d.jogadorId}>
            {d.nome} — {d.status === 'FORA' ? 'fora' : 'dúvida'}
            {d.motivo ? ` (${d.motivo})` : ''}
            {!d.confirmado && ' · não confirmado'}
            {d.hierarquiaPontos && (
              <span style={{ display: 'block', color: semantico.textoSecundario, fontSize: 12 }}>
                Curadoria NIP · {d.hierarquiaPontos.timeSigla} · PONTOS · nº{' '}
                {d.hierarquiaPontos.posicao}
                {' · '}
                {NIVEL_JOGADOR[d.hierarquiaPontos.nivel].rotulo}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default async function PaginaDoJogo({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  if (!process.env.DATABASE_URL) return <SemBanco />

  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()

  // Preserva a data que a lista de jogos passou na URL (`?data=`), para o
  // "voltar" pousar no MESMO dia navegado, não sempre em hoje — sem
  // validar aqui: `/estatisticas` já sabe cair para hoje diante de
  // qualquer lixo (`dataValidaOuHoje`), duplicar a regra só duplicaria bug
  // (achado da revisão). O prefixo vem de `rotas.ts`, como nas telas irmãs —
  // literal aqui é o que faz "a mesma tela" virar coincidência.
  const busca = await searchParams
  const { data: dataBruta } = busca
  const contexto = contextoEstatisticas(busca)
  const dataVoltar = Array.isArray(dataBruta) ? dataBruta[0] : dataBruta
  const voltarHref =
    typeof busca.jogador === 'string' && z.uuid().safeParse(busca.jogador).success
      ? rotaDoJogador(busca.jogador, contexto)
      : dataVoltar
        ? `${BASE_ESTATISTICAS}?data=${encodeURIComponent(dataVoltar)}`
        : BASE_ESTATISTICAS
  const agora = new Date()
  const ruleset = await rulesetAtivo()
  const { fuso } = ruleset.rodada
  const tela = await telaDoJogo(getDb(), id, {})
  if (tela === null) notFound()

  // R-A3: a tela passa a exigir login — DEPOIS do "não encontrado": um id que
  // não existe responde 404 sem tocar sessão nem cookie. Pontos por quarto,
  // líderes e desfalques continuam grátis; box score e confrontos anteriores
  // são MVP (spec §5).
  const { acesso } = await exigirNivel('GRATIS', rotaDoJogo(id))

  const aoVivo = tela.status === 'AO_VIVO'
  const encerrado = tela.status === 'ENCERRADO'
  const temBox = tela.casa.boxScore.length > 0 || tela.visitante.boxScore.length > 0
  // Box score e confrontos anteriores são MVP; o resto da tela é grátis.
  const profundidade = atende(acesso.nivel, 'MVP')

  return (
    <Moldura aba="stats" largura="dados" assistente={atende(acesso.nivel, 'MVP')}>
      <CabecalhoTela
        sobrancelha={SOBRANCELHA_STATS}
        titulo={`${tela.casa.sigla} × ${tela.visitante.sigla}`}
        voltarHref={voltarHref}
      />
      {aoVivo && <AtualizarAoVivo />}

      <p style={{ margin: '0 0 12px', fontSize: 12, color: semantico.textoSecundario }}>
        {dataHora(tela.dataHoraUtc, fuso)}
        {aoVivo && tela.quartoAtual !== null && ` · ${tela.quartoAtual}º quarto`}
      </p>

      <Placar casa={tela.casa} visitante={tela.visitante} aoVivo={aoVivo} />

      {(aoVivo || encerrado) && tela.casa.quartos !== null && tela.visitante.quartos !== null && (
        <Secao titulo="Pontos por quarto">
          <Quartos casa={tela.casa} visitante={tela.visitante} />
        </Secao>
      )}

      {encerrado && tela.lideres.length > 0 && (
        <Secao titulo="Líderes da partida">
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 4 }}>
            {tela.lideres.map((l) => (
              <li key={l.rotulo} style={{ fontSize: 14 }}>
                <span style={{ color: semantico.textoSecundario }}>{l.rotulo}: </span>
                <a href={rotaDoJogador(l.jogadorId)} style={{ color: semantico.textoPrimario }}>
                  {l.nome}
                </a>
                <span style={{ color: semantico.textoSecundario }}>
                  {' '}
                  ({l.sigla}) · {l.valor}
                </span>
              </li>
            ))}
          </ul>
        </Secao>
      )}

      {/* Box score é MVP. As DUAS formas — por lado do confronto, e a única
          quando só um lado sincronizou — colapsam num convite SÓ (nunca dois)
          quando falta profundidade: a régua fecha o dado, não a variação de
          onde ele viria. */}
      {(aoVivo || encerrado) &&
        (!profundidade ? (
          <Secao titulo="Box score">
            <ConviteDoPlano minimo="MVP" recurso="O box score" voltar={rotaDoJogo(id)} />
          </Secao>
        ) : temBox ? (
          [tela.casa, tela.visitante].map((lado) => (
            <Secao key={lado.timeId} titulo={`Box score · ${lado.nome}`}>
              <Tabela
                legenda={`Box score de ${lado.nome}`}
                colunas={colunasDoBoxScore(lado.sigla)}
                linhas={lado.boxScore}
                chaveDaLinha={(l) => l.jogadorId}
                // `temBox` é OR: quando só um lado sincronizou, o outro caía
                // no "Sem dados para exibir." genérico da Tabela — duas
                // frases para a mesma ausência (achado da revisão). Mesma
                // frase do bloco "os dois vazios", logo abaixo.
                vazio="Box score em atualização."
              />
            </Secao>
          ))
        ) : (
          <Secao titulo="Box score">
            <p style={{ fontSize: 13, color: semantico.textoSecundario }}>
              Box score em atualização.
            </p>
          </Secao>
        ))}

      {/* Sempre renderiza — h2h vazio é um FATO ("nunca se enfrentaram"), não
          ausência de seção. Spec §6 promete a frase abaixo; escondida, a
          seção some de vez em vez de anunciar a ausência (achado da revisão).
          MVP também, como o box score. */}
      <Secao titulo="Confrontos anteriores">
        {!profundidade ? (
          <ConviteDoPlano
            minimo="MVP"
            recurso="Os confrontos anteriores"
            voltar={rotaDoJogo(id)}
          />
        ) : tela.h2h.length === 0 ? (
          <p style={{ fontSize: 13, color: semantico.textoSecundario }}>
            Primeiro confronto da temporada.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 4 }}>
            {tela.h2h.map((c) => (
              <li key={c.jogoId} style={{ fontSize: 13 }}>
                <span style={{ color: semantico.textoSecundario }}>{diaCurto(c.data, fuso)} </span>
                {c.siglaCasa} {c.placarCasa}–{c.placarVisitante} {c.siglaVisitante}
              </li>
            ))}
          </ul>
        )}
      </Secao>

      {!encerrado && (tela.casa.desfalques.length > 0 || tela.visitante.desfalques.length > 0) && (
        <Secao titulo="Desfalques">
          <Desfalques lado={tela.casa} />
          <Desfalques lado={tela.visitante} />
        </Secao>
      )}

      <UltimaAtualizacao
        em={tela.atualizacao.em}
        fonte={tela.atualizacao.fonte}
        agora={agora}
        fuso={fuso}
      />
    </Moldura>
  )
}
