import { exigirAdmin } from '@/modules/plataforma/auth/cookies'

/**
 * GUARDA DO PAINEL.
 *
 * Existe como peça única porque o bloco copiado em cada página é exatamente
 * como /admin/mapeamento ficou aberto: a tela de curadoria do `mapa_jogadores`
 * — de que a Lista Secreta inteira depende — renderizava e ESCREVIA sem
 * checagem nenhuma.
 *
 * Atenção: no App Router a server action é um endpoint POST chamável direto.
 * Proteger a página NÃO protege a ação. Toda ação repete a checagem por conta
 * própria; ver `comAdmin` em admin/usuarios/acoes.ts.
 */
export async function negarSeNaoForAdmin(): Promise<React.ReactNode | null> {
  if (await exigirAdmin()) return null

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui' }}>
      <h1>Acesso restrito</h1>
      <p>
        Este painel exige conta de administrador. <a href="/admin/entrar">Entrar</a>
      </p>
    </main>
  )
}
