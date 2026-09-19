import Link from 'next/link'

import { AvatarUsuario, MarcaNip } from '@/design-system/componentes'
import { componente } from '@/design-system/tokens/componente'
import { semantico } from '@/design-system/tokens/semantico'

import { ABAS, type Aba } from './abas'
import { IconeAba } from './icones'

/** Quem está logado — só o que a barra precisa para desenhar o atalho da conta. */
export type ContaNaBarra = { email: string; nome?: string | null; fotoUrl?: string | null }

/**
 * BARRA DO TOPO — a navegação do desktop (identidade 05, decisão do parceiro:
 * desktop manda, celular colapsa).
 *
 * Da esquerda para a direita: a marca, as cinco pílulas e o atalho para a
 * conta. É a moldura do StatsHub, com as mesmas abas da barra inferior — a
 * lista é uma só (`abas.ts`), então renomear uma aba muda as duas.
 *
 * A marca ainda é TEXTO: o manual manda usar o arquivo de logo como imagem e
 * proíbe recriá-la em CSS, e o cliente não enviou o arquivo. Quando ele chegar,
 * é aqui e no login que ele entra.
 *
 * Quem decide se esta barra aparece é o CSS da `Moldura`, não esta função: as
 * duas barras saem no HTML e a media query esconde uma. Assim a moldura segue
 * sendo componente de servidor, sem `usePathname` nem medição de janela.
 */
export function BarraTopo({
  atual,
  conta,
}: {
  /**
   * A aba acesa. `null` nas telas que não são abas (detalhe do apito, time,
   * teoria): a barra EXISTE — o desktop tem navegação sempre —, nenhuma
   * pílula acende.
   */
  atual: Aba | null
  conta?: ContaNaBarra
}) {
  return (
    <nav
      aria-label="Seções do app (topo)"
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 24,
        padding: `0 ${componente.moldura.respiroDesktop}`,
        background: semantico.cromo,
        // O navy sobre o fundo dá 1,09: quem separa o cromo do conteúdo é esta
        // linha, não o contraste. É o que o StatsHub faz.
        borderBottom: `1px solid ${semantico.divisor}`,
      }}
    >
      <Link
        href="/"
        aria-label="Início"
        style={{ color: semantico.textoPrimario, textDecoration: 'none', flexShrink: 0 }}
      >
        <MarcaNip compacta />
      </Link>

      <div style={{ display: 'flex', gap: 4, minWidth: 0, overflowX: 'auto' }}>
        {ABAS.map((aba) => {
          const ativo = aba.id === atual
          return (
            <Link
              key={aba.id}
              href={aba.href}
              className={`pilula-nav${ativo ? ' pilula-nav-ativa' : ''}`}
              aria-current={ativo ? 'page' : undefined}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 14px',
                borderRadius: componente.pilulaNav.raio,
                textDecoration: 'none',
                whiteSpace: 'nowrap',
                fontFamily: semantico.fonteRotulo,
                fontSize: 12,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                fontWeight: 600,
                // A cor mora na classe `.pilula-nav` (globals.css): é o que dá
                // hover e foco à pílula. Aqui fica só a geometria.
              }}
            >
              <IconeAba aba={aba.id} ativo={ativo} />
              {aba.rotulo}
            </Link>
          )
        })}
      </div>

      {conta && (
        <Link href="/conta" aria-label="Sua conta" style={{ marginLeft: 'auto', flexShrink: 0 }}>
          <AvatarUsuario
            nome={conta.nome ?? null}
            email={conta.email}
            fotoUrl={conta.fotoUrl ?? null}
            tamanho={36}
          />
        </Link>
      )}
    </nav>
  )
}
