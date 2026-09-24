'use client'

import { IconeAssistente } from '@/ui/icones'
import { abrirAssistente } from './evento'
import s from './Assistente.module.css'

/**
 * O campo "Pergunte sobre a lista de hoje" no fim do resumo da rodada. Não
 * conversa sozinho: abre o assistente por intenção (clique, Enter ou primeira
 * tecla) levando o que já foi digitado — nunca por foco, para quem navega por
 * Tab atravessar sem abrir nada.
 */
export function CampoDoAssistente() {
  return (
    <form
      className={s.campo}
      onSubmit={(e) => {
        e.preventDefault()
        const dados = new FormData(e.currentTarget)
        abrirAssistente(String(dados.get('pergunta') ?? '').trim() || undefined)
        e.currentTarget.reset()
      }}
    >
      <IconeAssistente tamanho={20} />
      <label htmlFor="campo-assistente" className="so-leitor">
        Pergunte ao Sixth Man AI
      </label>
      <input
        id="campo-assistente"
        name="pergunta"
        type="text"
        autoComplete="off"
        placeholder="Pergunte sobre a lista de hoje"
        onClick={(e) => {
          if (!e.currentTarget.value) abrirAssistente()
        }}
      />
    </form>
  )
}
