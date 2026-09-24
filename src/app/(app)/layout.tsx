import type { ReactNode } from 'react'
import { cookies } from 'next/headers'
import { sessaoAtual } from '@/modules/plataforma/auth/cookies'
import { getDb } from '@/modules/dominio/db/cliente'
import { configuracaoChat } from '@/modules/entrega/chat-limites'
import { avaliarAcesso } from '@/modules/plataforma/assinatura/direito'
import { atende } from '@/modules/plataforma/assinatura/nivel-do-plano'
import { Assistente } from '@/features/assistente/Assistente'
import { BarraInferior, Sidebar } from '@/features/shell/Navegacao'
import { PainelPwa } from '@/features/pwa/PainelPwa'
import { Topo } from '@/features/shell/Topo'
import { COOKIE_SIDEBAR } from '@/features/shell/secoes'
import { COOKIE_TEMA, temaDoCookie } from '@/features/shell/tema'
import { identidadeDoUsuario } from '@/features/conta/carregar'
import s from '@/features/shell/Shell.module.css'

/**
 * O esqueleto de todas as telas logadas: sidebar, topo, faixa de aviso,
 * conteúdo e — no slot `painel` — a coluna de detalhe à direita.
 *
 * A casca NÃO é portão. Ela só LÊ a sessão para desenhar o menu; quem barra é
 * cada tela, com `exigirNivel`. Chamar o guarda aqui faria laço: sem o aceite
 * da metodologia ele redireciona para `/metodologia`, que mora dentro desta
 * mesma casca (teste: `features/shell/__tests__/layout-do-app.test.tsx`).
 *
 * `cookies()` aqui torna dinâmicas só as rotas de `(app)` — que já eram todas
 * dinâmicas (sessão). O layout RAIZ continua estático.
 */
export default async function LayoutDoApp({
  children,
  painel,
}: {
  children: ReactNode
  painel: ReactNode
}) {
  const [sessao, jar] = await Promise.all([sessaoAtual(), cookies()])
  const admin = sessao?.papel === 'ADMIN'
  // Acesso e identidade não dependem um do outro: em paralelo. O acesso vem do
  // `cache()` por requisição — a tela que a casca envolve pergunta o mesmo.
  // O avatar do topo é o que a pessoa ESCOLHEU em /conta, não a inicial do
  // e-mail: a escolha some do app inteiro se a barra não a mostrar.
  const [acesso, usuario] = sessao
    ? await Promise.all([
        avaliarAcesso(getDb(), sessao.usuarioId),
        identidadeDoUsuario(sessao.usuarioId, sessao.email),
      ])
    : [null, null]
  // O assistente é do MVP para cima E só com o chat ligado: com a flag
  // desligada (ou uma cota vazia) a rota `/api/chat` responde "fora do ar", e
  // um botão que só sabe dizer isso não vai para a tela — a mesma regra da
  // Moldura antiga (`chat-botao.test.ts`).
  const assistente =
    configuracaoChat().habilitado && acesso?.nivel != null && atende(acesso.nivel, 'MVP')
  const recolhida = jar.get(COOKIE_SIDEBAR)?.value === '1'
  const tema = temaDoCookie(jar.get(COOKIE_TEMA)?.value)

  return (
    <div className={s.app} data-app data-recolhida={recolhida}>
      <Sidebar admin={admin} assistente={assistente} />
      <div className={s.principal}>
        <Topo tema={tema} email={sessao?.email ?? ''} nome={usuario?.nome ?? null} fotoUrl={usuario?.fotoUrl ?? null} />
        {/* A faixa de demonstração vive no layout RAIZ (vale para as públicas
            também). Aqui em cima fica só o aviso de versão nova do PWA. */}
        <PainelPwa />
        <div className={s.conteudo}>
          <main className={s.miolo} id="conteudo">
            {children}
          </main>
          {painel}
        </div>
      </div>
      <BarraInferior admin={admin} assistente={assistente} />
      {assistente && <Assistente />}
    </div>
  )
}
