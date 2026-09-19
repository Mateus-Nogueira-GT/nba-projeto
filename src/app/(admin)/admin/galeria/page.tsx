import type { Nivel, NivelApito } from '@/modules/motor/tipos'
import {
  BarraAlvo,
  Barrinhas,
  CabecalhoJogo,
  CardEntrada,
  FormaNoAtributo,
  HierarquiaDoTime,
  Pilula,
  SeloContexto,
} from '@/design-system/componentes'
import { semantico } from '@/design-system/tokens/semantico'
import { componente } from '@/design-system/tokens/componente'
import { CONFIANCA_GRAU, NIVEL_JOGADOR, APITO, TURBO, MODO_FIRE } from '@/design-system/tokens/css'
import { razaoDeContraste } from '@/design-system/tokens/contraste'
import { Chip } from '@/components/navegacao'
import { SeletorJogosAoVivo } from '@/components/ao-vivo/SeletorJogosAoVivo'
import '@/design-system/tokens/tokens.css'
import { negarSeNaoForAdmin } from '../guarda'

export const metadata = { title: 'Galeria · Design System' }

const NIVEIS: Nivel[] = ['MVP', 'ALL_STAR', 'SUPORTE', 'RANDOLA']
const APITOS: NivelApito[] = [1, 2, 3]
const GRAUS = [1, 2, 3, 4, 5] as const


const EXEMPLO: Record<Nivel, { nome: string; time: string; sigla: string; posicao: string }> = {
  MVP: { nome: 'Jokic', time: 'Denver Nuggets', sigla: 'DEN', posicao: 'C' },
  ALL_STAR: { nome: 'Austin Reaves', time: 'Lakers', sigla: 'LAL', posicao: 'G' },
  SUPORTE: { nome: 'Grimes', time: 'Lakers', sigla: 'LAL', posicao: 'G' },
  RANDOLA: { nome: 'Mamukelashvili', time: 'Lakers', sigla: 'LAL', posicao: 'F' },
}

function Secao({
  titulo,
  nota,
  children,
}: {
  titulo: string
  nota?: string
  children: React.ReactNode
}) {
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
        // O respiro encolhe com a tela. Com 32 fixos sobravam 256 px a 320, e
        // o card de entrada precisa dos mesmos ~288 que tem no app — a galeria
        // era a única tela do projeto com rolagem horizontal a 320.
        padding: 'clamp(16px, 4vw, 32px)',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <header style={{ marginBottom: 32, maxWidth: 720 }}>
        <h1 style={{ margin: 0 }}>Design System · NIP</h1>
        <p style={{ opacity: 0.75, lineHeight: 1.6 }}>
          Dois canais, duas superfícies (identidade 06): a <strong>moldura do card</strong> —
          borda, lateral de 6 px e véu — é o nível do jogador, em ouro, prata, bronze ou branco;
          o <strong>anel do avatar</strong> é o nível do apito, e o numeral ao lado do nome repete
          a cor dele. A nota de confiança saiu do card e mora na análise do apito; o lugar de
          destaque agora é da <strong>odd</strong>. Turbo e modo fire nunca comunicam por cor ou
          brilho sozinhos — sempre selo escrito.
        </p>
      </header>

      <Secao
        titulo="4 níveis de jogador × 3 níveis de apito"
        nota="A MOLDURA muda com o nível do jogador; o anel do avatar muda com o nível do apito. Nenhuma cor é compartilhada entre os dois canais."
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
              linha={20}
            />
          )),
        )}
      </Secao>

      <Secao
        titulo="Dois cards completos, com barrinhas, média e odd"
        nota="Dos três brilhos da identidade 03 sobraram dois — turbo e modo fire. O da confiança saiu com ela na identidade 06."
      >
        <CardEntrada
          nome="Austin Reaves"
          timeSigla="LAL"
          posicao="G"
          atributo="PONTOS"
          nivelJogador="ALL_STAR"
          nivelApito={3}
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
          temperatura="quente"
          vivo
          opdOrigemNivel={3}
          alvo1Q={7}
          progresso1Q={{ observado: 4, alvo: 7 }}
        />
      </Secao>

      <Secao
        titulo="Rebotes e assistências"
        nota="O modelo é (jogador, atributo). Pontos não é o único caso."
      >
        <CardEntrada
          nome="Wembanyama"
          timeSigla="SAS"
          posicao="C"
          atributo="REBOTES"
          nivelJogador="MVP"
          nivelApito={2}
          linha={12}
        />
        <CardEntrada
          nome="Haliburton"
          timeSigla="IND"
          posicao="G"
          atributo="ASSISTENCIAS"
          nivelJogador="SUPORTE"
          nivelApito={2}
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
          linha={24}
        />
      </Secao>

      <Secao
        titulo="Rampa de confiança — as 5 pílulas"
        nota="Um matiz só, intensidade crescente do grau 1 (menor) ao 5 (maior). Nunca reusa cor categórica do apito ou do nível do jogador."
      >
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          {GRAUS.map((grau) => (
            <span
              key={grau}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}
            >
              <Pilula texto={`${80 + grau * 3}`} cor={CONFIANCA_GRAU[grau]} brilho={grau === 5} />
              <span style={{ fontSize: 12, opacity: 0.7 }}>grau {grau}</span>
            </span>
          ))}
        </div>
      </Secao>

      {/* ---------------------------------------------------------------- */}
      {/* Identidade 04 · varredura e análise                               */}
      {/* ---------------------------------------------------------------- */}

      <Secao
        titulo="Identidade 04 · o card fecha o ciclo"
        nota="PRÉ → 1º Q → FIM 1º Q → AGUARDANDO OFICIAL → CONFERIDO, o mesmo card na Lista, no Fire Live e nos Resultados. O badge de status tem largura fixa para o card não pular a cada refresh; conferido, o rodapé diz fez N com ✓ ou ✗ — e quem não jogou é neutro, nem um nem outro."
      >
        <CardEntrada
          nome="Cooper Flagg"
          timeSigla="DAL"
          adversarioSigla="ORL"
          posicao="F"
          atributo="PONTOS"
          nivelJogador="ALL_STAR"
          nivelApito={3}
          linha={15}
          estado="PRE"
          ultimos5={[
            { valor: 19, bateu: true },
            { valor: 22, bateu: true },
            { valor: 17, bateu: true },
            { valor: 13, bateu: false },
            { valor: 25, bateu: true },
          ]}
          mediaTemporada={18.6}
          oddFaixa={{ min: 1.47, max: 1.62, qtdCasas: 3 }}
        />
        <CardEntrada
          nome="Giannis"
          timeSigla="MIA"
          adversarioSigla="IND"
          posicao="F"
          atributo="PONTOS"
          nivelJogador="MVP"
          nivelApito={1}
          modoFire
          temperatura="quente"
          vivo
          estado="Q1"
          alvo1Q={11}
          progresso1Q={{ observado: 9, alvo: 11 }}
        />
        <CardEntrada
          nome="Siakam"
          timeSigla="IND"
          adversarioSigla="MIA"
          posicao="F"
          atributo="REBOTES"
          nivelJogador="MVP"
          nivelApito={1}
          temperatura="quente"
          estado="FIM_Q1"
          alvo1Q={3}
          progresso1Q={{ observado: 3, alvo: 3 }}
          alvoFire={{ valor: 2.25, rotulo: 'marco de exemplo' }}
        />
        <CardEntrada
          nome="Cooper Flagg"
          timeSigla="DAL"
          adversarioSigla="ORL"
          posicao="F"
          atributo="PONTOS"
          nivelJogador="ALL_STAR"
          nivelApito={3}
          linha={15}
          estado="AGUARDANDO_OFICIAL"
        />
        <CardEntrada
          nome="Cooper Flagg"
          timeSigla="DAL"
          adversarioSigla="ORL"
          posicao="F"
          atributo="PONTOS"
          nivelJogador="ALL_STAR"
          nivelApito={3}
          linha={15}
          estado="CONFERIDO"
          fez={25}
          bateu
          ultimos5={[
            { valor: 25, bateu: true },
            { valor: 19, bateu: true },
            { valor: 22, bateu: true },
            { valor: 17, bateu: true },
            { valor: 13, bateu: false },
          ]}
        />
        <CardEntrada
          nome="Irving"
          timeSigla="DAL"
          adversarioSigla="ORL"
          posicao="G"
          atributo="ASSISTENCIAS"
          nivelJogador="MVP"
          nivelApito={1}
          linha={5}
          estado="CONFERIDO"
          fez={4}
          bateu={false}
          ultimos5={[
            { valor: 4, bateu: false },
            { valor: 6, bateu: true },
            { valor: 3, bateu: false },
            { valor: 7, bateu: true },
            { valor: 5, bateu: true },
          ]}
        />
        <CardEntrada
          nome="Banchero"
          timeSigla="ORL"
          adversarioSigla="DAL"
          posicao="F"
          atributo="ASSISTENCIAS"
          nivelJogador="ALL_STAR"
          nivelApito={1}
          linha={4}
          estado="CONFERIDO"
          fez={null}
          bateu={null}
        />
      </Secao>

      <Secao
        titulo="Identidade 04 · abas de atributo e as quatro lentes"
        nota="Um jogador com dois ou três atributos é UM card: as abas do rodapé trocam o mercado. A lente do cabeçalho da tela troca a zona 2 de todos os cards de uma vez — ÚLT. 5 (padrão), MÉDIA × LINHA, ODDS, HIERARQUIA. Sem dado, a lente escreve o rótulo com um traço, nunca um número inventado."
      >
        <CardEntrada
          nome="Kevin Porter"
          timeSigla="MIL"
          adversarioSigla="LAC"
          posicao="G"
          atributo="PONTOS"
          nivelJogador="ALL_STAR"
          nivelApito={3}
          opdOrigemNivel={3}
          linha={10}
          atributos={[
            { atributo: 'PONTOS', linha: 10, ativo: true, href: '#pts' },
            { atributo: 'REBOTES', linha: 3, ativo: false, href: '#reb' },
            { atributo: 'ASSISTENCIAS', linha: 4, ativo: false, href: '#ast' },
          ]}
          ultimos5={[
            { valor: 13, bateu: true },
            { valor: 7, bateu: false },
            { valor: 17, bateu: true },
            { valor: 19, bateu: true },
            { valor: 11, bateu: true },
          ]}
          mediaTemporada={16.2}
          oddFaixa={{ min: 1.47, max: 1.62, qtdCasas: 3 }}
        />
        <CardEntrada
          nome="Fontecchio"
          timeSigla="MIA"
          adversarioSigla="IND"
          posicao="C"
          atributo="REBOTES"
          nivelJogador="SUPORTE"
          nivelApito={3}
          linha={4}
          lente="MEDIA_LINHA"
          mediaTemporada={4.9}
          oddFaixa={{ min: 1.49, max: 1.66, qtdCasas: 3 }}
        />
        <CardEntrada
          nome="Fontecchio"
          timeSigla="MIA"
          adversarioSigla="IND"
          posicao="C"
          atributo="REBOTES"
          nivelJogador="SUPORTE"
          nivelApito={3}
          linha={4}
          lente="ODDS"
          mediaTemporada={4.9}
          oddFaixa={{ min: 1.49, max: 1.66, qtdCasas: 3 }}
        />
        <CardEntrada
          nome="Fontecchio"
          timeSigla="MIA"
          adversarioSigla="IND"
          posicao="C"
          atributo="REBOTES"
          nivelJogador="SUPORTE"
          nivelApito={3}
          linha={4}
          lente="HIERARQUIA"
          hierarquia={{ posicao: 2, total: 8 }}
          mediaTemporada={4.9}
        />
        <CardEntrada
          nome="Toppin"
          timeSigla="IND"
          adversarioSigla="MIA"
          posicao="F"
          atributo="ASSISTENCIAS"
          nivelJogador="RANDOLA"
          nivelApito={2}
          linha={2}
          lente="HIERARQUIA"
          hierarquia={null}
        />
      </Secao>

      <Secao
        titulo="Identidade 04 · cabeçalho de jogo e selo de contexto"
        nota="A única fronteira de seção da varredura: visitante @ mandante, sigla na fonte de título, sem escudo. Frio na Lista Secreta; quente com o placar do 1º quarto no Fire Live; mudo enquanto o jogo não começou. O ponto do ao vivo não pulsa — nada se anima continuamente. O selo preenchido no canto do cabeçalho da tela veste os dois universos."
      >
        <CabecalhoJogo
          casaSigla="IND"
          visitanteSigla="MIA"
          horarioUtc={new Date('2026-01-15T22:30:00.000Z')}
          fuso="America/Sao_Paulo"
          status="AGENDADO"
        />
        <CabecalhoJogo
          casaSigla="IND"
          visitanteSigla="MIA"
          horarioUtc={new Date('2026-01-15T22:30:00.000Z')}
          fuso="America/Sao_Paulo"
          status="AO_VIVO"
        />
        <CabecalhoJogo
          casaSigla="ORL"
          visitanteSigla="DAL"
          horarioUtc={new Date('2026-01-15T22:30:00.000Z')}
          fuso="America/Sao_Paulo"
          status="ENCERRADO"
          placarCasa={108}
          placarVisitante={116}
          quartosCasa={[25, 28, 26, 29]}
          quartosVisitante={[30, 27, 31, 28]}
        />
        <CabecalhoJogo
          casaSigla="IND"
          visitanteSigla="MIA"
          horarioUtc={new Date('2026-01-15T22:30:00.000Z')}
          fuso="America/Sao_Paulo"
          status="AO_VIVO"
          placarCasa={33}
          placarVisitante={48}
          temperatura="quente"
        />
        <CabecalhoJogo
          casaSigla="SAS"
          visitanteSigla="PHI"
          horarioUtc={new Date('2026-01-15T23:00:00.000Z')}
          fuso="America/Sao_Paulo"
          status="AGENDADO"
          temperatura="quente"
        />
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <SeloContexto contexto="preLive" />
          <SeloContexto contexto="aoVivo" />
        </div>
      </Secao>

      <Secao
        titulo="Transmissão · seletor de jogos"
        nota="Um jogo por vez. Nome completo e escudo permanecem no seletor; o jogo ativo é identificado também por aria-current. Os dados abaixo são ilustrativos."
      >
        <SeletorJogosAoVivo
          jogoAtivo="galeria-ao-vivo"
          rotaDoJogo={(jogoId) => `#${jogoId}`}
          grupos={[
            {
              jogoId: 'galeria-ao-vivo',
              casaSigla: 'CLE',
              visitanteSigla: 'SAC',
              dataHoraUtc: new Date('2026-09-08T23:00:00.000Z'),
              status: 'AO_VIVO',
              quartoAtual: 1,
              placarCasa: 49,
              placarVisitante: 30,
              itens: [],
              estado: 'EM_1Q',
              alvosAguardando: 0,
            },
            {
              jogoId: 'galeria-aguardando',
              casaSigla: 'LAL',
              visitanteSigla: 'BOS',
              dataHoraUtc: new Date('2026-09-09T01:00:00.000Z'),
              status: 'AGENDADO',
              quartoAtual: null,
              placarCasa: null,
              placarVisitante: null,
              itens: [],
              estado: 'AGUARDANDO',
              alvosAguardando: 4,
            },
          ]}
        />
      </Secao>

      <Secao
        titulo="Identidade 04 · forma no atributo"
        nota="Dez jogos do mais antigo ao mais recente, contra a mesma linha do apito. A amostra curta mantém as colunas; sem linha, o histórico informa os valores sem veredito. Dados ilustrativos."
      >
        <FormaNoAtributo
          linha={20}
          jogos={[
            { valor: 18, bateu: false, adversarioSigla: 'BOS' },
            { valor: 25, bateu: true, adversarioSigla: 'MIA' },
            { valor: 21, bateu: true, adversarioSigla: 'ORL' },
            { valor: 14, bateu: false, adversarioSigla: 'IND' },
            { valor: 27, bateu: true, adversarioSigla: 'NYK' },
            { valor: 20, bateu: true, adversarioSigla: 'ATL' },
            { valor: 19, bateu: false, adversarioSigla: 'CHI' },
            { valor: 23, bateu: true, adversarioSigla: 'TOR' },
            { valor: 16, bateu: false, adversarioSigla: 'MIL' },
            { valor: 26, bateu: true, adversarioSigla: 'DAL' },
          ]}
        />
        <FormaNoAtributo
          linha={null}
          jogos={[
            { valor: 0, bateu: false, adversarioSigla: 'BOS' },
            { valor: 3, bateu: false, adversarioSigla: 'MIA' },
            { valor: 5, bateu: false, adversarioSigla: 'ORL' },
          ]}
        />
      </Secao>

      <Secao
        titulo="Identidade 04 · marcos e barra congelada"
        nota="O ponto abaixo demonstra um valor conhecido no instante do apito, apenas na galeria. O feed só o exibe quando esse dado existir. Depois de FIM 1º Q a barra conserva o último valor do quarto; não há animação."
      >
        <BarraAlvo
          observado={9}
          alvo={11}
          unidade="pts"
          marcos={[{ valor: 8, rotulo: 'marco de exemplo', cor: MODO_FIRE.cor }]}
          apitouEm={{ valor: 7, rotulo: 'apitou aqui' }}
        />
        <div>
          <p style={{ color: semantico.textoSecundario, fontSize: 12 }}>FIM 1º Q · congelada</p>
          <BarraAlvo
            observado={11}
            alvo={11}
            unidade="pts"
            marcos={[{ valor: 8, rotulo: 'marco de exemplo', cor: MODO_FIRE.cor }]}
          />
        </div>
      </Secao>

      <Secao
        titulo="Identidade 04 · hierarquia e prefixo desfalcado"
        nota="As ausências consecutivas desde o nº 1 recebem destaque. A ausência isolada no nº 4 continua escrita, com a posição e o nível do jogador. Exemplos ilustrativos da curadoria NIP."
      >
        <HierarquiaDoTime
          linhas={[
            { jogadorId: 'galeria-1', posicao: 1, nome: 'LeBron James', nivel: 'MVP', fora: true },
            { jogadorId: 'galeria-2', posicao: 2, nome: 'Embiid', nivel: 'MVP', fora: true },
            { jogadorId: 'galeria-3', posicao: 3, nome: 'Maxey', nivel: 'ALL_STAR', fora: false },
            { jogadorId: 'galeria-4', posicao: 4, nome: 'Grimes', nivel: 'SUPORTE', fora: true },
          ]}
        />
        <HierarquiaDoTime linhas={[]} />
      </Secao>

      <Secao
        titulo="Identidade 04 · a última barrinha é desta rodada"
        nota="O contorno e a descrição acessível identificam o resultado acrescentado ao fim da fileira."
      >
        <Barrinhas
          rotulo="ÚLT. 5 NA LINHA"
          destacarUltima
          jogos={[
            { valor: 19, bateu: true },
            { valor: 22, bateu: true },
            { valor: 17, bateu: true },
            { valor: 13, bateu: false },
            { valor: 25, bateu: true },
          ]}
        />
      </Secao>

      <Secao
        titulo="Identidade 05 · marca"
        nota="As peças do Manual da Marca: botão primário chapado, selo de contexto nas duas temperaturas, chip ativo e inativo, e os dois universos re-derivados das superfícies do manual. O azul só aparece preenchido; a tinta é branca."
      >
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '0 18px',
              minHeight: componente.ctaAltura,
              borderRadius: componente.raioControle,
              background: componente.ctaFundo,
              color: componente.ctaTexto,
              fontWeight: 700,
            }}
          >
            Ver os planos
          </span>
          <SeloContexto contexto="preLive" />
          <SeloContexto contexto="aoVivo" />
          <Chip href="#" ativo>
            Ativo
          </Chip>
          <Chip href="#" ativo={false}>
            Inativo
          </Chip>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {(
            [
              ['Universo frio · pré-live', componente.contextoFrio],
              ['Universo quente · Fire Live', componente.contextoQuente],
            ] as const
          ).map(([nome, contexto]) => (
            <div
              key={nome}
              style={{
                flex: '1 1 260px',
                padding: 16,
                borderRadius: componente.cardRaio,
                background: contexto.cardGradiente,
                border: `1px solid ${contexto.borda}`,
              }}
            >
              <p style={{ margin: 0, fontFamily: semantico.fonteRotulo, fontSize: 12 }}>{nome}</p>
              <p
                style={{
                  margin: '6px 0 0',
                  fontFamily: semantico.fonteNumero,
                  fontSize: 34,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                88
              </p>
            </div>
          ))}
        </div>
      </Secao>

      <Secao
        titulo="Contraste verificado"
        nota="Valores calculados na renderização — não são texto fixo. A última coluna mede o par do manual: branco sobre o preenchimento."
      >
        {/* A tabela rola DENTRO de si a 320 px. Uma tabela de quatro colunas
            numéricas não encolhe abaixo do seu min-content, e sem este
            invólucro ela empurrava a página inteira para os lados — rolagem
            horizontal é o que o manual proíbe (p.6). */}
        <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 13, maxWidth: 560 }}>
            <thead>
              <tr style={{ textAlign: 'left', opacity: 0.6 }}>
                <th style={{ padding: '6px 12px 6px 0' }}>Elemento</th>
                <th style={{ padding: '6px 12px 6px 0' }}>vs superfície</th>
                <th style={{ padding: '6px 12px 6px 0' }}>vs texto sobre cor</th>
                <th style={{ padding: '6px 0' }}>vs branco</th>
              </tr>
            </thead>
            <tbody>
              {[
                ...Object.entries(APITO).map(([k, v]) => [`Apito nível ${k}`, v.cor] as const),
                ['Apito turbo', TURBO.cor] as const,
                ['Modo fire', MODO_FIRE.cor] as const,
                ...Object.entries(NIVEL_JOGADOR).map(([k, v]) => [`Faixa ${k}`, v.cor] as const),
                ...Object.entries(CONFIANCA_GRAU).map(
                  ([k, v]) => [`Pílula confiança grau ${k}`, v] as const,
                ),
                // Identidade 05: as três cores do manual que recebem texto
                // BRANCO em cima. A coluna "vs superfície" é a que NÃO deve
                // passar (elas são fundo, não tinta); a "vs branco" é a que tem
                // de passar. Vêm sob a chave `fundo` de propósito: é o que elas
                // são aqui, e é assim que o teste "azul nunca é tinta" as lê.
                ...[
                  { nome: 'Acento · azul do manual', fundo: semantico.acento },
                  { nome: 'Acento · hover', fundo: semantico.acentoClaro },
                  { nome: 'Selo ao vivo · vermelho do manual', fundo: semantico.vivoSelo },
                ].map((amostra) => [amostra.nome, amostra.fundo] as const),
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
                  <td style={{ padding: '6px 12px 6px 0', fontVariantNumeric: 'tabular-nums' }}>
                    {razaoDeContraste(cor, semantico.textoSobreCor).toFixed(2)}:1
                  </td>
                  <td style={{ padding: '6px 0', fontVariantNumeric: 'tabular-nums' }}>
                    {razaoDeContraste(cor, semantico.textoSobreAcento).toFixed(2)}:1
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Secao>
    </main>
  )
}
