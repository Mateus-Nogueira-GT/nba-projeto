import { rotaDaComparacao } from '@/modules/entrega/estatisticas/rotas'
import { BotaoSecundario } from '@/ui/blocos'

/** Ao lado de "Acompanhar": abre a escolha do segundo, já com este lado A. */
export function BotaoComparar({
  tipo,
  id,
  temporada,
}: {
  tipo: 'jogador' | 'time'
  id: string
  temporada?: string
}) {
  return (
    <BotaoSecundario href={rotaDaComparacao(tipo, id, undefined, temporada ? { temporada } : undefined)}>
      Comparar
    </BotaoSecundario>
  )
}
