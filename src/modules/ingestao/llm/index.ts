import { LLMFake } from './fake'
import { OpenRouter } from './openrouter'
import type { PortaLLM } from './porta'

export { LLMFake } from './fake'
export { OpenRouter } from './openrouter'
export { validarTexto, type ResultadoValidacao } from './validador'
export { PALAVRAS_PROIBIDAS, regrasDoTexto } from './regras-do-texto'
export * from './porta'
export { PERFIS, modelosDoPerfil, parametrosDoPerfil } from './perfis'

/**
 * Sem `OPENROUTER_API_KEY`, o app inteiro funciona com o adapter FAKE.
 *
 * Não é conveniência de teste: é o que permite a demonstração rodar sem
 * credencial e o produto degradar em vez de quebrar se a chave sumir do
 * painel. Chave em branco conta como ausente — string vazia num painel de env
 * é o acidente mais comum, e tratá-la como válida daria 401 em produção.
 */
export function portaLLMDoAmbiente(ambiente: NodeJS.ProcessEnv = process.env): PortaLLM {
  const chave = (ambiente.OPENROUTER_API_KEY ?? '').trim()
  return chave === '' ? new LLMFake() : new OpenRouter(chave)
}
