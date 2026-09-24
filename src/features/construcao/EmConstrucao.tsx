import { EstadoVazio } from '@/ui/blocos'
import { IconeConstrucao } from '@/ui/icones'
import s from './EmConstrucao.module.css'

/**
 * Seções que ainda não foram reconstruídas no v2. A navegação existe desde já
 * para o app ter a forma final; o conteúdo chega nas próximas entregas.
 */
export function EmConstrucao({ titulo, descricao }: { titulo: string; descricao: string }) {
  return (
    <div className={s.tela}>
      <h1 className={s.titulo}>{titulo}</h1>
      <EstadoVazio
        icone={<IconeConstrucao />}
        titulo="Em construção no novo NIP"
        texto={descricao}
        acao={{ rotulo: 'Voltar para Entradas', href: '/' }}
      />
    </div>
  )
}
