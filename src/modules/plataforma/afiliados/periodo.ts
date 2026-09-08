import { intervaloDoDia } from '@/modules/dominio/rodada'

const FUSO_COMERCIAL = 'America/Sao_Paulo'
const DATA = /^\d{4}-\d{2}-\d{2}$/

export function filtroDePeriodo(inicio: string | undefined, fim: string | undefined) {
  if (!inicio && !fim) return {}
  if (!inicio || !fim || !DATA.test(inicio) || !DATA.test(fim) || inicio > fim) {
    throw new Error('Período inválido')
  }
  return {
    inicio: intervaloDoDia(inicio, FUSO_COMERCIAL).inicio,
    fim: intervaloDoDia(fim, FUSO_COMERCIAL).fim,
  }
}
