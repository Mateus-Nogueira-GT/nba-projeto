'use client'

import { useEffect, useState } from 'react'
import { IconeRecolher } from '@/ui/icones'
import {
  aplicarAtualizacaoPwa,
  EVENTO_ATUALIZACAO_PWA,
  existeAtualizacaoPwa,
  registrarEventoPwa,
} from './pwa-cliente'
import s from './Pwa.module.css'

/**
 * O AVISO DE VERSÃO NOVA — e só isso.
 *
 * Quem instalou o PWA não recebe versão nova sozinho: o service worker baixa,
 * avisa, e ALGUÉM precisa aplicar a troca. Sem este aviso a pessoa ficaria
 * numa versão velha sem nunca saber — o tipo de defeito que só aparece quando
 * alguém reclama de um bug já corrigido.
 *
 * Para quem está com a versão corrente, ele não aparece nunca.
 */
type Estado = 'oculto' | 'atualizacao' | 'atualizando' | 'erro'

export function PainelPwa() {
  const [estado, setEstado] = useState<Estado>('oculto')
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let ativo = true

    const avaliar = async () => {
      if ((await existeAtualizacaoPwa()) && ativo) setEstado('atualizacao')
    }

    // Fora do caminho do primeiro render: a tela é do conteúdo, e um await
    // aqui atrasaria a pintura dele por uma consulta ao service worker.
    const timer = window.setTimeout(() => void avaliar(), 0)
    const aoAtualizar = () => {
      setEstado('atualizacao')
      registrarEventoPwa('ATUALIZACAO_DISPONIVEL')
    }

    window.addEventListener(EVENTO_ATUALIZACAO_PWA, aoAtualizar)
    return () => {
      ativo = false
      window.clearTimeout(timer)
      window.removeEventListener(EVENTO_ATUALIZACAO_PWA, aoAtualizar)
    }
  }, [])

  async function atualizar() {
    setErro(null)
    setEstado('atualizando')
    try {
      await aplicarAtualizacaoPwa()
      registrarEventoPwa('ATUALIZACAO_APLICADA')
    } catch {
      setErro('A atualização não pôde ser aplicada agora. Recarregue a página e tente novamente.')
      setEstado('erro')
    }
  }

  if (estado === 'oculto') return null

  return (
    <div className={s.faixa} role="note" aria-labelledby="titulo-pwa">
      <span className={s.icone} aria-hidden>
        <IconeRecolher tamanho={18} />
      </span>
      <p className={s.texto}>
        <strong id="titulo-pwa">Atualização disponível.</strong>{' '}
        {erro ?? 'A nova versão será aplicada com uma recarga controlada.'}
      </p>
      <button type="button" className={s.botao} disabled={estado === 'atualizando'} onClick={atualizar}>
        {estado === 'atualizando' ? 'Atualizando…' : 'Atualizar agora'}
      </button>
    </div>
  )
}
