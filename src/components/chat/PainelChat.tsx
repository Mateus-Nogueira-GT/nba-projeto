'use client'

import { useEffect, useRef, useState } from 'react'

import estilos from './PainelChat.module.css'

/** O teto de caracteres da pergunta, espelhando `LIMITE_PERGUNTA` do servidor. */
const LIMITE_PERGUNTA = 500

type Turno = { de: 'eu' | 'assistente'; texto: string }

/** As mensagens que a rota devolve (`GET /api/chat`) viram turnos do painel. */
export function turnosDaConversa(mensagens: { papel: string; texto: string }[]): Turno[] {
  return mensagens.map((m) => ({ de: m.papel === 'USUARIO' ? 'eu' : 'assistente', texto: m.texto }))
}

/**
 * O MOTIVO DA ROTA VIRA FRASE.
 *
 * Quem perguntou não tem nada com "cota-esgotada". Cada motivo que a rota
 * distingue tem aqui a sua frase, e o desconhecido cai na mais genérica — um
 * código de erro na tela seria o defeito, não o diagnóstico.
 */
export function mensagemDeErro(motivo: string): string {
  switch (motivo) {
    case 'cota-esgotada':
      return 'Você já fez as suas perguntas de hoje. Amanhã recomeça.'
    case 'limite-por-minuto':
      return 'Calma, uma de cada vez — tente em alguns segundos.'
    case 'muito-longa':
      return 'A pergunta ficou comprida demais. Tente encurtar.'
    case 'vazio':
      return 'Escreva a sua pergunta para eu poder ajudar.'
    case 'sem-sessao':
      return 'Entre na sua conta para conversar comigo.'
    default:
      return 'O assistente está fora do ar agora. Tente mais tarde.'
  }
}

export function PainelChat({ aoFechar }: { aoFechar: () => void }) {
  const [turnos, setTurnos] = useState<Turno[]>([])
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [carregandoHistorico, setCarregandoHistorico] = useState(true)
  const fim = useRef<HTMLDivElement>(null)

  // A CONVERSA DO DIA entra ao abrir. O servidor guarda o histórico e o usa
  // como contexto; uma gaveta que abrisse vazia faria o assistente "lembrar"
  // de perguntas que a tela não mostra. Se a leitura falhar (sem sessão, flag
  // desligada, rede), o painel segue vazio e o erro aparece no primeiro envio —
  // não vale interromper a pessoa por um histórico que ela nem pediu.
  useEffect(() => {
    let ativo = true
    fetch('/api/chat')
      .then((r) => (r.ok ? (r.json() as Promise<{ mensagens?: { papel: string; texto: string }[] }>) : null))
      .then((corpo) => {
        if (!ativo || !corpo?.mensagens) return
        // Só preenche se ninguém enviou nada enquanto o histórico carregava:
        // uma pergunta feita nesse meio-tempo já está no servidor, e prefixar
        // o histórico a ela a duplicaria.
        setTurnos((atuais) => (atuais.length === 0 ? turnosDaConversa(corpo.mensagens!) : atuais))
      })
      .catch(() => undefined)
      .finally(() => {
        if (ativo) setCarregandoHistorico(false)
      })
    return () => {
      ativo = false
    }
  }, [])

  // Esc fecha: é o gesto que todo mundo tenta primeiro numa gaveta.
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoFechar()
    }
    document.addEventListener('keydown', aoTeclar)
    return () => document.removeEventListener('keydown', aoTeclar)
  }, [aoFechar])

  useEffect(() => {
    fim.current?.scrollIntoView({ block: 'end' })
  }, [turnos])

  const enviar = async () => {
    const pergunta = texto.trim()
    if (pergunta.length === 0 || enviando) return
    setEnviando(true)
    setErro(null)
    setTurnos((atuais) => [...atuais, { de: 'eu', texto: pergunta }])
    setTexto('')
    try {
      const resposta = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ texto: pergunta }),
      })
      const corpo = (await resposta.json().catch(() => ({}))) as { texto?: string; erro?: string }
      if (resposta.ok && corpo.texto)
        setTurnos((atuais) => [...atuais, { de: 'assistente', texto: corpo.texto! }])
      else setErro(mensagemDeErro(corpo.erro ?? 'indisponivel'))
    } catch {
      // Rede caiu no meio: a pessoa perdeu a conexão, não é defeito do produto.
      setErro(mensagemDeErro('indisponivel'))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <>
      <div className={estilos.veu} onClick={aoFechar} aria-hidden />
      <aside className={estilos.painel} role="dialog" aria-label="Assistente NIP">
        <header className={estilos.topo}>
          <strong>Assistente</strong>
          <button
            type="button"
            className={estilos.fechar}
            aria-label="Fechar o assistente"
            onClick={aoFechar}
          >
            ✕
          </button>
        </header>

        <div className={estilos.conversa}>
          {turnos.length === 0 && !carregandoHistorico && (
            <p className={estilos.convite}>
              Pergunte sobre a temporada da NBA ou sobre como a NIP funciona.
            </p>
          )}
          {turnos.map((t, i) => (
            <p key={i} className={t.de === 'eu' ? estilos.meu : estilos.dele}>
              {t.texto}
            </p>
          ))}
          {enviando && <p className={estilos.dele}>Pensando…</p>}
          {erro !== null && <p className={estilos.erro}>{erro}</p>}
          <div ref={fim} />
        </div>

        <div className={estilos.envio}>
          <textarea
            className={estilos.caixa}
            value={texto}
            maxLength={LIMITE_PERGUNTA}
            rows={2}
            placeholder="Escreva a sua pergunta"
            aria-label="Sua pergunta"
            // Quem abriu a gaveta veio para escrever — o foco já chega na caixa.
            autoFocus
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void enviar()
              }
            }}
          />
          <div className={estilos.rodape}>
            <span className={estilos.contador}>
              {texto.length}/{LIMITE_PERGUNTA}
            </span>
            <button
              type="button"
              className={estilos.enviar}
              disabled={enviando || texto.trim().length === 0}
              onClick={() => void enviar()}
            >
              Enviar
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
