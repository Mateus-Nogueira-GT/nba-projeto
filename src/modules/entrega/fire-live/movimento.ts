import type { AtributoAlerta } from '../../plataforma/experiencia/contrato'

export type AlvoNoSnapshotAoVivo = {
  chave: string
  jogadorId: string
  atributo: AtributoAlerta
  observado: number
  alvo: number | null
  modoFire: boolean
  apitadoEm: string
}

export type SnapshotJogoAoVivo = {
  jogoId: string
  placarCasa: number | null
  placarVisitante: number | null
  alvos: readonly AlvoNoSnapshotAoVivo[]
}

export type MudancasAoVivo = {
  placarSubiu: boolean
  progresso: { chave: string; diferenca: number; atributo: AtributoAlerta }[]
  alvosBatidos: string[]
  modoFire: string[]
  novosApitos: AlvoNoSnapshotAoVivo[]
}

/** Compara fatos observados; correção para baixo nunca vira celebração. */
export function compararSnapshotsAoVivo(
  anterior: SnapshotJogoAoVivo,
  atual: SnapshotJogoAoVivo,
): MudancasAoVivo {
  if (anterior.jogoId !== atual.jogoId) {
    return { placarSubiu: false, progresso: [], alvosBatidos: [], modoFire: [], novosApitos: [] }
  }

  const anteriores = new Map(anterior.alvos.map((alvo) => [alvo.chave, alvo] as const))
  const progresso: MudancasAoVivo['progresso'] = []
  const alvosBatidos: string[] = []
  const modoFire: string[] = []
  const novosApitos: AlvoNoSnapshotAoVivo[] = []

  for (const alvo of atual.alvos) {
    const antes = anteriores.get(alvo.chave)
    if (!antes) {
      novosApitos.push(alvo)
      if (alvo.alvo !== null && alvo.alvo > 0 && alvo.observado >= alvo.alvo) {
        alvosBatidos.push(alvo.chave)
      }
      if (alvo.modoFire) modoFire.push(alvo.chave)
      continue
    }
    if (alvo.observado > antes.observado) {
      progresso.push({
        chave: alvo.chave,
        diferenca: alvo.observado - antes.observado,
        atributo: alvo.atributo,
      })
    }
    if (
      alvo.alvo !== null &&
      alvo.alvo > 0 &&
      alvo.observado >= alvo.alvo &&
      (antes.alvo === null || antes.alvo <= 0 || antes.observado < antes.alvo)
    ) {
      alvosBatidos.push(alvo.chave)
    }
    if (alvo.modoFire && !antes.modoFire) modoFire.push(alvo.chave)
  }

  const subiu = (antes: number | null, agora: number | null) =>
    antes !== null && agora !== null && agora > antes

  return {
    placarSubiu:
      subiu(anterior.placarCasa, atual.placarCasa) ||
      subiu(anterior.placarVisitante, atual.placarVisitante),
    progresso,
    alvosBatidos,
    modoFire,
    novosApitos,
  }
}
