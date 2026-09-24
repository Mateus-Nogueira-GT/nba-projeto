import {
  IconeAdmin,
  IconeAoVivo,
  IconeEntradas,
  IconeGestao,
  IconeMetodologia,
  IconePerfil,
  IconeResultados,
  IconeStats,
} from '@/ui/icones'
import type { Secao } from './secoes'

export function IconeDaSecao({ secao, tamanho }: { secao: Secao; tamanho?: number }) {
  switch (secao) {
    case 'entradas':
      return <IconeEntradas tamanho={tamanho} />
    case 'ao-vivo':
      return <IconeAoVivo tamanho={tamanho} />
    case 'estatisticas':
      return <IconeStats tamanho={tamanho} />
    case 'gestao':
      return <IconeGestao tamanho={tamanho} />
    case 'resultados':
      return <IconeResultados tamanho={tamanho} />
    case 'metodologia':
      return <IconeMetodologia tamanho={tamanho} />
    case 'perfil':
      return <IconePerfil tamanho={tamanho} />
    case 'admin':
      return <IconeAdmin tamanho={tamanho} />
  }
}
