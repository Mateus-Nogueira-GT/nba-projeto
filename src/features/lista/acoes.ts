'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getDb } from '@/modules/dominio/db/cliente'
import { sessaoAtual } from '@/modules/plataforma/auth/cookies'
import { gravarPreferencias, LENTES, ORDENS_LISTA } from '@/modules/plataforma/preferencias'
import { hrefDaLista, lerEstadoDaTabela } from './estado'

/**
 * Agrupamento (ordem) e lente são preferência da CONTA: o clique grava e
 * redireciona para a Lista com a escolha na URL. O `destino` nunca é usado
 * como veio — é relido campo a campo e remontado, então um valor forjado não
 * sai do app nem grava algo fora do vocabulário.
 */
function estadoDoDestino(formulario: FormData) {
  const destino = String(formulario.get('destino') ?? '/')
  const consulta = destino.startsWith('/?') ? destino.slice(2) : ''
  return lerEstadoDaTabela(Object.fromEntries(new URLSearchParams(consulta).entries()))
}

export async function definirOrdem(formulario: FormData): Promise<void> {
  const estado = estadoDoDestino(formulario)
  const ordem = ORDENS_LISTA.find((o) => o === formulario.get('ordem'))
  const sessao = await sessaoAtual()
  if (sessao && ordem) await gravarPreferencias(getDb(), sessao.usuarioId, { ordemLista: ordem })
  revalidatePath('/')
  redirect(hrefDaLista(estado, { ordem }))
}

export async function definirLente(formulario: FormData): Promise<void> {
  const estado = estadoDoDestino(formulario)
  const lente = LENTES.find((l) => l === formulario.get('lente'))
  const sessao = await sessaoAtual()
  if (sessao && lente) await gravarPreferencias(getDb(), sessao.usuarioId, { lente })
  revalidatePath('/')
  redirect(hrefDaLista(estado, { lente }))
}
