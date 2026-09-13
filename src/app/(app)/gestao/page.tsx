import Link from 'next/link'
import { redirect } from 'next/navigation'

import { horaCurta } from '@/components/formato'
import { CabecalhoTela, Moldura } from '@/components/navegacao'
import { dataDeReferencia } from '@/modules/dominio/rodada'
import { NIVEL_JOGADOR } from '@/design-system/tokens/css'
import { Avatar } from '@/design-system/componentes'
import { semantico } from '@/design-system/tokens/semantico'
import { getDb } from '@/modules/dominio/db/cliente'
import { entradasRealizadasDoDia } from '@/modules/entrega/gestao-realizadas'
import type { EntradaRealizada } from '@/modules/entrega/gestao-realizadas'
import { BANCA_PADRAO, planoDoDia } from '@/modules/entrega/gestao'
import type { EntradaDoPlano } from '@/modules/entrega/gestao'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import { avaliarAcesso } from '@/modules/plataforma/assinatura/direito'
import { sessaoAtual } from '@/modules/plataforma/auth/cookies'
import type { Atributo } from '@/modules/motor/tipos'
import { registrarEntrada } from './acoes'
import '@/design-system/tokens/tokens.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Gestão de banca' }

/** Bancas de atalho — evita digitar num teclado de celular durante a rodada. */
const ATALHOS = [200, 500, 1000, 5000] as const

const ATRIBUTO_ROTULO: Record<Atributo, string> = {
  PONTOS: 'PTS',
  REBOTES: 'REB',
  ASSISTENCIAS: 'AST',
}

const SOBRANCELHA_GESTAO = 'GESTÃO DE BANCA'

/**
 * Dicionário de `?erro=` — mesma correção de `conta/page.tsx` (achado da
 * revisão final): a ação redirecionava com a frase por extenso na própria
 * URL, e `/gestao?erro=<frase do atacante>` caía direto num `role="alert"`
 * desta tela. Um código fora daqui não vira alerta vazio: some.
 */
const TEXTO_DO_ERRO: Record<string, string> = {
  'entrada-invalida': 'Confira unidades e odd.',
}

function dinheiro(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function bancaDe(bruto: string | string[] | undefined): number {
  const texto = Array.isArray(bruto) ? bruto[0] : bruto
  const n = Number(texto)
  // Banca negativa ou zero quebraria toda a proporcionalidade; texto inválido
  // vira o padrão em vez de NaN atravessando a tela inteira.
  return Number.isFinite(n) && n > 0 ? n : BANCA_PADRAO
}

function Numero({ rotulo, valor, apoio }: { rotulo: string; valor: string; apoio?: string }) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 90,
        padding: '10px 12px',
        borderRadius: 10,
        background: semantico.superficie,
        border: `1px solid ${semantico.divisor}`,
      }}
    >
      <p style={{ margin: 0, fontSize: 11, color: semantico.textoSecundario }}>{rotulo}</p>
      <p style={{ margin: '2px 0 0', fontSize: 16, fontWeight: 800 }}>{valor}</p>
      {apoio && (
        <p style={{ margin: '2px 0 0', fontSize: 10, color: semantico.textoSecundario }}>{apoio}</p>
      )}
    </div>
  )
}

/**
 * UMA ENTRADA SUGERIDA — nível, valor sugerido, e o formulário do "Registrei".
 *
 * O `<Link>` e o `<form>` são IRMÃOS de propósito, nunca um dentro do outro:
 * um controle interativo (o `<form>` do "Registrei") dentro de uma âncora é
 * HTML inválido, e o clique no botão navegaria para o detalhe do apito em vez
 * de submeter o registro. O link continua ocupando a largura toda — quem está
 * decidindo quanto entrar precisa de um caminho para o "por que entrou" sem
 * voltar à lista e procurar o jogador de novo — só a faixa do formulário,
 * abaixo dele, é que não pertence a esse link.
 */
function LinhaSugerida({ item, entrada, hoje }: EntradaDoPlano & { hoje: string }) {
  const nivel = NIVEL_JOGADOR[item.nivelJogador]
  return (
    <div
      style={{
        borderRadius: 10,
        background: semantico.superficie,
        borderLeft: `3px solid ${nivel.cor}`,
      }}
    >
      <Link
        href={`/apito/${item.jogadorId}?atributo=${item.atributo}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: item.linha === null ? '10px 14px' : '10px 14px 6px',
          color: 'inherit',
          textDecoration: 'none',
        }}
      >
        <Avatar
          nome={item.nome}
          fotoUrl={item.fotoUrl}
          timeSigla={item.timeSigla}
          nivelApito={item.nivelApito}
          turbo={item.turbo}
          tamanho={36}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{item.nome}</div>
          <div style={{ fontSize: 12, color: semantico.textoSecundario }}>
            {item.timeSigla} · {ATRIBUTO_ROTULO[item.atributo]}
            {item.linha === null ? '' : ` ${item.linha}+`} · nível {item.nivelApito}
            {item.turbo ? ' · turbo' : ''}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>
            {entrada === null ? '—' : dinheiro(entrada.valor)}
          </div>
          <div style={{ fontSize: 11, color: semantico.textoSecundario }}>
            {entrada === null
              ? 'sem modelo'
              : `${entrada.unidades} unidade${entrada.unidades === 1 ? '' : 's'}${
                  entrada.limitadoPeloTeto ? ' · no teto' : ''
                }`}
          </div>
        </div>
      </Link>
      {item.linha !== null && (
        <form
          action={registrarEntrada}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 14px 10px 62px' }}
        >
          <input type="hidden" name="dataReferencia" value={hoje} />
          <input type="hidden" name="jogadorId" value={item.jogadorId} />
          <input type="hidden" name="atributo" value={item.atributo} />
          <input type="hidden" name="linha" value={item.linha} />
          <input
            type="number"
            name="unidades"
            step={0.5}
            min={0.5}
            defaultValue={1}
            aria-label="Unidades que você entrou"
            style={{
              width: 56,
              padding: '6px 8px',
              borderRadius: 8,
              fontSize: 13,
              color: semantico.textoPrimario,
              background: semantico.superficieElevada,
              border: `1px solid ${semantico.divisor}`,
            }}
          />
          {/* `min` espelha o que o Zod de `acoes.ts` já exige — sem ele, sem
              JavaScript (a restrição desta tela), uma odd abaixo de 1,01 só
              era recusada DEPOIS do redirect, e o campo de unidades já tinha
              esse cuidado. */}
          <input
            type="number"
            name="odd"
            step={0.01}
            min={1.01}
            placeholder="odd"
            aria-label="Odd que você conseguiu (opcional)"
            style={{
              width: 64,
              padding: '6px 8px',
              borderRadius: 8,
              fontSize: 13,
              color: semantico.textoPrimario,
              background: semantico.superficieElevada,
              border: `1px solid ${semantico.divisor}`,
            }}
          />
          <button
            type="submit"
            style={{
              padding: '6px 12px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              color: semantico.textoSobreCor,
              background: semantico.textoPrimario,
              border: 'none',
            }}
          >
            Registrei
          </button>
        </form>
      )}
    </div>
  )
}

/** UMA ENTRADA REALIZADA — o que o usuário digitou, nunca o que a NIP sugeriu. */
function LinhaRealizada({ e, fuso }: { e: EntradaRealizada; fuso: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 14px',
        borderRadius: 10,
        background: semantico.superficie,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{e.nome}</div>
        <div style={{ fontSize: 12, color: semantico.textoSecundario }}>
          {ATRIBUTO_ROTULO[e.atributo]} {e.linha}+ · {e.unidades} unidade
          {e.unidades === 1 ? '' : 's'} · odd {e.odd === null ? '—' : e.odd.toFixed(2)}
        </div>
      </div>
      <div style={{ fontSize: 11, color: semantico.textoSecundario, flexShrink: 0 }}>
        {horaCurta(e.registradaEm, fuso)}
      </div>
    </div>
  )
}

export default async function PaginaGestao({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  if (!process.env.DATABASE_URL) {
    return (
      <Moldura aba="gestao" largura="dados">
        <CabecalhoTela sobrancelha={SOBRANCELHA_GESTAO} titulo="PLANO DO DIA" />
        <p style={{ color: semantico.textoSecundario }}>Banco não configurado.</p>
      </Moldura>
    )
  }

  const sessao = await sessaoAtual()
  if (!sessao) redirect('/entrar?destino=/gestao')
  const acesso = await avaliarAcesso(getDb(), sessao.usuarioId)
  if (!acesso.permitido) redirect('/assinar')

  const params = await searchParams
  const banca = bancaDe(params.banca)
  // Por URL, não por estado de cliente: dá para linkar direto "o que eu
  // registrei hoje" e continua funcionando sem JavaScript.
  const ver = params.ver === 'realizadas' ? 'realizadas' : 'sugeridas'
  // A ação redireciona para cá com `?erro=` quando o Zod recusa (unidades,
  // odd ou linha fora do intervalo) — sem isto a recusa era muda: a pessoa
  // voltava para a mesma tela sem saber se o registro tinha ido ou não.
  const codigoDeErro = Array.isArray(params.erro) ? params.erro[0] : params.erro
  const mensagemDeErro = codigoDeErro ? TEXTO_DO_ERRO[codigoDeErro] : undefined
  const ruleset = await rulesetAtivo()
  const hoje = dataDeReferencia(new Date(), ruleset.rodada.fuso)
  const plano = await planoDoDia(getDb(), ruleset, hoje, banca)
  const seletorDeVisao = {
    rotulo: 'Visão',
    ativa: ver,
    opcoes: [
      { valor: 'sugeridas', rotulo: 'Sugeridas', href: '/gestao' },
      { valor: 'realizadas', rotulo: 'Realizadas', href: '/gestao?ver=realizadas' },
    ],
  }

  // O modelo de gestão (demonstração ou homologado) só afeta QUANTO sugerir —
  // a visão Realizadas é um registro do que o usuário digitou e não depende
  // dele, então só barra aqui quem está mesmo tentando ver Sugeridas.
  if (!plano.temModelo && ver === 'sugeridas') {
    return (
      <Moldura aba="gestao" largura="dados">
        <CabecalhoTela
          sobrancelha={SOBRANCELHA_GESTAO}
          titulo="PLANO DO DIA"
          seletor={seletorDeVisao}
        />
        {mensagemDeErro && (
          <p role="alert" style={{ margin: '0 0 16px', fontSize: 13, color: semantico.alerta }}>
            {mensagemDeErro}
          </p>
        )}
        <div
          style={{
            padding: '28px 16px',
            textAlign: 'center',
            border: `1px dashed ${semantico.divisor}`,
            borderRadius: 12,
          }}
        >
          <p style={{ margin: 0, fontWeight: 700 }}>Modelo de gestão ainda não definido</p>
          <p style={{ margin: '8px 0 0', fontSize: 14, color: semantico.textoSecundario }}>
            Esta aba passa a sugerir tamanho de entrada assim que o modelo de gestão NIP for
            carregado.
          </p>
        </div>
      </Moldura>
    )
  }

  const realizadas =
    ver === 'realizadas' ? await entradasRealizadasDoDia(getDb(), sessao.usuarioId, hoje) : []

  return (
    <Moldura aba="gestao" largura="dados">
      <CabecalhoTela
        sobrancelha={SOBRANCELHA_GESTAO}
        titulo="PLANO DO DIA"
        seletor={seletorDeVisao}
      />
      {mensagemDeErro && (
        <p role="alert" style={{ margin: '0 0 16px', fontSize: 13, color: semantico.alerta }}>
          {mensagemDeErro}
        </p>
      )}
      {ver === 'sugeridas' && (
        <>
          <p style={{ margin: '0 0 14px', fontSize: 13, color: semantico.textoSecundario }}>
            Quanto entrar em cada apito de hoje, proporcional ao nível do sinal.
          </p>

          {plano.origem === 'demonstracao' && (
            <div
              role="note"
              style={{
                padding: '10px 14px',
                borderRadius: 10,
                marginBottom: 16,
                border: `1px solid ${semantico.alerta}`,
                fontSize: 12,
                lineHeight: 1.6,
              }}
            >
              <strong>Modelo de demonstração.</strong> Os percentuais desta tela são um exemplo de
              proporcionalidade, não o modelo de gestão NIP — ele ainda não foi carregado. Não use
              como orientação financeira.
            </div>
          )}

          <section style={{ marginBottom: 16 }}>
            <p style={{ margin: '0 0 6px', fontSize: 11, color: semantico.textoSecundario }}>
              Sua banca
            </p>
            <nav aria-label="Valor da banca" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {ATALHOS.map((v) => {
                const ativo = v === banca
                return (
                  <Link
                    key={v}
                    href={`/gestao?banca=${v}`}
                    aria-current={ativo ? 'page' : undefined}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 999,
                      fontSize: 13,
                      fontWeight: ativo ? 700 : 500,
                      textDecoration: 'none',
                      color: ativo ? semantico.textoSobreCor : semantico.textoPrimario,
                      background: ativo ? semantico.textoPrimario : semantico.superficie,
                      border: `1px solid ${semantico.divisor}`,
                    }}
                  >
                    {dinheiro(v)}
                  </Link>
                )
              })}
            </nav>

            {/* GET puro: sem estado de cliente, sem JavaScript, e a banca fica na
                URL — o usuário pode salvar o link com a banca dele já escolhida. */}
            <form method="get" action="/gestao" style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <input
                type="number"
                name="banca"
                min={1}
                step={1}
                defaultValue={banca}
                aria-label="Outro valor de banca"
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: 8,
                  fontSize: 14,
                  color: semantico.textoPrimario,
                  background: semantico.superficie,
                  border: `1px solid ${semantico.divisor}`,
                }}
              />
              <button
                type="submit"
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  color: semantico.textoSobreCor,
                  background: semantico.textoPrimario,
                  border: 'none',
                }}
              >
                Aplicar
              </button>
            </form>
          </section>

          <section style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
            <Numero
              rotulo="1 unidade"
              valor={plano.unidade === null ? '—' : dinheiro(plano.unidade)}
              apoio={`${ruleset.gestao_banca?.unidade_percentual_banca}% da banca`}
            />
            <Numero
              rotulo="Teto por entrada"
              valor={plano.limites === null ? '—' : dinheiro(plano.limites.tetoPorEntrada)}
            />
            <Numero
              rotulo="Parar no lucro"
              valor={plano.limites === null ? '—' : `+${dinheiro(plano.limites.stopWin)}`}
            />
            <Numero
              rotulo="Parar no prejuízo"
              valor={plano.limites === null ? '—' : `−${dinheiro(plano.limites.stopLoss)}`}
            />
          </section>

          <h2 style={{ fontSize: 15, margin: '0 0 4px' }}>Entradas sugeridas para hoje</h2>
          <p style={{ margin: '0 0 12px', fontSize: 12, color: semantico.textoSecundario }}>
            {plano.entradas.length} apito{plano.entradas.length === 1 ? '' : 's'} na lista ·
            exposição total de {dinheiro(plano.totalExposto)} (
            {plano.banca === 0 ? '0' : ((plano.totalExposto / plano.banca) * 100).toFixed(1)}% da
            banca)
          </p>

          {plano.entradas.length === 0 ? (
            <p style={{ color: semantico.textoSecundario, fontSize: 14 }}>
              A lista de hoje ainda não foi publicada.{' '}
              <Link href="/" style={{ color: semantico.textoPrimario }}>
                Ver a Lista Secreta
              </Link>
            </p>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {plano.entradas.map(({ item, entrada }) => (
                <LinhaSugerida key={item.chave} item={item} entrada={entrada} hoje={hoje} />
              ))}
            </div>
          )}
        </>
      )}

      {ver === 'realizadas' && (
        <>
          <h2 style={{ fontSize: 15, margin: '0 0 4px' }}>Entradas registradas hoje</h2>
          <p style={{ margin: '0 0 12px', fontSize: 12, color: semantico.textoSecundario }}>
            O que você digitou ter feito — não o que a NIP sugeriu.
          </p>

          {realizadas.length === 0 ? (
            <p style={{ color: semantico.textoSecundario, fontSize: 14 }}>
              Nada registrado hoje. Registre pela visão{' '}
              <Link href="/gestao" style={{ color: semantico.textoPrimario }}>
                Sugeridas
              </Link>{' '}
              o que você fez fora daqui.
            </p>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {realizadas.map((e) => (
                <LinhaRealizada key={e.id} e={e} fuso={ruleset.rodada.fuso} />
              ))}
            </div>
          )}

          {/* A fronteira explícita que a spec pede (§5.5): registrar o que o
              usuário fez aproxima a tela de um caderno de apostas, e o produto
              continua sendo somente leitura — quem digitou foi o usuário, sobre
              algo que já aconteceu em outro lugar. */}
          <p
            role="note"
            style={{ marginTop: 16, fontSize: 12, color: semantico.textoSecundario, lineHeight: 1.6 }}
          >
            Somente leitura: a NIP não envia aposta nem sabe o que você apostou — só o que você
            registra.
          </p>
        </>
      )}

      <footer
        style={{
          marginTop: 24,
          paddingTop: 12,
          borderTop: `1px solid ${semantico.divisor}`,
          fontSize: 12,
          color: semantico.textoSecundario,
          lineHeight: 1.7,
        }}
      >
        A plataforma é somente leitura: nenhuma aposta é enviada, nenhuma conta de casa é vinculada
        e nenhum valor é movimentado. Os números acima são sugestão de tamanho, e a decisão é sempre
        sua.
      </footer>
    </Moldura>
  )
}
