import type { ReactNode } from 'react'
import type { NivelApito } from '@/modules/motor/tipos'
// O vocabulário vem da ENTREGA, não do motor: `src/app` só pode importar TIPO
// do motor (regra `tela-nao-chama-o-motor`); as mesmas listas existem nas
// rotas da Lista, que é de onde toda tela as lê.
import { ATRIBUTOS, NIVEIS } from '@/modules/entrega/lista-secreta-rotas'
import { carregarLista } from '@/features/lista/carregar'
import { lerEstadoDaTabela } from '@/features/lista/estado'
import { TabelaDeApitos } from '@/features/lista/TabelaDeApitos'
import { Logo } from '@/ui/Logo'
import { BotaoPrimario, BotaoSecundario, EstadoVazio, FaixaAviso, NumeroGrande } from '@/ui/blocos'
import { Abas, BotaoContorno, Chip, Segmentado } from '@/ui/controles'
import { GraficoBarras, Minigrafico } from '@/ui/graficos'
import { IconeInfo, IconeRelogio } from '@/ui/icones'
import { IndicadorApito, PilulaConfianca, PilulaMercado, SeloAoVivo, SeloNivel } from '@/ui/marcas'
import { FotoJogador, LogoTime } from '@/ui/midia'
import { CabecalhoAdmin, Painel } from '@/features/admin/componentes'
import { negarSeNaoForAdmin } from '@/features/admin/guarda'
import { coresDosTokens, contraste } from '@/features/admin/galeria/contraste'
import s from '@/features/admin/Admin.module.css'
import g from '@/features/admin/galeria/Galeria.module.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Galeria · Design System' }

const APITOS: NivelApito[] = [1, 2, 3]
const GRAUS = [
  [80, 1],
  [83, 2],
  [86, 3],
  [89, 4],
  [93, 5],
] as const

const AA_TEXTO = 4.5

const FORMA = [
  { valor: 24, bateu: true, adversarioSigla: 'BOS' },
  { valor: 18, bateu: false, adversarioSigla: 'MIA' },
  { valor: 27, bateu: true, adversarioSigla: 'NYK' },
  { valor: 21, bateu: true, adversarioSigla: 'PHI' },
  { valor: 15, bateu: false, adversarioSigla: 'DEN' },
  { valor: 30, bateu: true, adversarioSigla: 'GSW' },
]

function Amostra({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className={g.amostra}>
      <div className={g.palco}>{children}</div>
      <span className={g.legenda}>{rotulo}</span>
    </div>
  )
}

export default async function PaginaGaleria() {
  const negado = await negarSeNaoForAdmin()
  if (negado) return negado

  const [tokens, lista] = await Promise.all([coresDosTokens(), carregarLista(lerEstadoDaTabela({}))])
  const grupos = [...new Set(tokens.map((t) => t.grupo))]
  // As três cores de referência da medição também saem dos tokens — a galeria
  // não guarda cópia em hex (teste de marca). `--superficie` é a PRIMEIRA
  // ocorrência, o `:root` base, a mesma contra a qual se media antes; o branco
  // é o `--texto-sobre-acento` e a tinta escura é a do Manual.
  const valorDe = (nome: string) => tokens.find((t) => t.nome === nome)?.valor ?? ''
  const superficie = valorDe('--superficie')
  const branco = valorDe('--texto-sobre-acento')
  const tintaEscura = valorDe('--tinta-escura')
  const gruposDaTabela = lista.tipo === 'lista' ? lista.grupos.slice(0, 1).map((gr) => ({ ...gr, linhas: gr.linhas.slice(0, 3) })) : []

  return (
    <div className={s.tela}>
      <CabecalhoAdmin
        area="galeria"
        titulo="Design System · NIP v2"
        apoio="Tokens, componentes e contraste do app, lidos do código em uso — o que aparece aqui é o que o assinante vê."
      />

      <Painel titulo="Marca" apoio="Sempre o arquivo do Manual da Marca: só a largura varia." largo>
        <div className={g.linha}>
          <Amostra rotulo="Logo · 200px">
            <Logo largura={200} />
          </Amostra>
          <Amostra rotulo="Logo · 120px">
            <Logo largura={120} />
          </Amostra>
          <Amostra rotulo="Logo · 72px (topo do celular)">
            <Logo largura={72} />
          </Amostra>
        </div>
      </Painel>

      <Painel
        titulo="Cores"
        apoio={`Lidas de src/ui/tokens.css. Três medidas, como manda o Manual: a cor sobre a superfície (${superficie}), o texto escuro sobre a cor e o BRANCO sobre a cor — é branco que o manual põe sobre o preenchimento. Texto precisa de ${AA_TEXTO}:1.`}
        largo
      >
        {grupos.map((grupo) => (
          <div key={grupo} className={g.grupoCores}>
            <h3 className={s.subtitulo}>{grupo}</h3>
            <div className={g.cores}>
              {tokens
                .filter((t) => t.grupo === grupo)
                .map((t) => {
                  const razao = contraste(t.valor, superficie)
                  // A cor também é FUNDO: o manual escreve branco sobre o
                  // preenchimento, e é esse par que precisa passar.
                  const sobreBranco = contraste(branco, t.valor)
                  const sobreEscuro = contraste(tintaEscura, t.valor)
                  return (
                    <div key={t.nome} className={g.cor}>
                      <span className={g.chip} style={{ background: `var(${t.nome})` }} aria-hidden />
                      <span className={g.corTexto}>
                        <code>{t.nome}</code>
                        <span className={s.fraco}>{t.valor}</span>
                        {razao !== null && (
                          <span className={g.razao} data-passa={razao >= AA_TEXTO}>
                            {razao.toFixed(2).replace('.', ',')}:1 {razao >= AA_TEXTO ? 'AA' : 'só gráfico'}
                            <span className={s.fraco}> sobre a superfície</span>
                          </span>
                        )}
                        {sobreBranco !== null && (
                          <span className={g.razao} data-passa={sobreBranco >= AA_TEXTO}>
                            {sobreBranco.toFixed(2).replace('.', ',')}:1
                            <span className={s.fraco}> branco sobre a cor</span>
                          </span>
                        )}
                        {sobreEscuro !== null && (
                          <span className={g.razao} data-passa={sobreEscuro >= AA_TEXTO}>
                            {sobreEscuro.toFixed(2).replace('.', ',')}:1
                            <span className={s.fraco}> tinta escura sobre a cor</span>
                          </span>
                        )}
                      </span>
                    </div>
                  )
                })}
            </div>
          </div>
        ))}
      </Painel>

      <Painel titulo="Tipografia" apoio="Montserrat na interface; Bebas Neue só no logo e em números de impacto — nunca em formulário." largo>
        <div className={g.linha}>
          <Amostra rotulo="Bebas · número-herói 40px">
            <span className={g.heroi}>94%</span>
          </Amostra>
          <Amostra rotulo="Montserrat 700 · 28px (título)">
            <span style={{ fontSize: 28, fontWeight: 700 }}>Entradas</span>
          </Amostra>
          <Amostra rotulo="Montserrat 500 · 14px (corpo)">
            <span>Texto de interface, base do app.</span>
          </Amostra>
          <Amostra rotulo="Rótulo · 12px caixa-alta (piso)">
            <span className={g.rotulo}>Últimos 5</span>
          </Amostra>
        </div>
      </Painel>

      <div className={s.grade}>
        <Painel titulo="Nível do jogador" apoio="Ouro, prata e bronze só aqui.">
          <div className={g.linha}>
            {NIVEIS.map((n) => (
              <SeloNivel key={n} nivel={n} />
            ))}
          </div>
        </Painel>

        <Painel titulo="Nível do apito" apoio="Três barras que acendem; o texto acompanha — cor nunca é o único canal.">
          <div className={g.linha}>
            {APITOS.map((n) => (
              <IndicadorApito key={n} nivel={n} turbo={false} />
            ))}
            <IndicadorApito nivel={3} turbo />
            <IndicadorApito nivel={2} turbo={false} opd />
          </div>
        </Painel>

        {/* O apoio não escreve a palavra proibida nem para proibi-la: a
            galeria é tela, e a palavra não entra em tela nenhuma (CLAUDE.md). */}
        <Painel titulo="Confiança" apoio="As 5 faixas da pílula. É score de confiança, não chance — o nome é este.">
          <div className={g.linha}>
            {GRAUS.map(([valor, grau]) => (
              <PilulaConfianca key={grau} valor={valor} grau={grau} />
            ))}
          </div>
        </Painel>

        <Painel titulo="Mercado e ao vivo" apoio="A linha do apito e o único uso do vermelho NIP.">
          <div className={g.linha}>
            {ATRIBUTOS.map((a, i) => (
              <PilulaMercado key={a} linha={[20.5, 8, 5][i]!} atributo={a} />
            ))}
            <PilulaMercado linha={null} atributo="PONTOS" curto />
            <SeloAoVivo />
            <SeloAoVivo texto="Ao vivo · 1º Q" />
          </div>
        </Painel>

        <Painel titulo="Controles">
          <div className={g.coluna}>
            <Segmentado
              rotulo="Exemplo de segmentado"
              opcoes={[
                { valor: 'jogo', rotulo: 'Por jogo', href: '#', ativo: true },
                { valor: 'nivel', rotulo: 'Por nível', href: '#', ativo: false },
              ]}
            />
            <Abas
              rotulo="Exemplo de abas"
              abas={[
                { chave: 't', rotulo: 'Todos', href: '#', ativo: true, contador: 13 },
                { chave: 'p', rotulo: 'Pontos', href: '#', ativo: false, contador: 6 },
                { chave: 'r', rotulo: 'Rebotes', href: '#', ativo: false, contador: 2 },
              ]}
            />
            <div className={g.linha}>
              <Chip href="#">Oscilação</Chip>
              <Chip href="#" ativo>
                OPD
              </Chip>
              <BotaoContorno href="#" icone={<IconeInfo tamanho={16} />}>
                Como funciona
              </BotaoContorno>
            </div>
            <div className={g.linha}>
              <BotaoPrimario href="#">Botão primário</BotaoPrimario>
              <BotaoSecundario href="#">Secundário</BotaoSecundario>
            </div>
          </div>
        </Painel>

        <Painel titulo="Mídia" apoio="Foto com anel na cor do apito; sem foto, as iniciais.">
          <div className={g.linha}>
            <Amostra rotulo="Com foto (CDN NBA)">
              <FotoJogador nome="Nikola Jokić" fotoUrl={null} tamanho={56} anel="var(--apito-3)" timeSigla="DEN" />
            </Amostra>
            <Amostra rotulo="Sem foto">
              <FotoJogador nome="Jogador Exemplo" fotoUrl={null} tamanho={56} anel="var(--apito-turbo)" />
            </Amostra>
            <Amostra rotulo="Logos">
              <span className={g.linha}>
                <LogoTime sigla="LAL" tamanho={28} />
                <LogoTime sigla="BOS" tamanho={28} />
                <LogoTime sigla="XXX" tamanho={28} />
              </span>
            </Amostra>
          </div>
        </Painel>

        <Painel titulo="Gráficos" apoio="Minigráfico da tabela e o gráfico do detalhe, antigo → recente." largo>
          <div className={g.linha}>
            <Amostra rotulo="Minigráfico · últimos 5">
              <Minigrafico jogos={FORMA.slice(-5)} />
            </Amostra>
          </div>
          <GraficoBarras jogos={FORMA} linha={20.5} />
        </Painel>

        <Painel titulo="Números e estados" largo>
          <dl className={g.numeros}>
            <NumeroGrande rotulo="Confiança" valor="94%" apoio="MAIS FORTE" />
            <NumeroGrande rotulo="Bateu" valor="4/5" tom="bom" apoio="últimos 5" />
            <NumeroGrande rotulo="Média" valor="24,3" apoio="temporada" />
            <NumeroGrande rotulo="Falhou" valor="1/5" tom="ruim" />
          </dl>
          <FaixaAviso tom="convite" acao={{ rotulo: 'Ver planos', href: '#' }}>
            <strong>Faixa de aviso.</strong> Demonstração, convite do plano ou atualização do app.
          </FaixaAviso>
          <EstadoVazio icone={<IconeRelogio />} titulo="Próxima lista às 20h" texto="Estado vazio com causa e saída." acao={{ rotulo: 'Ação', href: '#' }} />
        </Painel>

        {gruposDaTabela.length > 0 && lista.tipo === 'lista' && (
          <Painel titulo="Tabela de apitos" apoio="Dados reais da rodada em tela, 3 linhas." largo>
            <TabelaDeApitos grupos={gruposDaTabela} estado={lerEstadoDaTabela({})} fuso={lista.fuso} lente={lista.lente} />
          </Painel>
        )}
      </div>
    </div>
  )
}
