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
}: {
  tipo: TipoAcompanhamento
  id: string
  inicial: boolean
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
        {salvando
          ? 'Salvando…'
          : acompanhado
            ? `✓ Acompanhando ${tipo === 'JOGADOR' ? 'jogador' : 'time'}`
            : `+ Acompanhar ${tipo === 'JOGADOR' ? 'jogador' : 'time'}`}
      </button>
    </div>
  )
}

export function BotaoAcompanharJogador({
  jogadorId,
  inicial,
}: {
  jogadorId: string
  inicial: boolean
}) {
  return <BotaoAcompanhar tipo="JOGADOR" id={jogadorId} inicial={inicial} />
}

export function BotaoAcompanharTime({ timeId, inicial }: { timeId: string; inicial: boolean }) {
  return <BotaoAcompanhar tipo="TIME" id={timeId} inicial={inicial} />
}
