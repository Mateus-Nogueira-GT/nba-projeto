'use client'

import { useEffect, useState } from 'react'

import estilos from './BotaoAcompanharJogador.module.css'

const EVENTO = 'nba:acompanhamento'

type TipoAcompanhamento = 'JOGADOR' | 'TIME'
type MudancaAcompanhamento = CustomEvent<{
  tipo: TipoAcompanhamento
  id: string
  acompanhado: boolean
}>

function BotaoAcompanhar({
  tipo,
  id,
  inicial,
  variante = 'texto',
}: {
  tipo: TipoAcompanhamento
  id: string
  inicial: boolean
  /**
   * `texto` é o botão de sempre, com o rótulo escrito. `estrela` é a forma
   * compacta que entra no CANTO do card da Lista (identidade 05): o mesmo
   * gesto, sem a linha solta embaixo do card que quebrava o ritmo da grade.
   * O nome acessível é escrito nos dois — o ícone nunca fica sozinho.
   */
  variante?: 'texto' | 'estrela'
}) {
  const [acompanhado, setAcompanhado] = useState(inicial)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    const sincronizar = (evento: Event) => {
      const detalhe = (evento as MudancaAcompanhamento).detail
      if (detalhe.tipo === tipo && detalhe.id === id) setAcompanhado(detalhe.acompanhado)
    }
    window.addEventListener(EVENTO, sincronizar)
    return () => window.removeEventListener(EVENTO, sincronizar)
  }, [id, tipo])

  const alternar = async () => {
    const proximo = !acompanhado
    setAcompanhado(proximo)
    setSalvando(true)
    setErro('')
    window.dispatchEvent(new CustomEvent(EVENTO, { detail: { tipo, id, acompanhado: proximo } }))
    try {
      const resposta = await fetch('/api/preferencias/acompanhamento', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tipo, id, acompanhar: proximo }),
      })
      if (!resposta.ok) throw new Error('falha ao salvar')
      const corpo = (await resposta.json()) as {
        estado?: { jogadoresAcompanhados?: string[]; timesAcompanhados?: string[] }
      }
      const idsConfirmados =
        tipo === 'JOGADOR' ? corpo.estado?.jogadoresAcompanhados : corpo.estado?.timesAcompanhados
      const confirmado = idsConfirmados?.includes(id) ?? proximo
      setAcompanhado(confirmado)
      window.dispatchEvent(
        new CustomEvent(EVENTO, { detail: { tipo, id, acompanhado: confirmado } }),
      )
    } catch {
      setAcompanhado(!proximo)
      setErro('Não foi possível salvar. Tente novamente.')
      window.dispatchEvent(new CustomEvent(EVENTO, { detail: { tipo, id, acompanhado: !proximo } }))
    } finally {
      setSalvando(false)
    }
  }

  const alvo = tipo === 'JOGADOR' ? 'jogador' : 'time'

  if (variante === 'estrela') {
    return (
      <button
        type="button"
        className={`${estilos.estrela} ${acompanhado ? estilos.estrelaAtiva : ''}`}
        aria-label={`Acompanhar ${alvo}`}
        aria-pressed={acompanhado}
        disabled={salvando}
        // O erro vira `title` aqui: no canto do card não há linha para escrever
        // uma frase, e some-la de vez deixaria a falha invisível.
        title={erro || undefined}
        onClick={() => void alternar()}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          aria-hidden
          fill={acompanhado ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        >
          <path d="M8 1.5l2 4.2 4.5.6-3.3 3.2.8 4.5L8 11.8 4 14l.8-4.5L1.5 6.3 6 5.7z" />
        </svg>
      </button>
    )
  }

  return (
    <div className={estilos.grupo}>
      {erro && (
        <span className={estilos.erro} role="status">
          {erro}
        </span>
      )}
      <button
        type="button"
        className={`${estilos.botao} ${acompanhado ? estilos.ativo : ''}`}
        aria-pressed={acompanhado}
        disabled={salvando}
        onClick={() => void alternar()}
      >
        {salvando ? 'Salvando…' : acompanhado ? `✓ Acompanhando ${alvo}` : `+ Acompanhar ${alvo}`}
      </button>
    </div>
  )
}

export function BotaoAcompanharJogador({
  jogadorId,
  inicial,
  variante,
}: {
  jogadorId: string
  inicial: boolean
  variante?: 'texto' | 'estrela'
}) {
  return <BotaoAcompanhar tipo="JOGADOR" id={jogadorId} inicial={inicial} variante={variante} />
}

export function BotaoAcompanharTime({ timeId, inicial }: { timeId: string; inicial: boolean }) {
  return <BotaoAcompanhar tipo="TIME" id={timeId} inicial={inicial} />
}
