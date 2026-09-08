import { eq } from 'drizzle-orm'

import { jogadores } from '../../dominio/db/schema'
import type { Db } from '../../dominio/db/tipos'

/**
 * FOTOS DA DEMONSTRAÇÃO — mapa curado nome (grafia EXATA da lista do CJ) →
 * personId oficial da NBA. Uma entrada por nome da lista, agrupada por time na
 * ordem do documento.
 *
 * A lista de níveis usa grafias próprias do Mestre da NBA, diferentes da
 * grafia oficial da NBA ("Shai", "stephen Curry", "Wembayama", "Fontenchhio").
 * Cada id foi conferido em 07/09/2026 contra o índice oficial de jogadores
 * ativos (nba.com/players) — o comentário da linha é o nome oficial de lá — e
 * contra o CDN (HEAD 200, nenhuma silhueta genérica). Um id trocado responde
 * 200 igual, mas é a foto de outro jogador: por isso o casamento usou
 * sobrenome + primeiro nome com tolerância a grafia e o TIME do CJ como
 * desempate; onde o índice discorda do time da lista, a linha anota.
 *
 * `null` é ambiguidade declarada, nunca palpite: a lista escreve "Wiggins" em
 * dois times (Andrew no MIA, Aaron no ATL) e o cadastro da demo funde os dois
 * num só jogador — qualquer rosto estaria errado para um deles.
 */
export const MAPA_FOTOS: Record<string, number | null> = {
  // NYK
  Brunson: 1628973, // Jalen Brunson
  Towns: 1626157, // Karl-Anthony Towns
  Anunoby: 1628384, // OG Anunoby
  Bridges: 1628969, // Mikal Bridges
  hart: 1628404, // Josh Hart
  Shamet: 1629013, // Landry Shamet
  'Mc bride': 1630540, // Miles McBride
  Drumond: 203083, // Andre Drummond
  // SAS
  Wembayama: 1641705, // Victor Wembanyama
  Castle: 1642264, // Stephon Castle
  Fox: 1628368, // De'Aaron Fox
  'Tobias Harris': 202699, // Tobias Harris
  Vassel: 1630170, // Devin Vassell
  Harper: 1642844, // Dylan Harper
  champagnie: 1630577, // Julian Champagnie
  Kornet: 1628436, // Luke Kornet
  'Kelton Jhonson': 1629640, // Keldon Johnson
  // OKC
  Shai: 1628983, // Shai Gilgeous-Alexander
  'Jallem Williams': 1631114, // Jalen Williams
  'Chet holmgreen': 1631096, // Chet Holmgren
  'Ajay Mitchell': 1642349, // Ajay Mitchell
  Mcain: 1642272, // Jared McCain
  'Isaiah Harteinein': 1628392, // Isaiah Hartenstein
  'Cason Wallace': 1641717, // Cason Wallace
  'Jaylim Williams': 1631119, // Jaylin Williams
  Caruso: 1627936, // Alex Caruso
  // CLE
  'Donovan Mitchel': 1628378, // Donovan Mitchell
  'James Harden': 201935, // James Harden
  'Evan Mobley': 1630596, // Evan Mobley
  'Jarret Allen': 1628386, // Jarrett Allen
  Tyson: 1642281, // Jaylon Tyson
  'Sam Merrill': 1630241, // Sam Merrill
  Strus: 1629622, // Max Strus (LAC no índice)
  // DET
  'Cade Cunningham': 1630595, // Cade Cunningham
  'Jalen Duren': 1631105, // Jalen Duren
  Collins: 1628381, // John Collins
  'Duncan Robinson': 1629130, // Duncan Robinson
  'Isaiah Joe': 1630198, // Isaiah Joe
  jenkins: 1642450, // Daniss Jenkins
  Huerter: 1628989, // Kevin Huerter
  'Ausar Thompson': 1641709, // Ausar Thompson
  // DEN
  Jokic: 203999, // Nikola Jokić
  'Jamal Murray': 1627750, // Jamal Murray
  Gordon: 203932, // Aaron Gordon
  'Cameron Jhonson': 1629661, // Cameron Johnson
  Braun: 1631128, // Christian Braun
  Watson: 1631212, // Peyton Watson (CLE no índice)
  'Bagley 2': 1628963, // Marvin Bagley III
  Strahwther: 1631124, // Julian Strawther
  // MIN
  'Anthony Edward': 1630162, // Anthony Edwards
  'Lamello Ball': 1630163, // LaMelo Ball
  Dosunmu: 1630245, // Ayo Dosunmu
  McDaniels: 1630183, // Jaden McDaniels
  Gobert: 203497, // Rudy Gobert
  Hyland: 1630538, // Bones Hyland
  Shannon: 1630545, // Terrence Shannon Jr
  // LAL
  'Luka Doncic': 1629029, // Luka Dončić
  'Austin Reaves': 1630559, // Austin Reaves
  Grimes: 1629656, // Quentin Grimes
  Kesller: 1631117, // Walker Kessler
  Mamukelashivili: 1630572, // Sandro Mamukelashvili
  Sexton: 1629012, // Collin Sexton
  Laravia: 1631222, // Jake LaRavia
  // PHI
  Embid: 203954, // Joel Embiid
  'Jaylen Brown': 1627759, // Jaylen Brown
  Maxey: 1630178, // Tyrese Maxey
  'LeBron James': 2544, // LeBron James
  Edjecombe: 1642845, // VJ Edgecombe
  Simmons: 1629014, // Anfernee Simons — Ben Simmons não está no índice ativo
  Barlow: 1631230, // Dominick Barlow
  // PHX
  'Devin Booker': 1626164, // Devin Booker
  'Jalen green': 1630224, // Jalen Green
  Brooks: 1628415, // Dillon Brooks
  'Miles Bridges': 1628970, // Miles Bridges
  Gillespie: 1631221, // Collin Gillespie
  'Mark Williams': 1631109, // Mark Williams
  'Luke Lenard': 1628379, // Luke Kennard
  // CHA
  'Brendon miller': 1641706, // Brandon Miller
  Knueppel: 1642851, // Kon Knueppel
  'Coby white': 1629632, // Coby White
  'Naz Reid': 1629675, // Naz Reid
  'grasson Allen': 1628960, // Grayson Allen
  Diabate: 1631217, // Moussa Diabaté
  // DAL
  Irving: 202681, // Kyrie Irving
  'Cooper Fllag': 1642843, // Cooper Flagg
  'PJ washinton': 1629023, // P.J. Washington
  'Max cristie': 1631108, // Max Christie
  Marshall: 1630230, // Naji Marshall
  Aldama: 1630583, // Santi Aldama
  'Klay Thompson': 202691, // Klay Thompson (MIA no índice)
  Gafford: 1629655, // Daniel Gafford
  Risacher: 1642258, // Zaccharie Risacher
  // GSW
  'stephen Curry': 201939, // Stephen Curry
  Butler: 202710, // Jimmy Butler III
  Porzigins: 204001, // Kristaps Porziņģis
  podzienki: 1641764, // Brandin Podziemski
  'Gui Santos': 1630611, // Gui Santos
  Green: 203110, // Draymond Green
  // TOR
  'Kawhi Leonard': 202695, // Kawhi Leonard (LAC no índice)
  Barnes: 1630567, // Scottie Barnes
  Barret: 1629628, // RJ Barrett
  Quirkleyy: 1630193, // Immanuel Quickley
  Potl: 1627751, // Jakob Poeltl · Jakob Poeltl
  'Murray Boyles': 1642867, // Collin Murray-Boyles
  'Jamal Shead': 1642347, // Jamal Shead
  // BOS
  Tatum: 1628369, // Jayson Tatum
  Pritchard: 1630202, // Payton Pritchard
  'Paul George': 202331, // Paul George
  'Derick White': 1628401, // Derrick White
  Queta: 1629674, // Neemias Queta
  Hauser: 1630573, // Sam Hauser
  Garza: 1630568, // Luka Garza
  // HOU
  'Kevin Durant': 201142, // Kevin Durant
  sengun: 1630578, // Alperen Sengun
  'Amem Thompson': 1641708, // Amen Thompson
  'Jabari smith': 1631095, // Jabari Smith Jr.
  Sheepard: 1642263, // Reed Sheppard
  'Van fleet': 1627832, // Fred VanVleet
  Eason: 1631106, // Tari Eason
  Smart: 203935, // Marcus Smart
  // ORL
  Banchero: 1631094, // Paolo Banchero
  'Franz Wagner': 1630532, // Franz Wagner
  Bane: 1630217, // Desmond Bane
  Suggs: 1630591, // Jalen Suggs
  'Anthony black': 1641710, // Anthony Black
  Vucevic: 202696, // Nikola Vučević
  'Carter Jr': 1628976, // Wendell Carter Jr.
  'Tristan da Silva': 1641783, // Tristan da Silva
  // POR
  Lillard: 203081, // Damian Lillard
  Avdija: 1630166, // Deni Avdija
  'Já morant': 1629630, // Ja Morant
  holiday: 201950, // Jrue Holiday
  Sharpe: 1631101, // Shaedon Sharpe
  Henderson: 1630703, // Scoot Henderson
  Camara: 1641739, // Toumani Camara
  Clingan: 1642270, // Donovan Clingan
  // MIA
  Giannis: 203507, // Giannis Antetokounmpo
  Adebayo: 1628389, // Bam Adebayo
  Wiggins: null, // ambíguo: Andrew Wiggins (MIA, 203952) ou Aaron Wiggins (ATL, 1630598) — ver acima
  'Hardaway JR': 203501, // Tim Hardaway Jr.
  Larsson: 1641796, // Pelle Larsson
  'Davion Mitchell': 1630558, // Davion Mitchell
  Portis: 1626171, // Bobby Portis Jr.
  Fontenchhio: 1631323, // Simone Fontecchio
  // UTA
  Lauri: 1628374, // Lauri Markkanen
  Keyonte: 1641718, // Keyonte George
  'Jaren Jackson Jr': 1628991, // Jaren Jackson Jr.
  'Ace Bailey': 1642846, // Ace Bailey
  sensabaugh: 1641729, // Brice Sensabaugh
  Nurkic: 203994, // Jusuf Nurkić
  // NOP
  Zion: 1629627, // Zion Williamson
  'Trey Murphy': 1630530, // Trey Murphy III
  'dejount Murray': 1627749, // Dejounte Murray
  'Sadiq Bey': 1630180, // Saddiq Bey
  'Jordan Poole': 1629673, // Jordan Poole
  'Jeremiah ferrs': 1642847, // Jeremiah Fears
  'Derik Queen': 1642852, // Derik Queen
  'Herbert Jones': 1630529, // Herbert Jones
  // CHI
  Powel: 1626181, // Norman Powell
  Giddey: 1630581, // Josh Giddey
  Buzzelis: 1641824, // Matas Buzelis
  'tre Jone': 1630200, // Tre Jones
  Claxton: 1629651, // Nic Claxton
  Okoro: 1630171, // Isaac Okoro
  'Cale Wilson': 1643410, // Caleb Wilson · Caleb Wilson, calouro de 2026
  // ATL
  'Jalen Johnson': 1630552, // Jalen Johnson
  'Nickeil Alexander Walker': 1629638, // Nickeil Alexander-Walker
  'CJ McCollum': 203468, // CJ McCollum
  okonguwu: 1630168, // Onyeka Okongwu
  Daniels: 1630700, // Dyson Daniels
  // Wiggins — mesma chave do MIA (ver acima)
  kispert: 1630557, // Corey Kispert
  Landale: 1629111, // Jock Landale
  Dort: 1629652, // Luguentz Dort
  // LAC
  Ingram: 1627742, // Brandon Ingram (TOR no índice) · Brandon, não Harrison (two-way, ~2 pts): a lista põe Ingram como ALL_STAR nº 1 do time
  Garland: 1629636, // Darius Garland
  Mathurin: 1631097, // Bennedict Mathurin
  Hachimura: 1629060, // Rui Hachimura
  'Derick Jone Jr': 1627884, // Derrick Jones Jr.
  'J. Miller': 1641757, // Jordan Miller · Jordan, não Baba (também LAC): a inicial é J
  'Brook Lopez': 201572, // Brook Lopez
  Dick: 1641711, // Gradey Dick (TOR no índice)
  // SAC
  Lavine: 203897, // Zach LaVine
  Sabonis: 1627734, // Domantas Sabonis
  Hunter: 1629631, // De'Andre Hunter
  'king Murray': 1631099, // Keegan Murray
  'malik monk': 1628370, // Malik Monk
  Clifford: 1642363, // Nique Clifford
  Achiuwa: 1630173, // Precious Achiuwa
  Reynard: 1642875, // Maxime Raynaud · Maxime Raynaud, único aproximado no SAC
  // MEM
  'Ty Jerome': 1629660, // Ty Jerome
  Grant: 203924, // Jerami Grant
  Coward: 1642907, // Cedric Coward
  'Zach Edey': 1641744, // Zach Edey
  wells: 1642377, // Jaylen Wells
  'pippen jr': 1630590, // Scotty Pippen Jr.
  'Cam Spencer': 1642285, // Cam Spencer
  'GG Jackson': 1641713, // GG Jackson
  // IND
  Siakam: 1627783, // Pascal Siakam
  Haliburton: 1630169, // Tyrese Haliburton
  Nembhard: 1629614, // Andrew Nembhard
  zubac: 1627826, // Ivica Zubac
  Nesmith: 1630174, // Aaron Nesmith
  'Kelly oubre': 1626162, // Kelly Oubre Jr.
  Toppin: 1630167, // Obi Toppin
  'Jerace walker': 1641716, // Jarace Walker
  McConnell: 204456, // T.J. McConnell
  // BKN
  'Michael porter Jr': 1629008, // Michael Porter Jr.
  'Julius randlle': 203944, // Julius Randle
  Clonley: 1641730, // Noah Clowney (BKN) — o time decide contra Mike Conley (BOS)
  'ego demim': 1642856, // Egor Dëmin
  'M wagner': 1629021, // Moritz Wagner
  'Dany Wolf': 1642874, // Danny Wolf
  'Keon Ellis': 1631165, // Keon Ellis
  // WAS
  'Anthony Davies': 203076, // Anthony Davis
  'Trae young': 1629027, // Trae Young
  'Alexandre SArr': 1642259, // Alex Sarr
  'kyshwan George': 1642273, // Kyshawn George
  Ayton: 1629028, // Deandre Ayton
  'TRE Johnson': 1642848, // Tre Johnson
  carrington: 1642267, // Bub Carrington
  Dybantsa: 1643407, // AJ Dybantsa
  // MIL
  'Tyler Herro': 1629639, // Tyler Herro
  'Kevin porter': 1629645, // Kevin Porter Jr.
  Rollins: 1631157, // Ryan Rollins
  'jasquez jr': 1631170, // Jaime Jaquez Jr.
  Kuzma: 1628398, // Kyle Kuzma
  Turner: 1626167, // Myles Turner
  Ware: 1642276, // Kel'el Ware
  Dieng: 1631172, // Ousmane Dieng
}

export function urlDaFoto(personId: number): string {
  return `https://cdn.nba.com/headshots/nba/latest/1040x760/${personId}.png`
}

export type ResultadoFotos = {
  gravadas: number
  /** Sem jogador correspondente ou falha na verificação da URL — é problema. */
  puladas: string[]
  /** `null` no mapa: ambiguidade declarada, fica sem foto de propósito. */
  semId: string[]
}

/**
 * Grava `foto_url` só para nomes cuja URL o `verificar` aprovou (respondeu
 * 200). Verificação na GRAVAÇÃO, não na renderização: nenhuma imagem quebrada
 * pode chegar a aparecer numa apresentação ao cliente.
 *
 * `verificar` entra por injeção de propósito — o script real passa `fetch`,
 * o teste passa um verificador falso. O motor de fotos não toca rede sozinho.
 */
export async function aplicarFotos(
  db: Db,
  verificar: (url: string) => Promise<boolean>,
): Promise<ResultadoFotos> {
  const todos = await db.select().from(jogadores)
  // Caixa baixa dos dois lados: `nomeCompleto` guarda o nome de EXIBIÇÃO
  // ("Stephen Curry") e as chaves aqui vieram do documento do CJ
  // ("stephen Curry"). Igualdade exata mandaria o Curry para `puladas` — o
  // rosto mais reconhecível da demonstração sumiria em silêncio.
  const porNome = new Map(todos.map((j) => [j.nomeCompleto.toLowerCase(), j.id] as const))
  let gravadas = 0
  const puladas: string[] = []
  const semId: string[] = []
  for (const [nome, personId] of Object.entries(MAPA_FOTOS)) {
    if (personId === null) {
      semId.push(nome)
      continue
    }
    const id = porNome.get(nome.toLowerCase())
    const url = urlDaFoto(personId)
    if (id === undefined) {
      puladas.push(nome)
      continue
    }
    let disponivel = false
    try {
      disponivel = await verificar(url)
    } catch {
      // Uma URL indisponível não impede as demais fotos de serem preenchidas.
      // A pendência aparece no resultado para permitir nova tentativa do CLI.
    }
    if (!disponivel) {
      puladas.push(nome)
      continue
    }
    await db.update(jogadores).set({ fotoUrl: url }).where(eq(jogadores.id, id))
    gravadas += 1
  }
  return { gravadas, puladas, semId }
}
