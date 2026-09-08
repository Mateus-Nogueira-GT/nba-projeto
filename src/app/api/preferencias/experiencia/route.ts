import { getDb } from '@/modules/dominio/db/cliente'
import { sessaoAtual } from '@/modules/plataforma/auth/cookies'
import { schemaPreferenciasExperiencia } from '@/modules/plataforma/experiencia/contrato'
import { gravarPreferenciasExperiencia } from '@/modules/plataforma/experiencia/servico'
import { mutarExperiencia, respostaExperiencia } from '../http'

export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  const sessao = await sessaoAtual()
  if (!sessao) return Response.json({ erro: 'não autenticado' }, { status: 401 })
  return respostaExperiencia(getDb(), sessao.usuarioId)
}

export async function PATCH(request: Request): Promise<Response> {
  return mutarExperiencia(request, (db, usuarioId, entrada) =>
    gravarPreferenciasExperiencia(db, usuarioId, schemaPreferenciasExperiencia.parse(entrada)),
  )
}
