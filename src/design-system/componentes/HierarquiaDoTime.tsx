import type { Nivel } from '../../modules/motor/tipos'
import { componente } from '../tokens/componente'
import { NIVEL_JOGADOR } from '../tokens/css'
import { semantico } from '../tokens/semantico'

/** Uma posição da lista do CJ no atributo, e se o jogador está fora do jogo. */
export type LinhaDaHierarquia = {
  /** 1..N dentro do time, como o CJ ordenou. */
  posicao: number
  jogadorId: string
  nome: string
  /** Nível do JOGADOR naquele atributo — a faixa metálica da linha. */
  nivel: Nivel
  fora: boolean
}

export type HierarquiaDoTimeProps = {
  linhas: readonly LinhaDaHierarquia[]
  /** Rota do perfil. Ausente (galeria), a lista não navega — e não abre âncora morta. */
  hrefDoJogador?: (jogadorId: string) => string
  /** O que escrever quando a lista do CJ não cobre este atributo. */
  vazio?: string
}

/**
 * A HIERARQUIA DO CJ — o *depth chart* com a regra do CJ em cima.
 *
 * O canal visual é o mesmo do card: faixa metálica = nível do JOGADOR naquele
 * atributo. O que este componente acrescenta é o PREFIXO desfalcado — as
 * posições iniciais consecutivas com `fora` — em borda e tinta do ao vivo.
 *
 * O destaque é do prefixo, e só dele, porque é só ele que abre a OPD: se o nº
 * 2 falta e o nº 1 joga, não há apito. Um desfalque solto lá embaixo continua
 * escrito ("FORA"), sem o destaque — dar a ele a mesma moldura seria desenhar
 * uma oportunidade que a estratégia não reconhece.
 *
 * Puro de propósito: quem calcula `fora` é a leitura (`hierarquiaDoTime`), a
 * partir de `lesoes_escalacao` do jogo do dia. Aqui só se desenha.
 */
export function HierarquiaDoTime({ linhas, hrefDoJogador, vazio }: HierarquiaDoTimeProps) {
  if (linhas.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: 13, color: semantico.textoSecundario }}>
        {vazio ?? 'A curadoria NIP ainda não tem hierarquia neste atributo.'}
      </p>
    )
  }

  const ordenadas = [...linhas].sort((a, b) => a.posicao - b.posicao)
  // O prefixo é a corrida inicial de ausências. Para na primeira presença.
  let prefixo = 0
  while (prefixo < ordenadas.length && ordenadas[prefixo]!.fora) prefixo += 1

  return (
    <>
      <ol role="list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {ordenadas.map((linha, indice) => {
          const nivel = NIVEL_JOGADOR[linha.nivel]
          const destaque = indice < prefixo
          const rotulo = `nº ${linha.posicao} ${linha.nome} · ${nivel.rotulo}${
            linha.fora ? ' · fora' : ''
          }`

          return (
            <li
              key={linha.jogadorId}
              role="listitem"
              aria-label={rotulo}
              style={{
                display: 'grid',
                gridTemplateColumns: `${componente.faixaNivelAltura} 24px 1fr auto`,
                alignItems: 'center',
                gap: 10,
                padding: '8px 10px',
                borderRadius: 10,
                border: `1px solid ${destaque ? semantico.aoVivoBorda : 'transparent'}`,
                borderBottom: `1px solid ${
                  destaque ? semantico.aoVivoBorda : semantico.divisorSuave
                }`,
                background: destaque ? semantico.aoVivoTinta : 'transparent',
              }}
            >
              {/* Canal 1, o mesmo do card: a faixa é o nível do jogador. */}
              <span
                aria-hidden
                style={{
                  width: componente.faixaNivelAltura,
                  height: 22,
                  borderRadius: 2,
                  background: nivel.cor,
                }}
              />
              <span
                aria-hidden
                style={{
                  fontFamily: semantico.fonteTitulo,
                  fontSize: 18,
                  letterSpacing: 0.5,
                  fontVariantNumeric: 'tabular-nums',
                  textAlign: 'right',
                  color: destaque ? semantico.aoVivoSolido : semantico.texto70,
                }}
              >
                {linha.posicao}
              </span>
              <span style={{ minWidth: 0 }}>
                <span
                  style={{
                    display: 'block',
                    fontFamily: semantico.fonteRotulo,
                    fontSize: 14,
                    fontWeight: 600,
                    letterSpacing: 0.6,
                    color: semantico.texto100,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {hrefDoJogador ? (
                    <a
                      href={hrefDoJogador(linha.jogadorId)}
                      style={{ color: 'inherit', textDecoration: 'none' }}
                    >
                      {linha.nome}
                    </a>
                  ) : (
                    linha.nome
                  )}
                </span>
                <span
                  style={{
                    display: 'block',
                    fontFamily: semantico.fonteRotulo,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: 1.2,
                    textTransform: 'uppercase',
                    color: nivel.cor,
                  }}
                >
                  {nivel.rotulo}
                </span>
              </span>
              {linha.fora && (
                <span
                  style={{
                    fontFamily: semantico.fonteRotulo,
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: 1.2,
                    padding: '2px 8px',
                    borderRadius: 6,
                    whiteSpace: 'nowrap',
                    color: destaque ? semantico.aoVivoSolido : semantico.texto55,
                    border: `1px solid ${destaque ? semantico.aoVivoBorda : semantico.divisor}`,
                  }}
                >
                  FORA
                </span>
              )}
            </li>
          )
        })}
      </ol>
      {/* A OPD em uma linha, no vocabulário do CJ e sem número de regra. */}
      <p
        style={{
          margin: '10px 0 0',
          fontFamily: semantico.fonteCorpo,
          fontSize: 12,
          lineHeight: 1.5,
          color: semantico.texto55,
        }}
      >
        O desfalque só abre oportunidade quando começa no topo: se o nº 2 falta e o nº 1 joga, não
        há apito.
      </p>
    </>
  )
}
