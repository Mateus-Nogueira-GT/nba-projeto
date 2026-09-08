import Link from 'next/link'

import { IdentidadeTime } from '@/design-system/componentes'
import type { GrupoFireLive } from '@/modules/entrega/fire-live/leitura'

import estilos from './SeletorJogosAoVivo.module.css'

function resumoDoJogo(grupo: GrupoFireLive): { principal: string; estado: string } {
  if (grupo.estado === 'AGUARDANDO') {
    return { principal: '×', estado: 'Aguardando' }
  }
  const placar =
    grupo.placarVisitante === null || grupo.placarCasa === null
      ? '— · —'
      : `${grupo.placarVisitante} · ${grupo.placarCasa}`
  return {
    principal: placar,
    estado: grupo.estado === 'EM_1Q' ? '1º Q ao vivo' : 'Fim 1º Q',
  }
}

export function SeletorJogosAoVivo({
  grupos,
  jogoAtivo,
  rotaDoJogo,
}: {
  grupos: readonly GrupoFireLive[]
  jogoAtivo: string | null
  rotaDoJogo: (jogoId: string) => string
}) {
  if (grupos.length === 0) return null

  return (
    <nav className={estilos.seletor} aria-label="Escolher jogo do Fire Live">
      {grupos.map((grupo) => {
        const ativo = grupo.jogoId === jogoAtivo
        const resumo = resumoDoJogo(grupo)
        return (
          <Link
            key={grupo.jogoId}
            href={rotaDoJogo(grupo.jogoId)}
            aria-current={ativo ? 'page' : undefined}
            className={`${estilos.jogo} ${ativo ? estilos.jogoAtivo : ''}`}
          >
            <IdentidadeTime
              sigla={grupo.visitanteSigla}
              tamanhoLogo={26}
              disposicao="coluna"
              alinhamento="inicio"
              style={{ fontSize: 10 }}
            />
            <span className={estilos.centro}>
              <span className={estilos.placar}>{resumo.principal}</span>
              <span className={estilos.estado}>{resumo.estado}</span>
            </span>
            <IdentidadeTime
              sigla={grupo.casaSigla}
              tamanhoLogo={26}
              disposicao="coluna"
              alinhamento="fim"
              style={{ fontSize: 10 }}
            />
          </Link>
        )
      })}
    </nav>
  )
}

export const classePainelJogoFixo = estilos.painelFixo
