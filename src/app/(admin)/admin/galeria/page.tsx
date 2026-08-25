import type { Nivel, NivelApito } from '@/modules/motor/tipos'
import { CardEntrada, Pilula } from '@/design-system/componentes'
import { semantico } from '@/design-system/tokens/semantico'
import { CONFIANCA_GRAU, NIVEL_JOGADOR, APITO, TURBO, MODO_FIRE } from '@/design-system/tokens/css'
import { razaoDeContraste } from '@/design-system/tokens/contraste'
import '@/design-system/tokens/tokens.css'
import { negarSeNaoForAdmin } from '../guarda'

export const metadata = { title: 'Galeria · Design System' }

const NIVEIS: Nivel[] = ['MVP', 'ALL_STAR', 'SUPORTE', 'RANDOLA']
const APITOS: NivelApito[] = [1, 2, 3]
const GRAUS = [1, 2, 3, 4, 5] as const

/** Confiança plausível por nível, só para a galeria ter número realista. */
const CONFIANCA: Record<Nivel, number> = {
  MVP: 95,
  ALL_STAR: 90,
  SUPORTE: 86,
  RANDOLA: 85,
}

const EXEMPLO: Record<Nivel, { nome: string; time: string; sigla: string; posicao: string }> = {
  MVP: { nome: 'Jokic', time: 'Denver Nuggets', sigla: 'DEN', posicao: 'C' },
  ALL_STAR: { nome: 'Austin Reaves', time: 'Lakers', sigla: 'LAL', posicao: 'G' },
  SUPORTE: { nome: 'Grimes', time: 'Lakers', sigla: 'LAL', posicao: 'G' },
  RANDOLA: { nome: 'Mamukelashvili', time: 'Lakers', sigla: 'LAL', posicao: 'F' },
}

function Secao({ titulo, nota, children }: { titulo: string; nota?: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 40 }}>
      <h2 style={{ fontSize: 15, letterSpacing: 1, textTransform: 'uppercase', opacity: 0.7 }}>
        {titulo}
      </h2>
      {nota && <p style={{ fontSize: 13, opacity: 0.65, maxWidth: 640 }}>{nota}</p>}
      <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>{children}</div>
    </section>
  )
}

export default async function PaginaGaleria() {
  // A galeria é interna: expõe a paleta e o vocabulário visual do produto.
  const negado = await negarSeNaoForAdmin()
  if (negado) return negado

  return (
    <main
      style={{
        background: semantico.fundo,
        color: semantico.textoPrimario,
        minHeight: '100vh',
        padding: 32,
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <header style={{ marginBottom: 32, maxWidth: 720 }}>
        <h1 style={{ margin: 0 }}>Design System · IA da NBA</h1>
        <p style={{ opacity: 0.75, lineHeight: 1.6 }}>
          Quatro sinais, quatro formas distintas: a <strong>faixa metálica</strong> no topo é o
          nível do jogador, o <strong>anel do avatar</strong> é o nível do apito, a{' '}
          <strong>pílula de contorno</strong> é a faixa de confiança e o{' '}
          <strong>brilho ao redor do card</strong> só aparece no grau máximo de confiança. Turbo e
          modo fire nunca comunicam por cor ou brilho sozinhos — sempre selo escrito.
        </p>
      </header>

      <Secao
        titulo="4 níveis de jogador × 3 níveis de apito"
        nota="A faixa metálica muda com o nível do jogador; o anel do avatar muda com o nível do apito. Nenhuma cor é compartilhada entre os dois canais."
      >
        {NIVEIS.map((nivel) =>
          APITOS.map((apito) => (
            <CardEntrada
              key={`${nivel}-${apito}`}
              nome={EXEMPLO[nivel].nome}
              timeSigla={EXEMPLO[nivel].sigla}
              posicao={EXEMPLO[nivel].posicao}
              atributo="PONTOS"
              nivelJogador={nivel}
              nivelApito={apito}
              confianca={CONFIANCA[nivel]}
              grauConfianca={3}
              linha={20}
            />
          )),
        )}
      </Secao>

      <Secao
        titulo="Card comum (grau 3) vs. grau máximo (grau 5, brilha)"
        nota="Só o grau 5 de confiança acende o brilho ao redor do card — os demais graus mudam a cor do % e da borda lateral."
      >
        <CardEntrada
          nome="Austin Reaves"
          timeSigla="LAL"
          posicao="G"
          atributo="PONTOS"
          nivelJogador="ALL_STAR"
          nivelApito={3}
          confianca={90}
          grauConfianca={3}
          linha={18}
          ultimos5={[
            { valor: 22, bateu: true },
            { valor: 19, bateu: true },
            { valor: 15, bateu: false },
            { valor: 21, bateu: true },
            { valor: 18, bateu: true },
          ]}
          mediaTemporada={19.4}
          oddFaixa={{ min: 1.47, max: 1.62, qtdCasas: 3 }}
        />
        <CardEntrada
          nome="Jokic"
          timeSigla="DEN"
          posicao="C"
          atributo="PONTOS"
          nivelJogador="MVP"
          nivelApito={3}
          confianca={97}
          grauConfianca={5}
          linha={26}
          ultimos5={[
            { valor: 31, bateu: true },
            { valor: 28, bateu: true },
            { valor: 27, bateu: true },
            { valor: 30, bateu: true },
            { valor: 29, bateu: true },
          ]}
          mediaTemporada={27.1}
          oddFaixa={{ min: 1.38, max: 1.5, qtdCasas: 4, media: 1.42 }}
        />
      </Secao>

      <Secao
        titulo="Turbo + Modo Fire"
        nota="MVP em oscilação nível 3 e em modo fire. Ícone e rótulo escritos nos dois — a cor nunca comunica sozinha."
      >
        <CardEntrada
          nome="Jokic"
          timeSigla="DEN"
          posicao="C"
          atributo="PONTOS"
          nivelJogador="MVP"
          nivelApito={3}
          confianca={94}
          grauConfianca={4}
          turbo
          modoFire
          linha={26}
        />
      </Secao>

      <Secao
        titulo="Fire Live: selo VIVO e barra de progresso"
        nota="Uma linha batida e uma ainda em aberto — o texto do estado muda, nunca só a cor da barra."
      >
        <CardEntrada
          nome="Anthony Edwards"
          timeSigla="MIN"
          posicao="G"
          atributo="PONTOS"
          nivelJogador="MVP"
          nivelApito={1}
          confianca={95}
          grauConfianca={4}
          modoFire
          temperatura="quente"
          vivo
          alvo1Q={9}
          progresso1Q={{ observado: 11, alvo: 9 }}
        />
        <CardEntrada
          nome="Grimes"
          timeSigla="LAL"
          posicao="G"
          atributo="PONTOS"
          nivelJogador="SUPORTE"
          nivelApito={2}
          confianca={87}
          grauConfianca={2}
          temperatura="quente"
          vivo
          opdOrigemNivel={3}
          alvo1Q={7}
          progresso1Q={{ observado: 4, alvo: 7 }}
        />
      </Secao>

      <Secao titulo="Rebotes e assistências" nota="O modelo é (jogador, atributo). Pontos não é o único caso.">
        <CardEntrada
          nome="Wembanyama"
          timeSigla="SAS"
          posicao="C"
          atributo="REBOTES"
          nivelJogador="MVP"
          nivelApito={2}
          confianca={92}
          grauConfianca={4}
          linha={12}
        />
        <CardEntrada
          nome="Haliburton"
          timeSigla="IND"
          posicao="G"
          atributo="ASSISTENCIAS"
          nivelJogador="SUPORTE"
          nivelApito={2}
          confianca={85.5}
          grauConfianca={1}
          linha={7}
        />
      </Secao>

      <Secao
        titulo="Avatar: com foto e sem foto (monograma)"
        nota="Sem foto, o monograma entra no lugar. O numeral do nível do apito fica sobreposto nos dois casos — nunca só a cor do anel."
      >
        <CardEntrada
          nome="LeBron James"
          fotoUrl={null}
          timeSigla="PHI"
          posicao="F"
          atributo="PONTOS"
          nivelJogador="MVP"
          nivelApito={2}
          confianca={91}
          grauConfianca={3}
          linha={24}
        />
        {/* Ícone local do próprio PWA (public/icons/app-192.png) só para provar
            o estado visual "com foto" do Avatar — a galeria demonstra estado de
            componente, não integração com o CDN da NBA. Apontar para
            cdn.nba.com exige `images.remotePatterns` (Task 11); sem isso o
            `next/image` rejeita a origem e quebra o build de páginas estáticas
            como esta. */}
        <CardEntrada
          nome="Anthony Edwards"
          fotoUrl="/icons/app-192.png"
          timeSigla="MIN"
          posicao="G"
          atributo="PONTOS"
          nivelJogador="MVP"
          nivelApito={2}
          confianca={91}
          grauConfianca={3}
          linha={24}
        />
      </Secao>

      <Secao
        titulo="Rampa de confiança — as 5 pílulas"
        nota="Um matiz só, intensidade crescente do grau 1 (menor) ao 5 (maior). Nunca reusa cor categórica do apito ou do nível do jogador."
      >
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          {GRAUS.map((grau) => (
            <span key={grau} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <Pilula texto={`${80 + grau * 3}%`} cor={CONFIANCA_GRAU[grau]} brilho={grau === 5} />
              <span style={{ fontSize: 12, opacity: 0.7 }}>grau {grau}</span>
            </span>
          ))}
        </div>
      </Secao>

      <Secao titulo="Contraste verificado" nota="Valores calculados na renderização — não são texto fixo.">
        <table style={{ borderCollapse: 'collapse', fontSize: 13, maxWidth: 560 }}>
          <thead>
            <tr style={{ textAlign: 'left', opacity: 0.6 }}>
              <th style={{ padding: '6px 12px 6px 0' }}>Elemento</th>
              <th style={{ padding: '6px 12px 6px 0' }}>vs superfície</th>
              <th style={{ padding: '6px 0' }}>vs texto sobre cor</th>
            </tr>
          </thead>
          <tbody>
            {[
              ...Object.entries(APITO).map(([k, v]) => [`Apito nível ${k}`, v.cor] as const),
              ['Apito turbo', TURBO.cor] as const,
              ['Modo fire', MODO_FIRE.cor] as const,
              ...Object.entries(NIVEL_JOGADOR).map(([k, v]) => [`Faixa ${k}`, v.cor] as const),
              ...Object.entries(CONFIANCA_GRAU).map(([k, v]) => [`Pílula confiança grau ${k}`, v] as const),
            ].map(([nome, cor]) => (
              <tr key={nome} style={{ borderTop: `1px solid ${semantico.divisor}` }}>
                <td style={{ padding: '6px 12px 6px 0' }}>
                  <span
                    aria-hidden
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: cor,
                      marginRight: 8,
                    }}
                  />
                  {nome}
                </td>
                <td style={{ padding: '6px 12px 6px 0', fontVariantNumeric: 'tabular-nums' }}>
                  {razaoDeContraste(cor, semantico.superficie).toFixed(2)}:1
                </td>
                <td style={{ padding: '6px 0', fontVariantNumeric: 'tabular-nums' }}>
                  {razaoDeContraste(cor, semantico.textoSobreCor).toFixed(2)}:1
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Secao>
    </main>
  )
}
