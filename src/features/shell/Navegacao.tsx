'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Folha } from '@/ui/Folha'
import { Logo } from '@/ui/Logo'
import { IconeAssistente, IconeMais, IconeRecolher } from '@/ui/icones'
import { abrirAssistente } from '@/features/assistente/evento'
import { IconeDaSecao } from './icone-da-secao'
import { COOKIE_SIDEBAR, NAVEGACAO, secaoDoCaminho, type ItemDeNavegacao } from './secoes'
import s from './Shell.module.css'

function visiveis(admin: boolean): ItemDeNavegacao[] {
  return NAVEGACAO.filter((i) => !i.soAdmin || admin)
}

function Item({ item, ativo }: { item: ItemDeNavegacao; ativo: boolean }) {
  return (
    <li>
      <Link
        href={item.href}
        className={s.item}
        aria-current={ativo ? 'page' : undefined}
        title={item.rotulo}
      >
        <IconeDaSecao secao={item.id} />
        <span className={s.itemRotulo}>{item.rotulo}</span>
      </Link>
    </li>
  )
}

/** Sidebar do desktop. Recolher grava cookie, para o servidor já desenhar certo. */
/** O assistente não é uma página: o item abre a gaveta de conversa. */
function ItemAssistente() {
  return (
    <li>
      <button type="button" className={s.item} onClick={() => abrirAssistente()} title="Sixth Man AI">
        <IconeAssistente />
        <span className={s.itemRotulo}>Sixth Man AI</span>
        <span className={s.novo}>IA</span>
      </button>
    </li>
  )
}

export function Sidebar({ admin, assistente }: { admin: boolean; assistente: boolean }) {
  const secao = secaoDoCaminho(usePathname())
  const itens = visiveis(admin)
  return (
    <aside className={s.sidebar}>
      <Link href="/" className={s.marca}>
        <Logo largura={200} prioridade />
      </Link>
      <nav aria-label="Seções" className={s.navSidebar}>
        <ul className={s.lista}>
          {itens
            .filter((i) => i.grupo === 'principal')
            .map((i) => (
              <Item key={i.id} item={i} ativo={i.id === secao} />
            ))}
          {assistente && <ItemAssistente />}
        </ul>
        <ul className={`${s.lista} ${s.rodape}`}>
          {itens
            .filter((i) => i.grupo === 'rodape')
            .map((i) => (
              <Item key={i.id} item={i} ativo={i.id === secao} />
            ))}
        </ul>
      </nav>
      {/* Aviso de jogo responsável — o padrão das plataformas brasileiras
          (Flashscore BR: "18+ · Aposta não é investimento"). */}
      <p className={s.responsavel}>
        <strong>18+</strong> Aposte com responsabilidade. Aposta não é investimento.
      </p>
    </aside>
  )
}

export function BotaoRecolher() {
  return (
    <button
      type="button"
      className={s.botaoIcone}
      aria-label="Recolher ou expandir o menu"
      onClick={() => {
        const app = document.querySelector<HTMLElement>('[data-app]')
        if (!app) return
        const recolhida = app.dataset.recolhida !== 'true'
        app.dataset.recolhida = String(recolhida)
        document.cookie = `${COOKIE_SIDEBAR}=${recolhida ? '1' : '0'}; path=/; max-age=31536000; samesite=lax`
      }}
    >
      <IconeRecolher />
    </button>
  )
}

/** Barra inferior do celular: quatro seções + "Mais". */
export function BarraInferior({ admin, assistente }: { admin: boolean; assistente: boolean }) {
  const secao = secaoDoCaminho(usePathname())
  const itens = visiveis(admin)
  const naBarra = itens.filter((i) => i.naBarra)
  const noMais = itens.filter((i) => !i.naBarra)
  const maisAtivo = noMais.some((i) => i.id === secao)
  return (
    <nav className={s.barraInferior} aria-label="Seções">
      {naBarra.map((i) => (
        <Link key={i.id} href={i.href} className={s.aba} aria-current={i.id === secao ? 'page' : undefined}>
          <IconeDaSecao secao={i.id} tamanho={22} />
          <span>{i.rotuloCurto}</span>
        </Link>
      ))}
      <Folha
        titulo="Mais"
        gatilhoClasse={s.aba}
        gatilho={
          <>
            <IconeMais tamanho={22} />
            <span data-ativo={maisAtivo}>Mais</span>
          </>
        }
      >
        <ul className={s.listaMais}>
          {assistente && (
            <li>
              <button type="button" className={s.itemMais} onClick={() => abrirAssistente()}>
                <IconeAssistente />
                Sixth Man AI
              </button>
            </li>
          )}
          {noMais.map((i) => (
            <li key={i.id}>
              <Link href={i.href} className={s.itemMais} aria-current={i.id === secao ? 'page' : undefined}>
                <IconeDaSecao secao={i.id} />
                {i.rotulo}
              </Link>
            </li>
          ))}
        </ul>
      </Folha>
    </nav>
  )
}
