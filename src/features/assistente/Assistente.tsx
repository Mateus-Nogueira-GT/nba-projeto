'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { IconeAssistente, IconeFechar } from '@/ui/icones'
import { EVENTO_ABRIR_ASSISTENTE } from './evento'
import s from './Assistente.module.css'

/** O teto de caracteres da pergunta, espelhando `LIMITE_PERGUNTA` do servidor. */
const LIMITE_PERGUNTA = 500

type Turno = { de: 'eu' | 'assistente'; texto: string }

/** As mensagens que a rota devolve (`GET /api/chat`) viram turnos do painel. */
function turnosDaConversa(mensagens: { papel: string; texto: string }[]): Turno[] {
  return mensagens.map((m) => ({ de: m.papel === 'USUARIO' ? 'eu' : 'assistente', texto: m.texto }))
}

/**
 * A RECUSA DA ROTA VIRA FRASE.
 *
 * `/api/chat` devolve `{ erro }` com um motivo em cada caso que distingue —
 * os do `responder` (cota, ritmo, vazio, longa, indisponível), os portões da
 * rota (sessão, nível MVP+, flag desligada) e as guardas de mutação da Onda 1
 * (origem e content-type). Cada um tem a sua frase; o desconhecido cai na mais
 * genérica; e quando o corpo não chega legível (um 500 cru, rede no meio), o
 * STATUS decide — um código de erro na tela seria o defeito, não o diagnóstico.
 */
export function mensagemDeRecusa(status: number, erro: string | undefined): string {
  switch (erro) {
    case 'sem-sessao':
      return 'Entre na sua conta para conversar comigo.'
    case 'nivel-insuficiente':
      return 'O Sixth Man AI é do plano MVP para cima. Assine para conversar comigo.'
    case 'cota-esgotada':
      return 'Você já fez as suas perguntas de hoje. Amanhã recomeça.'
    case 'limite-por-minuto':
      return 'Calma, uma de cada vez — tente em alguns segundos.'
    case 'muito-longa':
      return 'A pergunta ficou comprida demais. Tente encurtar.'
    case 'vazio':
      return 'Escreva a sua pergunta para eu poder ajudar.'
    case 'origem-invalida':
    case 'tipo-invalido':
      // Só acontece com a página desatualizada ou fora da origem do app:
      // recarregar é o que resolve, não tentar de novo.
      return 'Não consegui receber a pergunta. Recarregue a página e tente de novo.'
    case 'fora-do-ar':
    case 'desabilitado':
    case 'indisponivel':
      return 'O assistente está fora do ar agora. Tente mais tarde.'
    default:
      break
  }
  if (status === 401) return 'Entre na sua conta para conversar comigo.'
  if (status === 403) return 'O Sixth Man AI é do plano MVP para cima. Assine para conversar comigo.'
  if (status === 429) return 'Calma, uma de cada vez — tente em alguns segundos.'
  return 'O assistente está fora do ar agora. Tente mais tarde.'
}

const SUGESTOES = [
  'Quais são os turbos de hoje?',
  'Por que o Curry entrou na lista?',
  'Como funciona a nota de confiança?',
]

/**
 * O ASSISTENTE DA NIP — mesmo contrato do front antigo (`GET`/`POST /api/chat`).
 * Um botão flutuante e uma gaveta à direita; qualquer ponto do app abre a
 * gaveta pelo evento `nip:abrir-assistente`. O histórico do dia é lido ao abrir.
 */
export function Assistente() {
  const [aberto, setAberto] = useState(false)
  const [turnos, setTurnos] = useState<Turno[]>([])
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [carregou, setCarregou] = useState(false)
  const fim = useRef<HTMLDivElement>(null)
  const caixa = useRef<HTMLTextAreaElement>(null)
  const botao = useRef<HTMLButtonElement>(null)

  const fechar = useCallback(() => {
    setAberto(false)
    botao.current?.focus()
  }, [])

  useEffect(() => {
    const abrir = (e: Event) => {
      const pergunta = (e as CustomEvent<{ pergunta?: string }>).detail?.pergunta
      if (pergunta) setTexto(pergunta)
      setAberto(true)
    }
    window.addEventListener(EVENTO_ABRIR_ASSISTENTE, abrir)
    return () => window.removeEventListener(EVENTO_ABRIR_ASSISTENTE, abrir)
  }, [])

  // A conversa do dia entra na primeira abertura. Falhar aqui é silencioso: o
  // erro, se houver, aparece no primeiro envio.
  useEffect(() => {
    if (!aberto || carregou) return
    let ativo = true
    fetch('/api/chat', { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => (r.ok ? (r.json() as Promise<{ mensagens?: { papel: string; texto: string }[] }>) : null))
      .then((corpo) => {
        if (!ativo || !corpo?.mensagens) return
        setTurnos((atuais) => (atuais.length === 0 ? turnosDaConversa(corpo.mensagens!) : atuais))
      })
      .catch(() => undefined)
      .finally(() => {
        if (ativo) setCarregou(true)
      })
    return () => {
      ativo = false
    }
  }, [aberto, carregou])

  useEffect(() => {
    if (!aberto) return
    caixa.current?.focus()
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fechar()
    }
    document.addEventListener('keydown', aoTeclar)
    return () => document.removeEventListener('keydown', aoTeclar)
  }, [aberto, fechar])

  useEffect(() => {
    fim.current?.scrollIntoView({ block: 'end' })
  }, [turnos, enviando, erro])

  const enviar = async (pergunta = texto.trim()) => {
    if (pergunta.length === 0 || enviando) return
    setEnviando(true)
    setErro(null)
    setTurnos((atuais) => [...atuais, { de: 'eu', texto: pergunta }])
    setTexto('')
    try {
      // Same-origin com JSON declarado: a rota recusa (403/415) qualquer outra
      // coisa desde a Onda 1 — o `credentials` é o padrão do fetch, mas fica
      // escrito para ninguém trocar por `include` sem ver o porquê.
      const resposta = await fetch('/api/chat', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ texto: pergunta }),
      })
      const corpo = (await resposta.json().catch(() => ({}))) as { texto?: string; erro?: string }
      if (resposta.ok && corpo.texto) setTurnos((atuais) => [...atuais, { de: 'assistente', texto: corpo.texto! }])
      else setErro(mensagemDeRecusa(resposta.status, corpo.erro))
    } catch {
      // Rede caiu no meio: a pessoa perdeu a conexão, não é defeito do produto.
      setErro(mensagemDeRecusa(0, 'indisponivel'))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <>
      <button
        ref={botao}
        type="button"
        className={s.flutuante}
        aria-label="Abrir o Sixth Man AI"
        aria-expanded={aberto}
        onClick={() => setAberto(true)}
        hidden={aberto}
      >
        <IconeAssistente tamanho={24} />
      </button>

      {aberto && (
        <>
          <div className={s.veu} onClick={fechar} aria-hidden />
          <aside className={s.gaveta} role="dialog" aria-modal="true" aria-labelledby="titulo-assistente">
            <header className={s.topo}>
              <span className={s.selo} aria-hidden>
                <IconeAssistente tamanho={20} />
              </span>
              <div className={s.topoTexto}>
                <h2 id="titulo-assistente">Sixth Man AI</h2>
                <p>Pergunte sobre a lista, os jogadores ou a metodologia.</p>
              </div>
              <button type="button" className={s.fechar} aria-label="Fechar o Sixth Man AI" onClick={fechar}>
                <IconeFechar />
              </button>
            </header>

            <div className={s.conversa} aria-live="polite">
              {turnos.length === 0 && carregou && (
                <div className={s.inicio}>
                  <p className={s.convite}>Comece com uma destas ou escreva a sua:</p>
                  <ul className={s.sugestoes}>
                    {SUGESTOES.map((q) => (
                      <li key={q}>
                        <button type="button" onClick={() => void enviar(q)}>
                          {q}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {turnos.map((t, i) => (
                <p key={i} className={t.de === 'eu' ? s.meu : s.dele}>
                  {t.texto}
                </p>
              ))}
              {enviando && <p className={`${s.dele} ${s.pensando}`}>Pensando…</p>}
              {erro !== null && (
                <p className={s.erro} role="alert">
                  {erro}
                </p>
              )}
              <div ref={fim} />
            </div>

            <form
              className={s.envio}
              onSubmit={(e) => {
                e.preventDefault()
                void enviar()
              }}
            >
              <label htmlFor="pergunta-assistente" className="so-leitor">
                Sua pergunta
              </label>
              <textarea
                id="pergunta-assistente"
                ref={caixa}
                className={s.caixa}
                value={texto}
                maxLength={LIMITE_PERGUNTA}
                rows={2}
                placeholder="Pergunte sobre a lista de hoje"
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void enviar()
                  }
                }}
              />
              <div className={s.rodape}>
                <span className={`${s.contador} num`}>
                  {texto.length}/{LIMITE_PERGUNTA}
                </span>
                <button type="submit" className={s.enviar} disabled={enviando || texto.trim().length === 0}>
                  Enviar
                </button>
              </div>
            </form>
          </aside>
        </>
      )}
    </>
  )
}
