import { exigirAdmin } from '@/modules/plataforma/auth/cookies'
import { EstadoVazio } from '@/ui/blocos'
import { IconeAdmin } from '@/ui/icones'

/**
 * GUARDA DO PAINEL — peça única, chamada ANTES de qualquer leitura.
 *
 * No App Router a server action é um endpoint POST chamável direto: proteger
 * a página NÃO protege a ação. Toda ação repete a checagem por conta própria
 * (`comAdmin` / `atorAdmin` nos arquivos de ações).
 */
export async function negarSeNaoForAdmin(): Promise<React.ReactNode | null> {
  if (await exigirAdmin()) return null
  return <AcessoRestrito />
}

export function AcessoRestrito() {
  return (
    <div style={{ maxWidth: 640 }}>
      <EstadoVazio
        icone={<IconeAdmin />}
        titulo="Acesso restrito"
        texto="Este painel exige conta de administrador."
        acao={{ rotulo: 'Entrar como administrador', href: '/admin/entrar' }}
      />
    </div>
  )
}

export function BancoNaoConfigurado({ titulo }: { titulo: string }) {
  return (
    <div style={{ maxWidth: 640 }}>
      <EstadoVazio
        titulo={titulo}
        texto="Banco não configurado. Rode vercel env pull e npm run db:migrate."
      />
    </div>
  )
}

// O painel é operado do Brasil e não passa pelo ruleset — o fuso é só
// apresentação, não decide a que rodada nada pertence.
export const FUSO_ADMIN = 'America/Sao_Paulo'

export function dataHoraAdmin(quando: Date): string {
  return quando.toLocaleString('pt-BR', { timeZone: FUSO_ADMIN, dateStyle: 'short', timeStyle: 'short' })
}

export function diaAdmin(quando: Date): string {
  return quando.toLocaleDateString('pt-BR', { timeZone: FUSO_ADMIN })
}
