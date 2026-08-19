import type { Nivel, NivelApito } from '@/modules/motor/tipos'
import { CardEntrada } from '@/design-system/componentes'
import { semantico } from '@/design-system/tokens/semantico'
import { NIVEL_JOGADOR, APITO, TURBO, MODO_FIRE } from '@/design-system/tokens/css'
import { razaoDeContraste } from '@/design-system/tokens/contraste'
import '@/design-system/tokens/tokens.css'

export const metadata = { title: 'Galeria · Design System' }

const NIVEIS: Nivel[] = ['MVP', 'ALL_STAR', 'SUPORTE', 'RANDOLA']
const APITOS: NivelApito[] = [1, 2, 3]

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

export default function PaginaGaleria() {
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
          Dois canais visuais, e só dois: a <strong>borda metálica</strong> é o nível do
          jogador, o <strong>anel colorido</strong> é o nível do apito e o número dentro dele é
          a confiança. A escala de 5 faixas da proposta foi removida (ADR-0005).
        </p>
      </header>

      <Secao
        titulo="4 níveis de jogador × 3 níveis de apito"
        nota="A borda muda com o nível do jogador; o anel muda com o nível do apito. Nenhuma cor é compartilhada entre os dois canais."
      >
        {NIVEIS.map((nivel) =>
          APITOS.map((apito) => (
            <CardEntrada
              key={`${nivel}-${apito}`}
              nome={EXEMPLO[nivel].nome}
              timeSigla={EXEMPLO[nivel].sigla}
              timeNome={EXEMPLO[nivel].time}
              posicao={EXEMPLO[nivel].posicao}
              atributo="PONTOS"
              nivelJogador={nivel}
              nivelApito={apito}
              confianca={CONFIANCA[nivel]}
              historico={[true, true, false, true, false]}
              odd={{ min: 1.3, max: 1.7, casas: 3 }}
            />
          )),
        )}
      </Secao>

      <Secao
        titulo="Turbo"
        nota="MVP em oscilação nível 3. Azul, com ícone e rótulo escritos — a cor nunca comunica sozinha."
      >
        <CardEntrada
          nome="Jokic"
          timeSigla="DEN"
          timeNome="Denver Nuggets"
          posicao="C"
          atributo="PONTOS"
          nivelJogador="MVP"
          nivelApito={3}
          confianca={94}
          turbo
          historico={[false, false, false, true, true]}
          odd={{ min: 1.3, max: 1.7, casas: 4 }}
        />
      </Secao>

      <Secao
        titulo="Modo Fire"
        nota="MVP ou All Star com 75% da média já no 1º quarto. Brilho ao redor do card mais ícone e rótulo."
      >
        <CardEntrada
          nome="Anthony Edwards"
          timeSigla="MIN"
          timeNome="Minnesota Timberwolves"
          posicao="G"
          atributo="PONTOS"
          nivelJogador="MVP"
          nivelApito={1}
          confianca={95}
          modoFire
          alvo1Q={9}
          historico={[true, true, true, false, true]}
        />
      </Secao>

      <Secao
        titulo="Cruzamento com OPD"
        nota="Jogador que já vinha apitado em OPD pré-live e voltou a apitar ao vivo. O marcador registra a origem."
      >
        <CardEntrada
          nome="Grimes"
          timeSigla="LAL"
          timeNome="Lakers"
          posicao="G"
          atributo="PONTOS"
          nivelJogador="SUPORTE"
          nivelApito={3}
          confianca={91}
          opdOrigemNivel={3}
          alvo1Q={7}
          odd={{ min: 2.0, max: 2.5, casas: 2 }}
        />
      </Secao>

      <Secao titulo="Rebotes e assistências" nota="O modelo é (jogador, atributo). Pontos não é o único caso.">
        <CardEntrada
          nome="Wembanyama"
          timeSigla="SAS"
          timeNome="San Antonio Spurs"
          posicao="C"
          atributo="REBOTES"
          nivelJogador="MVP"
          nivelApito={2}
          confianca={92}
          alvo1Q={6}
        />
        <CardEntrada
          nome="Haliburton"
          timeSigla="IND"
          timeNome="Indiana Pacers"
          posicao="G"
          atributo="ASSISTENCIAS"
          nivelJogador="SUPORTE"
          nivelApito={2}
          confianca={85.5}
          alvo1Q={2}
        />
      </Secao>

      <Secao titulo="Contraste verificado" nota="Valores calculados na renderização — não são texto fixo.">
        <table style={{ borderCollapse: 'collapse', fontSize: 13, maxWidth: 560 }}>
          <thead>
            <tr style={{ textAlign: 'left', opacity: 0.6 }}>
              <th style={{ padding: '6px 12px 6px 0' }}>Elemento</th>
              <th style={{ padding: '6px 12px 6px 0' }}>vs superfície</th>
              <th style={{ padding: '6px 0' }}>número no anel</th>
            </tr>
          </thead>
          <tbody>
            {[
              ...Object.entries(APITO).map(([k, v]) => [`Anel nível ${k}`, v.cor] as const),
              ['Anel turbo', TURBO.cor] as const,
              ['Modo fire', MODO_FIRE.cor] as const,
              ...Object.entries(NIVEL_JOGADOR).map(([k, v]) => [`Borda ${k}`, v.cor] as const),
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
