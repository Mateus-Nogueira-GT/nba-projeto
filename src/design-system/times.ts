export type IdentidadeDoTime = {
  sigla: string
  nome: string
  /** Identificador do catálogo NBA, apenas para rastrear a origem da marca. */
  nbaId: number | null
  logoUrl: string | null
}

/**
 * Catálogo de APRESENTAÇÃO: não decide elenco, mando nem curadoria do CJ.
 * Siglas seguem o domínio existente; nomes e IDs foram conferidos nos links
 * oficiais de https://www.nba.com/teams. Origem dos SVGs: public/times/README.md.
 * Fica no design system para não levar ingestão ou I/O ao frontend.
 */
export const TIMES_NBA: ReadonlyArray<Readonly<IdentidadeDoTime>> = [
  { sigla: 'ATL', nome: 'Atlanta Hawks', nbaId: 1610612737 },
  { sigla: 'BOS', nome: 'Boston Celtics', nbaId: 1610612738 },
  { sigla: 'BKN', nome: 'Brooklyn Nets', nbaId: 1610612751 },
  { sigla: 'CHA', nome: 'Charlotte Hornets', nbaId: 1610612766 },
  { sigla: 'CHI', nome: 'Chicago Bulls', nbaId: 1610612741 },
  { sigla: 'CLE', nome: 'Cleveland Cavaliers', nbaId: 1610612739 },
  { sigla: 'DAL', nome: 'Dallas Mavericks', nbaId: 1610612742 },
  { sigla: 'DEN', nome: 'Denver Nuggets', nbaId: 1610612743 },
  { sigla: 'DET', nome: 'Detroit Pistons', nbaId: 1610612765 },
  { sigla: 'GSW', nome: 'Golden State Warriors', nbaId: 1610612744 },
  { sigla: 'HOU', nome: 'Houston Rockets', nbaId: 1610612745 },
  { sigla: 'IND', nome: 'Indiana Pacers', nbaId: 1610612754 },
  { sigla: 'LAC', nome: 'Los Angeles Clippers', nbaId: 1610612746 },
  { sigla: 'LAL', nome: 'Los Angeles Lakers', nbaId: 1610612747 },
  { sigla: 'MEM', nome: 'Memphis Grizzlies', nbaId: 1610612763 },
  { sigla: 'MIA', nome: 'Miami Heat', nbaId: 1610612748 },
  { sigla: 'MIL', nome: 'Milwaukee Bucks', nbaId: 1610612749 },
  { sigla: 'MIN', nome: 'Minnesota Timberwolves', nbaId: 1610612750 },
  { sigla: 'NOP', nome: 'New Orleans Pelicans', nbaId: 1610612740 },
  { sigla: 'NYK', nome: 'New York Knicks', nbaId: 1610612752 },
  { sigla: 'OKC', nome: 'Oklahoma City Thunder', nbaId: 1610612760 },
  { sigla: 'ORL', nome: 'Orlando Magic', nbaId: 1610612753 },
  { sigla: 'PHI', nome: 'Philadelphia 76ers', nbaId: 1610612755 },
  { sigla: 'PHX', nome: 'Phoenix Suns', nbaId: 1610612756 },
  { sigla: 'POR', nome: 'Portland Trail Blazers', nbaId: 1610612757 },
  { sigla: 'SAC', nome: 'Sacramento Kings', nbaId: 1610612758 },
  { sigla: 'SAS', nome: 'San Antonio Spurs', nbaId: 1610612759 },
  { sigla: 'TOR', nome: 'Toronto Raptors', nbaId: 1610612761 },
  { sigla: 'UTA', nome: 'Utah Jazz', nbaId: 1610612762 },
  { sigla: 'WAS', nome: 'Washington Wizards', nbaId: 1610612764 },
].map((time) => ({ ...time, logoUrl: `/times/${time.sigla}.svg` }))

const porSigla = new Map(TIMES_NBA.map((time) => [time.sigla, time]))

/** Time desconhecido continua sendo a sigla recebida: não recebe nome ou marca inventados. */
export function identidadeDoTime(sigla: string): Readonly<IdentidadeDoTime> {
  const normalizada = sigla.trim().toUpperCase() || '—'
  return (
    porSigla.get(normalizada) ?? {
      sigla: normalizada,
      nome: normalizada,
      nbaId: null,
      logoUrl: null,
    }
  )
}
