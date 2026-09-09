import Link from 'next/link'
import { redirect } from 'next/navigation'

import { CabecalhoTela, Moldura } from '@/components/navegacao'
import { dataDeReferencia } from '@/modules/dominio/rodada'
import { NIVEL_JOGADOR } from '@/design-system/tokens/css'
import { Avatar } from '@/design-system/componentes'
import { semantico } from '@/design-system/tokens/semantico'
import { getDb } from '@/modules/dominio/db/cliente'
import { BANCA_PADRAO, planoDoDia } from '@/modules/entrega/gestao'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import { avaliarAcesso } from '@/modules/plataforma/assinatura/direito'
import { sessaoAtual } from '@/modules/plataforma/auth/cookies'
import type { Atributo } from '@/modules/motor/tipos'
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

export default async function PaginaGestao({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  if (!process.env.DATABASE_URL) {
    return (
      <Moldura aba="gestao">
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
  const ruleset = await rulesetAtivo()
  const hoje = dataDeReferencia(new Date(), ruleset.rodada.fuso)
  const plano = await planoDoDia(getDb(), ruleset, hoje, banca)

  if (!plano.temModelo) {
    return (
      <Moldura aba="gestao">
        <CabecalhoTela sobrancelha={SOBRANCELHA_GESTAO} titulo="PLANO DO DIA" />
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

  return (
    <Moldura aba="gestao">
      <CabecalhoTela sobrancelha={SOBRANCELHA_GESTAO} titulo="PLANO DO DIA" />
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
          proporcionalidade, não o modelo de gestão NIP — ele ainda não foi carregado. Não use como
          orientação financeira.
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
        {plano.entradas.length} apito{plano.entradas.length === 1 ? '' : 's'} na lista · exposição
        total de {dinheiro(plano.totalExposto)} (
        {plano.banca === 0 ? '0' : ((plano.totalExposto / plano.banca) * 100).toFixed(1)}% da banca)
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
          {plano.entradas.map(({ item, entrada }) => {
            const nivel = NIVEL_JOGADOR[item.nivelJogador]
            return (
              // A linha inteira é o alvo do toque: quem está decidindo
              // quanto entrar precisa de um caminho para o "por que entrou"
              // sem voltar à lista e procurar o jogador de novo.
              <Link
                key={item.chave}
                href={`/apito/${item.jogadorId}?atributo=${item.atributo}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 14px',
                  borderRadius: 10,
                  background: semantico.superficie,
                  borderLeft: `3px solid ${nivel.cor}`,
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
            )
          })}
        </div>
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
