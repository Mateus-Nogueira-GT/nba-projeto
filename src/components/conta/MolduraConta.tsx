import type { ReactNode } from 'react'
import Link from 'next/link'

import { BarraInferior, BarraTopo, type Aba } from '@/components/navegacao'
import { componente } from '@/design-system/tokens/componente'
import { semantico } from '@/design-system/tokens/semantico'

import estilos from './MolduraConta.module.css'

export function MolduraConta({
  titulo,
  descricao,
  aba = null,
  largura = 560,
  autenticado = false,
  children,
}: {
  titulo: string
  descricao?: string
  /**
   * A coluna. 560 é a de LEITURA e serve a formulário e a texto; a tela de
   * planos pede mais, porque três planos lado a lado são uma COMPARAÇÃO e
   * empilhados a 560 viram uma lista que se lê de cima a baixo (auditoria de
   * UX para web, §4.2).
   */
  largura?: number
  /**
   * Aba do rodapé. `null` nas telas de entrada e cadastro: quem ainda não fez
   * login não tem para onde navegar, e uma barra com quatro destinos que
   * redirecionam de volta para o login é ruído.
   */
  aba?: Aba | null
  /**
   * A pessoa já entrou? Decide a barra do TOPO, que é do desktop.
   *
   * `/assinar` e o retorno do checkout são de quem ESTÁ logado e ficavam sem
   * marca e sem navegação a partir de 1024 — o mesmo defeito que a auditoria
   * de 19/09 corrigiu na `Moldura` (§4.8), nesta moldura que ela não cobria.
   *
   * `/entrar` e `/cadastrar` NÃO recebem: cinco pílulas que redirecionam todas
   * de volta para o login são ruído, que é o mesmo argumento pelo qual a barra
   * inferior já não aparece ali.
   *
   * Vem separado de `aba` porque o retorno do checkout é logado e não é aba
   * nenhuma — `aba !== null` deixaria justamente ele de fora.
   */
  autenticado?: boolean
  /**
   * OPCIONAL no tipo, como em `FolhaDeFiltros`: `createElement(C, props, filhos)`
   * só satisfaz um `children` obrigatório se ele for repetido dentro da props —
   * e passar filho por props é justamente o que o lint proíbe. Na prática a
   * moldura sempre recebe conteúdo.
   */
  children?: ReactNode
}) {
  return (
    <main
      style={{
        minHeight: '100vh',
        background: componente.fundoTela,
        color: semantico.textoPrimario,
        fontFamily: semantico.fonteCorpo,
      }}
    >
      {autenticado && (
        <div className={estilos.topo}>
          <BarraTopo atual={aba} />
        </div>
      )}
      <div
        style={{
          padding: aba === null ? '40px 18px' : '40px 18px 96px',
          width: '100%',
          maxWidth: largura,
          margin: '0 auto',
        }}
      >
        <Link href="/" style={{ color: semantico.textoSecundario, fontSize: 13 }}>
          ← NIP
        </Link>
        <header style={{ margin: '20px 0' }}>
          <h1
            style={{
              margin: 0,
              fontSize: 26,
              fontFamily: semantico.fonteTitulo,
              letterSpacing: 0.5,
              textTransform: 'uppercase',
            }}
          >
            {titulo}
          </h1>
          {descricao && (
            <p style={{ margin: '8px 0 0', color: semantico.textoSecundario, lineHeight: 1.55 }}>
              {descricao}
            </p>
          )}
        </header>
        <section
          style={{
            border: `1px solid ${semantico.divisor}`,
            background: componente.contextoFrio.cardGradiente,
            borderRadius: 16,
            padding: 20,
          }}
        >
          {children}
        </section>
      </div>
      {aba !== null && <BarraInferior atual={aba} />}
    </main>
  )
}
