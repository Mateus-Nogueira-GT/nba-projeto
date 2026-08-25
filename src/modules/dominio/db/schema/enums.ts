import { pgEnum } from 'drizzle-orm/pg-core'

// O vocabulário do CJ é o vocabulário do banco (CLAUDE.md > Vocabulário).
export const atributoEnum = pgEnum('atributo', ['PONTOS', 'REBOTES', 'ASSISTENCIAS'])
export const nivelJogadorEnum = pgEnum('nivel_jogador', ['MVP', 'ALL_STAR', 'SUPORTE', 'RANDOLA'])
export const estrategiaEnum = pgEnum('estrategia', ['LISTA_SECRETA', 'FIRE_LIVE'])
export const metodoEnum = pgEnum('metodo', ['OSCILACAO', 'OPD'])

export const statusJogoEnum = pgEnum('status_jogo', ['AGENDADO', 'AO_VIVO', 'ENCERRADO'])
export const statusEscalacaoEnum = pgEnum('status_escalacao', [
  'ATIVO',
  'FORA',
  'DUVIDA',
  'PROVAVEL',
])
export const janelaMediaEnum = pgEnum('janela_media', ['TEMPORADA', 'ULTIMOS_5', 'ULTIMOS_10'])

export const origemOddsEnum = pgEnum('origem_odds', ['CASAS', 'TABELA_ESTATICA'])
export const statusRulesetEnum = pgEnum('status_ruleset', ['provisorio', 'homologado'])

export const statusUsuarioEnum = pgEnum('status_usuario', ['ATIVO', 'BLOQUEADO'])
export const papelUsuarioEnum = pgEnum('papel_usuario', ['USUARIO', 'ADMIN'])
export const tipoEventoContaEnum = pgEnum('tipo_evento_conta', [
  'LOGIN',
  'LOGIN_FALHOU',
  'SESSAO_ENCERRADA',
  'USO_SIMULTANEO',
  'BLOQUEIO',
  'DESBLOQUEIO',
])
export const tipoDispositivoEnum = pgEnum('tipo_dispositivo', ['MOBILE', 'DESKTOP'])
export const canalNotificacaoEnum = pgEnum('canal_notificacao', [
  'FIRE_LIVE_APITO',
  'GREEN',
  'LISTA_SECRETA',
])

export const tipoProvedorEnum = pgEnum('tipo_provedor', ['NBA_PRIMARIO', 'NBA_RESERVA', 'CASA'])
export const severidadeEnum = pgEnum('severidade', ['INFO', 'AVISO', 'ERRO', 'CRITICO'])
