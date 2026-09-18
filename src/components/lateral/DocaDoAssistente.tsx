'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'

import estilos from './Lateral.module.css'

// O painel só é BAIXADO no primeiro foco do campo — a mesma economia que o
// botão flutuante já fazia no clique. A lateral aparece em toda tela de aba no
// desktop; embarcar a conversa inteira em todas elas seria cobrar de quem nunca
// vai perguntar nada.
const PainelChat = dynamic(() => import('../chat/PainelChat').then((m) => m.PainelChat), {
  ssr: false,
})

/**
 * A DOCA DO ASSISTENTE — o rodapé fixo da lateral (identidade 05, §7.3).
 *
 * Recolhida, é um campo estático com a primeira linha da última resposta do dia
 * acima dele, quando houver: a conversa continua visível sem ocupar a coluna.
 * Ao focar, o painel de sempre abre no modo doca e cresce para cima, e os dois
 * blocos acima rolam para fora.
 *
 * A leitura do histórico só acontece se a lateral estiver VISÍVEL: abaixo de
 * 1280 px a doca está escondida por CSS, e uma requisição para preencher um
 * elemento que ninguém vê seria puro custo.
 */
export function DocaDoAssistente() {
  const [aberta, setAberta] = useState(false)
  const [ultima, setUltima] = useState<string | null>(null)

  useEffect(() => {
    if (!window.matchMedia('(min-width: 1280px)').matches) return
    let ativo = true
    fetch('/api/chat')
      .then((r) =>
        r.ok ? (r.json() as Promise<{ mensagens?: { papel: string; texto: string }[] }>) : null,
      )
      .then((corpo) => {
        const resposta = corpo?.mensagens?.filter((m) => m.papel !== 'USUARIO').at(-1)?.texto
        if (ativo && resposta) setUltima(resposta.split('\n')[0]!.slice(0, 120))
      })
      // Falhar aqui é silencioso de propósito: a última resposta é conforto, e
      // interromper alguém por um histórico que ele não pediu seria pior.
      .catch(() => undefined)
    return () => {
      ativo = false
    }
  }, [])

  return (
    <div className={estilos.doca}>
      {aberta ? (
        <PainelChat modo="doca" aoFechar={() => setAberta(false)} />
      ) : (
        <form
          className={estilos.docaRecolhida}
          onSubmit={(e) => {
            e.preventDefault()
            setAberta(true)
          }}
        >
          {ultima && <p className={estilos.apoio}>{ultima}</p>}
          <input
            type="text"
            className={estilos.campo}
            placeholder="Pergunte sobre a lista de hoje"
            aria-label="Pergunte ao assistente"
            onFocus={() => setAberta(true)}
          />
        </form>
      )}
    </div>
  )
}
