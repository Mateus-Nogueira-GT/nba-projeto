'use client'

import { useEffect, useState } from 'react'

import estilos from './PainelPwa.module.css'
import {
  aplicarAtualizacaoPwa,
  EVENTO_ATUALIZACAO_PWA,
  existeAtualizacaoPwa,
  registrarEventoPwa,
} from './pwa-cliente'

/**
 * O AVISO DE VERSÃO NOVA — e só isso.
 *
 * Este painel também convidava a instalar o app ("Instale a NIP", o passo a
 * passo de adicionar à tela de início, o prompt do navegador). O convite saiu
 * a pedido do parceiro em 15/09: ele ocupava a tela de quem já está dentro,
 * abaixo dos cards, para oferecer algo que a pessoa não pediu.
 *
 * O componente sobreviveu porque a instalação nunca foi a única coisa que ele
 * fazia. Quem instalou o PWA não recebe versão nova sozinho: o service worker
 * baixa, avisa, e ALGUÉM precisa aplicar a troca. Apagar o arquivo levaria
 * esse caminho junto, e o usuário ficaria numa versão velha sem nunca saber —
 * um defeito silencioso, do tipo que só aparece quando alguém reclama de um
 * bug já corrigido.
 *
 * Na prática, para quem está com a versão corrente ele não aparece nunca.
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

    // Fora do caminho do primeiro render: a tela é dos cards, e um await aqui
    // atrasaria a pintura deles por uma consulta ao service worker.
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
    <section className={estilos.painel} aria-labelledby="titulo-pwa">
      <div className={estilos.cabecalho}>
        <span className={estilos.icone} aria-hidden="true">
          ◉
        </span>
        <div>
          <h2 id="titulo-pwa" className={estilos.titulo}>
            Atualização disponível
          </h2>
          <p className={estilos.texto}>
            A nova versão será aplicada com uma recarga controlada.
          </p>
        </div>
      </div>

      {erro && (
        <p className={estilos.estado} role="alert">
          {erro}
        </p>
      )}

      <div className={estilos.acoes}>
        <button
          className={estilos.botao}
          type="button"
          disabled={estado === 'atualizando'}
          onClick={atualizar}
        >
          {estado === 'atualizando' ? 'Atualizando…' : 'Atualizar agora'}
        </button>
      </div>
    </section>
  )
}
