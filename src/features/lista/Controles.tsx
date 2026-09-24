import type { Lente, OrdemLista } from '@/modules/plataforma/preferencias'
import { METODOS } from '@/modules/entrega/lista-secreta-rotas'
import { ATRIBUTOS, type Atributo, type Nivel } from '@/modules/motor/tipos'
import { Abas, Chip, Segmentado } from '@/ui/controles'
import { Folha } from '@/ui/Folha'
import { IconeBusca, IconeFechar, IconeFiltros } from '@/ui/icones'
import { ROTULO_ATRIBUTO, ROTULO_NIVEL } from '@/ui/marcas'
import { definirLente, definirOrdem } from './acoes'
import { hrefDaLista, QUANTIDADES_DA_LISTA, quantosRecortes, SEM_RECORTE, type EstadoDaTabela } from './estado'
import s from './Lista.module.css'

const ROTULO_METODO: Record<(typeof METODOS)[number], string> = {
  OSCILACAO: 'Oscilação',
  OPD: 'OPD',
  TURBO: 'Turbo',
}

const ROTULO_LENTE: Record<Lente, string> = {
  ULT5: 'Últ. 5',
  MEDIA_LINHA: 'Média',
  ODDS: 'Odds',
  HIERARQUIA: 'Hierarquia',
}

/** A quantidade corta JOGADORES, não entradas — o rótulo diz a unidade. */
const rotuloQuantidade = (n: number) => (n === 0 ? 'Lista inteira' : `${n} jogador${n === 1 ? '' : 'es'}`)

export function AbasDeMercado({
  estado,
  atributos,
  contagem,
  total,
}: {
  estado: EstadoDaTabela
  atributos: Atributo[]
  contagem: Record<Atributo, number>
  total: number
}) {
  return (
    <Abas
      rotulo="Mercado"
      abas={[
        { chave: 'todos', rotulo: 'Todos', href: hrefDaLista(estado, { atributo: undefined }), ativo: !estado.atributo, contador: total },
        ...ATRIBUTOS.filter((a) => atributos.includes(a)).map((a) => ({
          chave: a,
          rotulo: ROTULO_ATRIBUTO[a],
          href: hrefDaLista(estado, { atributo: a }),
          ativo: estado.atributo === a,
          contador: contagem[a],
        })),
      ]}
    />
  )
}

type Opcoes = {
  times: string[]
  posicoes: string[]
  niveis: Nivel[]
  metodos: (typeof METODOS)[number][]
}

/** Os filtros, em grupos de chips. Mesmo conteúdo no desktop e no celular. */
function GruposDeFiltro({ estado, opcoes }: { estado: EstadoDaTabela; opcoes: Opcoes }) {
  const grupo = (titulo: string, chips: React.ReactNode) => (
    <fieldset className={s.grupoFiltro}>
      <legend>{titulo}</legend>
      <div className={s.chips}>{chips}</div>
    </fieldset>
  )
  return (
    <div className={s.filtros}>
      {grupo(
        'Método',
        opcoes.metodos.map((m) => (
          <Chip key={m} ativo={estado.metodo === m} href={hrefDaLista(estado, { metodo: estado.metodo === m ? undefined : m })}>
            {ROTULO_METODO[m]}
          </Chip>
        )),
      )}
      {grupo(
        'Nível do jogador',
        opcoes.niveis.map((n) => (
          <Chip key={n} ativo={estado.nivel === n} href={hrefDaLista(estado, { nivel: estado.nivel === n ? undefined : n })}>
            {ROTULO_NIVEL[n]}
          </Chip>
        )),
      )}
      {opcoes.posicoes.length > 0 &&
        grupo(
          'Posição',
          opcoes.posicoes.map((p) => (
            <Chip key={p} ativo={estado.posicao === p} href={hrefDaLista(estado, { posicao: estado.posicao === p ? undefined : p })}>
              {p}
            </Chip>
          )),
        )}
      {grupo(
        'Time',
        opcoes.times.map((t) => (
          <Chip key={t} ativo={estado.time === t} href={hrefDaLista(estado, { time: estado.time === t ? undefined : t })}>
            {t}
          </Chip>
        )),
      )}
      {grupo(
        'Quantos jogadores',
        [0, ...QUANTIDADES_DA_LISTA].map((q) => (
          <Chip key={q} ativo={estado.quantidade === q} href={hrefDaLista(estado, { quantidade: q })}>
            {q === 0 ? 'Todos' : q}
          </Chip>
        )),
      )}
    </div>
  )
}

/** Os recortes ativos como chips com ×, cada um limpando só a si. */
function RecortesAtivos({ estado }: { estado: EstadoDaTabela }) {
  const ativos: { rotulo: string; limpar: Partial<EstadoDaTabela> }[] = []
  if (estado.busca) ativos.push({ rotulo: `“${estado.busca}”`, limpar: { busca: undefined } })
  if (estado.metodo) ativos.push({ rotulo: ROTULO_METODO[estado.metodo], limpar: { metodo: undefined } })
  if (estado.nivel) ativos.push({ rotulo: ROTULO_NIVEL[estado.nivel], limpar: { nivel: undefined } })
  if (estado.posicao) ativos.push({ rotulo: estado.posicao, limpar: { posicao: undefined } })
  if (estado.time) ativos.push({ rotulo: estado.time, limpar: { time: undefined } })
  if (estado.quantidade !== 0) ativos.push({ rotulo: rotuloQuantidade(estado.quantidade), limpar: { quantidade: 0 } })
  if (estado.seguidos) ativos.push({ rotulo: 'Só seguidos', limpar: { seguidos: false } })
  if (ativos.length === 0) return null
  return (
    <div className={s.ativos}>
      {ativos.map((a) => (
        <Chip key={a.rotulo} ativo href={hrefDaLista(estado, a.limpar)}>
          {a.rotulo}
          <IconeFechar tamanho={14} />
          <span className="so-leitor">(remover filtro)</span>
        </Chip>
      ))}
      {ativos.length > 1 && (
        <a href={hrefDaLista(estado, SEM_RECORTE)} className={s.limpar}>
          Limpar tudo
        </a>
      )}
    </div>
  )
}

function IconeEstrela() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4L2.8 9.5l6.4-.8L12 2.8Z" />
    </svg>
  )
}

export function BarraDeControles({
  estado,
  opcoes,
  ordem,
  lente,
  abas,
  seguidosNaRodada,
}: {
  estado: EstadoDaTabela
  opcoes: Opcoes
  ordem: OrdemLista
  lente: Lente
  /** Quantos jogadores que a pessoa segue apitaram hoje. */
  seguidosNaRodada: number
  /** As abas de mercado moram na mesma barra, à esquerda. */
  abas: React.ReactNode
}) {
  const destino = hrefDaLista(estado)
  const n = quantosRecortes(estado)
  // Os campos que a busca precisa reenviar, com os MESMOS nomes que a rota lê.
  const escondidos: [string, string][] = [
    estado.quantidade !== 0 ? (['quantidade', String(estado.quantidade)] as [string, string]) : null,
    estado.metodo ? (['metodo', estado.metodo] as [string, string]) : null,
    estado.nivel ? (['nivel', estado.nivel] as [string, string]) : null,
    estado.time ? (['time', estado.time] as [string, string]) : null,
    estado.posicao ? (['posicao', estado.posicao] as [string, string]) : null,
    estado.atributo ? (['atributo', estado.atributo] as [string, string]) : null,
    estado.ordem ? (['ordem', estado.ordem] as [string, string]) : null,
    estado.lente ? (['lente', estado.lente] as [string, string]) : null,
    estado.ordenarPor !== 'sinal' ? (['ordenar', estado.ordenarPor] as [string, string]) : null,
    estado.seguidos ? (['seguidos', '1'] as [string, string]) : null,
  ].filter((p): p is [string, string] => p !== null)
  return (
    <div className={s.controles}>
      <div className={s.linhaPrincipal}>
        <div className={s.abasNaBarra}>{abas}</div>
      <div className={s.linhaControles}>
        <form action="/" className={s.busca} role="search">
          <IconeBusca tamanho={18} />
          <label htmlFor="busca-lista" className="so-leitor">
            Buscar jogador ou time
          </label>
          <input id="busca-lista" name="busca" type="search" placeholder="Buscar jogador ou time" defaultValue={estado.busca} autoComplete="off" />
          {/* Buscar é um recorte A MAIS, não um recomeço: o form leva junto
              tudo o que já estava escolhido. Sem isto, digitar um nome apagava
              método, nível, time, posição, quantidade, ordem e lente. */}
          {escondidos.map(([campo, valor]) => (
            <input key={campo} type="hidden" name={campo} value={valor} />
          ))}
        </form>
        <Segmentado
          rotulo="Agrupar"
          acao={definirOrdem}
          campo="ordem"
          destino={destino}
          opcoes={[
            { valor: 'POR_JOGO', rotulo: 'Por jogo', href: hrefDaLista(estado, { ordem: 'POR_JOGO' }), ativo: ordem === 'POR_JOGO' },
            { valor: 'POR_NIVEL', rotulo: 'Por nível', href: hrefDaLista(estado, { ordem: 'POR_NIVEL' }), ativo: ordem === 'POR_NIVEL' },
          ]}
        />
        {/* "Meus jogos" do Flashscore: os jogadores que a pessoa segue, num toque. */}
        <Chip ativo={estado.seguidos} href={hrefDaLista(estado, { seguidos: !estado.seguidos })}>
          <IconeEstrela />
          Seguidos
          <span className="num">{seguidosNaRodada}</span>
        </Chip>
        <Folha
          titulo="Filtros"
          gatilhoClasse={s.botaoFiltros}
          gatilho={
            <>
              <IconeFiltros tamanho={18} />
              Filtros
              {n > 0 && <span className={`${s.contador} num`}>{n}</span>}
            </>
          }
        >
          <GruposDeFiltro estado={estado} opcoes={opcoes} />
        </Folha>
      </div>
      </div>
      {/* A LENTE vale em toda largura: na linha estreita ela escolhe a métrica
          da direita, e na tabela ela é o único caminho para a HIERARQUIA, que
          não tem coluna própria. Escondê-la no desktop deixava a preferência
          da conta inalcançável e a consulta da hierarquia sem retorno. */}
      <div className={s.lenteBarra}>
        <span className={s.lenteRotulo}>Mostrar</span>
        <Segmentado
          rotulo="O que mostrar em cada linha"
          compacto
          acao={definirLente}
          campo="lente"
          destino={destino}
          opcoes={(['ULT5', 'MEDIA_LINHA', 'ODDS', 'HIERARQUIA'] as const).map((l) => ({
            valor: l,
            rotulo: ROTULO_LENTE[l],
            href: hrefDaLista(estado, { lente: l }),
            ativo: lente === l,
          }))}
        />
      </div>
      <RecortesAtivos estado={estado} />
    </div>
  )
}
