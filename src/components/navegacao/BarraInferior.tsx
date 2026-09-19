import Link from 'next/link'

import { componente } from '@/design-system/tokens/componente'
import { semantico } from '@/design-system/tokens/semantico'

import { ABAS, type Aba } from './abas'
import { IconeAba } from './icones'

/**
 * BARRA DE NAVEGAÇÃO DO CELULAR — as abas do produto, no rodapé.
 *
 * Até aqui cada tela era uma ilha ligada por links de rodapé: quem abria a
 * Lista Secreta não tinha como chegar ao Fire Live sem saber a URL.
 *
 * Identidade 05: ela veste o CROMO (navy) e se separa do conteúdo pela linha
 * divisória, não por contraste — o navy sobre o fundo dá 1,09. A aba ativa é
 * uma pílula PREENCHIDA no acento com texto branco, o mesmo estado que a barra
 * do topo usa no desktop. A partir de `larguraTopo` esta barra é escondida por
 * CSS (`Moldura.module.css`) e a do topo aparece: as duas saem no HTML, e quem
 * escolhe é a media query.
 *
 * A lista de abas mora em `abas.ts`, compartilhada com a barra do topo.
 *
 * Componente de servidor de propósito: a aba ativa vem por props de quem
 * renderiza, não de `usePathname`. Uma barra de navegação não justifica
 * embarcar JavaScript em todas as páginas do app.
 */
export function BarraInferior({ atual }: { atual: Aba }) {
  return (
    <nav
      aria-label="Seções do app"
      className="barra-inferior"
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 20,
        // O `display` NÃO vem aqui: estilo embutido vence media query, e é a
        // media query da Moldura que esconde esta barra no desktop. Ele mora
        // em `Moldura.module.css`, sob a classe global `barra-inferior`.
        background: semantico.cromo,
        borderTop: `1px solid ${semantico.divisor}`,
        // A barra invade a faixa do gesto de home do iPhone se não recuar.
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {ABAS.map((aba) => {
        const ativo = aba.id === atual
        return (
          <Link
            key={aba.id}
            href={aba.href}
            aria-current={ativo ? 'page' : undefined}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
              margin: '6px 2px',
              padding: '6px 4px',
              borderRadius: componente.pilulaNav.raio,
              textDecoration: 'none',
              fontFamily: semantico.fonteRotulo,
              // 12px é o piso do manual; os 11 de antes ficavam abaixo dele.
              fontSize: 12,
              // Uma linha, sempre: a 390 cada aba tem ~74px e "AO VIVO"
              // quebrava em duas, desalinhando os rótulos da fileira. O
              // tracking menor e o respiro menor compram a folga sem descer
              // do piso de 12.
              whiteSpace: 'nowrap',
              letterSpacing: '0.02em',
              textTransform: 'uppercase',
              fontWeight: 600,
              background: ativo ? componente.pilulaNav.fundoAtiva : 'transparent',
              color: ativo ? componente.pilulaNav.textoAtiva : componente.pilulaNav.textoInativa,
              // Redundância: a aba ativa não se distingue só pela cor — o
              // preenchimento, o peso da fonte e o `aria-current` acima já
              // marcam o estado.
            }}
          >
            <IconeAba aba={aba.id} ativo={ativo} />
            {aba.rotulo}
          </Link>
        )
      })}
    </nav>
  )
}
