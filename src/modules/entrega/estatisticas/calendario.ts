import { somarDias } from '../../dominio/rodada'

/**
 * A DATA QUE A ABA ESTÁ MOSTRANDO.
 *
 * A URL é digitável, então `?data=` chega com qualquer coisa. Nada aqui pode
 * lançar: um 500 por curiosidade do usuário é pior que mostrar o dia de hoje.
 */

const FORMATO = /^\d{4}-\d{2}-\d{2}$/

export function dataValidaOuHoje(bruta: string | undefined, hoje: string): string {
  if (bruta === undefined || !FORMATO.test(bruta)) return hoje

  // A regex aceita 2026-02-31; o calendário não. `Date` normaliza a data
  // impossível para outra válida, então comparar de volta é o que denuncia.
  const data = new Date(`${bruta}T12:00:00.000Z`)
  if (Number.isNaN(data.getTime())) return hoje
  return data.toISOString().slice(0, 10) === bruta ? bruta : hoje
}

export function navegacaoDeDatas(data: string): {
  anterior: string
  seguinte: string
  hoje: string
} {
  return { anterior: somarDias(data, -1), seguinte: somarDias(data, 1), hoje: data }
}
