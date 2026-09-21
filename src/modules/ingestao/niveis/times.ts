import { normalizarTexto } from '../../dominio/texto'

/**
 * Nomes informais da lista do CJ -> sigla canônica.
 *
 * A lista é escrita à mão, com grafia livre e apelidos: "Knicks", "Bucks",
 * "Indiana Peacers", "Portland  blazers", "Golden  State Warriors". Este mapa
 * é curadoria, não dado de provedor.
 */
const MAPA: Record<string, string> = {
  knicks: 'NYK',
  'new york knicks': 'NYK',
  'san antonio spurs': 'SAS',
  'san antonio spours': 'SAS',
  'oklahoma city thunder': 'OKC',
  'cleveland cavaliers': 'CLE',
  'detroit pistons': 'DET',
  'denver nugget': 'DEN',
  'denver nuggets': 'DEN',
  'minnesota timberwolves': 'MIN',
  lakers: 'LAL',
  'los angeles lakers': 'LAL',
  'philadelphia sixers': 'PHI',
  'phoenix suns': 'PHX',
  'phenix suns': 'PHX',
  'charlotte hornet': 'CHA',
  'charlotte hornets': 'CHA',
  dallas: 'DAL',
  'dallas mavericks': 'DAL',
  'golden state': 'GSW',
  'golden state warriors': 'GSW',
  'toronto raptors': 'TOR',
  'boston celtics': 'BOS',
  'houston rocket': 'HOU',
  'houston rockets': 'HOU',
  'orlando magic': 'ORL',
  'portland blazers': 'POR',
  'portland trail blazers': 'POR',
  'miami heat': 'MIA',
  'utah jazz': 'UTA',
  pelicans: 'NOP',
  'new orleans pelicans': 'NOP',
  'chicago bulls': 'CHI',
  'atlanta hawks': 'ATL',
  'los angeles clippers': 'LAC',
  'sacramento kings': 'SAC',
  memphis: 'MEM',
  'memphis grizzlies': 'MEM',
  'indiana peacers': 'IND',
  'indiana pacers': 'IND',
  'brooklyn nets': 'BKN',
  'washington wizard': 'WAS',
  'washington wizards': 'WAS',
  bucks: 'MIL',
  'milwaukee bucks': 'MIL',

  // Documento de 21/09: grafias que só a seção de REBOTES (negrito) usa.
  sixers: 'PHI',
  'san antonio': 'SAS',
  'charlote hornet': 'CHA', // typo do documento: falta um "t" em "Charlotte"
  'dallas maverick': 'DAL', // typo do documento: "Maverick" no singular
  atlanta: 'ATL',
  houston: 'HOU',
  'memphis grizlles': 'MEM', // typo do documento: falta um "z" em "Grizzlies"
  denver: 'DEN',

  // Documento de 21/09: grafias que só a seção de ASSISTÊNCIAS (texto puro) usa.
  toronto: 'TOR',
  portland: 'POR',
  miami: 'MIA',
  kings: 'SAC',
  'pistons detroit': 'DET', // ordem invertida de "Detroit Pistons"
  'new orlean pelicans': 'NOP', // typo do documento: falta o "s" em "Orleans"
}

// A implementação vive no domínio: a busca da aba de estatísticas usa a MESMA
// régua de grafia aproximada que a reconciliação de nomes da lista. Ver
// src/modules/dominio/texto.ts.
export { normalizarTexto }

export function siglaDoTime(nomeNaLista: string): string | null {
  return MAPA[normalizarTexto(nomeNaLista)] ?? null
}

export const TOTAL_TIMES_NBA = 30
