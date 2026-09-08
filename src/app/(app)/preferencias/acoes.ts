'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { getDb } from '@/modules/dominio/db/cliente'
import { estadoDaUrl, rotaDaLista } from '@/modules/entrega/lista-secreta-rotas'
import { sessaoAtual } from '@/modules/plataforma/auth/cookies'
import { gravarPreferencias } from '@/modules/plataforma/preferencias'

/**
 * ORDEM E LENTE DA LISTA — preferência por CONTA (identidade 04).
 *
 * O seletor POR JOGO · POR NÍVEL e os chips de lente são um `<form>` de
 * botões: cada botão manda o `destino` (a URL para onde o clique ia, montada
 * por `lista-secreta-rotas`). A ação grava a escolha na conta e redireciona
 * para lá — a URL fica coerente com o que a tela passa a mostrar, e o mesmo
 * clique vale no outro aparelho na próxima abertura.
 *
 * O destino NUNCA é usado como veio: `estadoDaUrl` valida campo a campo e
 * `rotaDaLista` remonta a rota. Um `destino` forjado não redireciona para
 * fora do app nem grava valor fora do vocabulário.
 *
 * Sem sessão, a ação só navega: a tela já está atrás do paywall, então isto é
 * cinto de segurança, não porta.
 */
async function aplicar(
  formulario: FormData,
  gravar: (usuarioId: string, estado: ReturnType<typeof estadoDaUrl>) => Promise<void>,
): Promise<void> {
  const estado = estadoDaUrl(String(formulario.get('destino') ?? '/'))
  const sessao = await sessaoAtual()
  if (sessao) await gravar(sessao.usuarioId, estado)
  revalidatePath('/')
  redirect(rotaDaLista(estado))
}

export async function definirOrdem(formulario: FormData): Promise<void> {
  await aplicar(formulario, async (usuarioId, estado) => {
    if (estado.ordem) await gravarPreferencias(getDb(), usuarioId, { ordemLista: estado.ordem })
  })
}

export async function definirLente(formulario: FormData): Promise<void> {
  await aplicar(formulario, async (usuarioId, estado) => {
    if (estado.lente) await gravarPreferencias(getDb(), usuarioId, { lente: estado.lente })
  })
}
