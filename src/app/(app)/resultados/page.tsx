import Link from 'next/link'
import { redirect } from 'next/navigation'

import { diaLongo } from '@/components/formato'
import { Moldura } from '@/components/navegacao'
import { dataDeReferencia } from '@/modules/dominio/rodada'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import { NIVEL_JOGADOR } from '@/design-system/tokens/css'
import { semantico } from '@/design-system/tokens/semantico'
import { getDb } from '@/modules/dominio/db/cliente'
import { conferirRodadas, greensDoDia } from '@/modules/entrega/resultados'
import type { DiaConferido, JogadorConferido } from '@/modules/entrega/resultados'
import { rotaDoJogador } from '@/modules/entrega/estatisticas/rotas'
import { avaliarAcesso } from '@/modules/plataforma/assinatura/direito'
import { sessaoAtual } from '@/modules/plataforma/auth/cookies'
import type { Atributo } from '@/modules/motor/tipos'
import '@/design-system/tokens/tokens.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Resultados · IA da NBA' }

/** Quantas rodadas encerradas a tela olha para trás. */
const DIAS = 7

const ATRIBUTO_ROTULO: Record<Atributo, string> = {
  PONTOS: 'pontos',
  REBOTES: 'rebotes',
  ASSISTENCIAS: 'assistências',
}


function Cartao({ jogador }: { jogador: JogadorConferido }) {
  const nivel = NIVEL_JOGADOR[jogador.nivelJogador]
  const bateu = jogador.maiorLinhaBatida !== null
  const naoJogou = jogador.valor === null

  return (
    <article
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 14px',
        borderRadius: 10,
        background: semantico.superficie,
        borderLeft: `3px solid ${nivel.cor}`,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>
          <Link
            href={rotaDoJogador(jogador.jogadorId)}
            style={{ color: 'inherit', textUnderlineOffset: 3 }}
          >
            {jogador.nome}
          </Link>
        </div>
        <div style={{ fontSize: 12, color: semantico.textoSecundario }}>
          {jogador.timeSigla} · {nivel.rotulo} · nível {jogador.nivelApito} ·{' '}
          {ATRIBUTO_ROTULO[jogador.atributo]}
        </div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6 }}>
          {jogador.linhas.map((l) => (
            <span
              key={l.linha}
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: '2px 7px',
                borderRadius: 6,
                border: `1px solid ${l.bateu ? semantico.apitoNivel3 : semantico.divisor}`,
                color: l.bateu ? semantico.apitoNivel3 : semantico.textoSecundario,
              }}
            >
              {/* Redundância obrigatória: a marca não é só a cor da borda. */}
              {l.bateu === true ? '✓ ' : l.bateu === false ? '· ' : ''}
              {l.linha}
            </span>
          ))}
        </div>
      </div>

      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 20, fontWeight: 800 }}>
          {naoJogou ? '—' : jogador.valor}
        </div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: naoJogou
              ? semantico.textoSecundario
              : bateu
                ? semantico.apitoNivel3
                : semantico.textoSecundario,
          }}
        >
          {naoJogou ? 'não jogou' : bateu ? `bateu ${jogador.maiorLinhaBatida}` : 'não bateu'}
        </div>
      </div>
    </article>
  )
}

function Rodada({ dia }: { dia: DiaConferido }) {
  return (
    <section style={{ marginBottom: 22 }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 10,
          marginBottom: 8,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 14, textTransform: 'capitalize' }}>
          {diaLongo(dia.dataReferencia)}
        </h2>
        <span style={{ fontSize: 12, color: semantico.textoSecundario }}>
          {dia.acertos} de {dia.conferidos} sinalizados bateram a linha
        </span>
      </header>

      <div style={{ display: 'grid', gap: 8 }}>
        {dia.jogadores.map((j) => (
          <Cartao key={j.chave} jogador={j} />
        ))}
      </div>
    </section>
  )
}

export default async function PaginaResultados() {
  if (!process.env.DATABASE_URL) {
    return (
      <Moldura aba="resultados">
        <h1>Resultados</h1>
        <p style={{ color: semantico.textoSecundario }}>Banco não configurado.</p>
      </Moldura>
    )
  }

  const sessao = await sessaoAtual()
  if (!sessao) redirect('/entrar?destino=/resultados')
  const acesso = await avaliarAcesso(getDb(), sessao.usuarioId)
  if (!acesso.permitido) redirect('/assinar')

  const { fuso } = (await rulesetAtivo()).rodada
  const hoje = dataDeReferencia(new Date(), fuso)
  const [rodadas, greens] = await Promise.all([
    conferirRodadas(getDb(), hoje, DIAS),
    greensDoDia(getDb(), hoje),
  ])

  return (
    <Moldura aba="resultados">
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Resultados</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: semantico.textoSecundario }}>
          O que aconteceu com quem a lista sinalizou nas rodadas encerradas. A rodada de hoje
          entra aqui quando os jogos acabarem.
        </p>
      </header>

      {greens.length > 0 && (
        <section style={{ marginBottom: 22 }}>
          <h2 style={{ margin: '0 0 8px', fontSize: 14 }}>Greens de hoje, ao vivo</h2>
          <div style={{ display: 'grid', gap: 6 }}>
            {greens.map((g) => (
              <div
                key={g.id}
                style={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  background: semantico.superficie,
                  border: `1px solid ${semantico.apitoNivel3}`,
                  fontSize: 14,
                }}
              >
                <strong>{g.nome}</strong> bateu {g.marco} {ATRIBUTO_ROTULO[g.atributo]} ·{' '}
                <span style={{ color: semantico.textoSecundario }}>
                  {g.valor} no 1º quarto
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {rodadas.length === 0 ? (
        <div
          style={{
            padding: '32px 16px',
            textAlign: 'center',
            border: `1px dashed ${semantico.divisor}`,
            borderRadius: 12,
          }}
        >
          <p style={{ margin: 0, fontWeight: 700 }}>Nenhuma rodada encerrada ainda</p>
          <p style={{ margin: '8px 0 0', fontSize: 14, color: semantico.textoSecundario }}>
            Assim que a primeira rodada terminar, a conferência de cada apito aparece aqui.
          </p>
        </div>
      ) : (
        rodadas.map((dia) => <Rodada key={dia.dataReferencia} dia={dia} />)
      )}

      <footer
        style={{
          marginTop: 8,
          paddingTop: 12,
          borderTop: `1px solid ${semantico.divisor}`,
          fontSize: 12,
          color: semantico.textoSecundario,
        }}
      >
        Um jogador conta como acerto quando supera a linha mais baixa que a lista ofereceu para
        ele. Quem não entrou em quadra não conta nem como acerto nem como erro.
      </footer>
    </Moldura>
  )
}
