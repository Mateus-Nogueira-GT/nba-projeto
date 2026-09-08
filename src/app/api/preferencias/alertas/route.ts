import { schemaExclusaoAlerta } from '@/modules/plataforma/experiencia/contrato'
import { definirExclusaoAlerta } from '@/modules/plataforma/experiencia/servico'
import { mutarExperiencia } from '../http'

export async function PUT(request: Request): Promise<Response> {
  return mutarExperiencia(request, (db, usuarioId, entrada) =>
    definirExclusaoAlerta(db, usuarioId, schemaExclusaoAlerta.parse(entrada)),
  )
}
