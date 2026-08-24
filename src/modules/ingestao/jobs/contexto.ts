import { calendarioDoRuleset, temporadaDe } from '../../dominio/temporada'
import { rulesetAtivo } from '../../entrega/ruleset-ativo'
import { configDoAmbiente } from '../sincronizar/fonte'

export async function contextoDoJob(agora = new Date()) {
  const config = configDoAmbiente()
  if (!config) throw new Error('fontes NBA não configuradas')
  if (!config.habilitada) throw new Error('ingestão NBA desabilitada pelo kill switch')

  const ruleset = await rulesetAtivo()
  const configTemporada = calendarioDoRuleset(ruleset)
  return {
    agora,
    config,
    ruleset,
    configTemporada,
    temporada: temporadaDe(agora, configTemporada),
  }
}
