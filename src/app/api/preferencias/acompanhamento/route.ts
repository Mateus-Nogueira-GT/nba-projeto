import { schemaAcompanhamento } from '@/modules/plataforma/experiencia/contrato'
import { definirAcompanhamento } from '@/modules/plataforma/experiencia/servico'
import { mutarExperiencia } from '../http'

export async function PUT(request: Request): Promise<Response> {
  return mutarExperiencia(request, (db, usuarioId, entrada) =>
    definirAcompanhamento(db, usuarioId, schemaAcompanhamento.parse(entrada)),
  )
}
