'use client'

import { useEffect, useState } from 'react'

import estilos from './PainelPwa.module.css'
import {
  aplicarAtualizacaoPwa,
  EVENTO_ATUALIZACAO_PWA,
  existeAtualizacaoPwa,
  lerAmbienteInstalacaoPwa,
  registrarEventoPwa,
  type EventoInstalacaoPwa,
} from './pwa-cliente'

type Estado =
  | 'carregando'
  | 'oculto'
  | 'instalavel'
  | 'manual'
  | 'manual-ios'
  | 'nao-suportado'
  | 'instalando'
  | 'atualizacao'
  | 'atualizando'
  | 'erro-instalacao'
  | 'erro-atualizacao'

export function PainelPwa() {
  const [estado, setEstado] = useState<Estado>('carregando')
  const [eventoInstalacao, setEventoInstalacao] = useState<EventoInstalacaoPwa | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let ativo = true

    const avaliar = async () => {
      if (await existeAtualizacaoPwa()) {
        if (ativo) setEstado('atualizacao')
        return
      }

      const ambiente = lerAmbienteInstalacaoPwa()
      if (!ativo) return
      if (ambiente.instalado) setEstado('oculto')
      else if (!ambiente.contextoSeguro || !ambiente.serviceWorker) setEstado('nao-suportado')
      else if (ambiente.iosComInstalacaoManual) setEstado('manual-ios')
      else setEstado('manual')
    }

    const timer = window.setTimeout(() => void avaliar(), 0)
    const aoOferecerInstalacao = (evento: Event) => {
      evento.preventDefault()
      setEventoInstalacao(evento as EventoInstalacaoPwa)
      setEstado('instalavel')
      registrarEventoPwa('CONVITE_EXIBIDO')
    }
    const aoInstalar = () => {
      setEventoInstalacao(null)
      setEstado('oculto')
      registrarEventoPwa('INSTALADO')
    }
    const aoAtualizar = () => {
      setEstado('atualizacao')
      registrarEventoPwa('ATUALIZACAO_DISPONIVEL')
    }

    window.addEventListener('beforeinstallprompt', aoOferecerInstalacao)
    window.addEventListener('appinstalled', aoInstalar)
    window.addEventListener(EVENTO_ATUALIZACAO_PWA, aoAtualizar)
    return () => {
      ativo = false
      window.clearTimeout(timer)
      window.removeEventListener('beforeinstallprompt', aoOferecerInstalacao)
      window.removeEventListener('appinstalled', aoInstalar)
      window.removeEventListener(EVENTO_ATUALIZACAO_PWA, aoAtualizar)
    }
  }, [])

  async function instalar() {
    if (!eventoInstalacao) return
    setErro(null)
    setEstado('instalando')
    try {
      await eventoInstalacao.prompt()
      const escolha = await eventoInstalacao.userChoice
      setEventoInstalacao(null)
      if (escolha.outcome === 'accepted') {
        registrarEventoPwa('PROMPT_ACEITO')
        setEstado('oculto')
      } else {
        registrarEventoPwa('PROMPT_RECUSADO')
        setEstado('manual')
      }
    } catch {
      setErro('O navegador não conseguiu abrir a instalação. Tente novamente pelo menu.')
      setEstado('erro-instalacao')
    }
  }

  async function atualizar() {
    setErro(null)
    setEstado('atualizando')
    try {
      await aplicarAtualizacaoPwa()
      registrarEventoPwa('ATUALIZACAO_APLICADA')
    } catch {
      setErro('A atualização não pôde ser aplicada agora. Recarregue a página e tente novamente.')
      setEstado('erro-atualizacao')
    }
  }

  if (estado === 'carregando' || estado === 'oculto') return null

  const atualizacao =
    estado === 'atualizacao' || estado === 'atualizando' || estado === 'erro-atualizacao'
  const instalacao =
    estado === 'instalavel' || estado === 'instalando' || estado === 'erro-instalacao'

  return (
    <section className={estilos.painel} aria-labelledby="titulo-pwa">
      <div className={estilos.cabecalho}>
        <span className={estilos.icone} aria-hidden="true">
          ◉
        </span>
        <div>
          <h2 id="titulo-pwa" className={estilos.titulo}>
            {atualizacao ? 'Atualização disponível' : 'Instale a IA da NBA'}
          </h2>
          <p className={estilos.texto}>
            {atualizacao
              ? 'A nova versão será aplicada com uma recarga controlada.'
              : 'Abra mais rápido e use em tela cheia, sem depender de loja.'}
          </p>
        </div>
      </div>

      {estado === 'manual-ios' && (
        <ol className={estilos.passos}>
          <li>Toque em Compartilhar.</li>
          <li>Escolha “Adicionar à Tela de Início”.</li>
          <li>Abra o app pelo novo ícone.</li>
        </ol>
      )}

      {estado === 'manual' && (
        <p className={estilos.estado} role="status">
          Use a opção “Instalar app” ou “Adicionar à tela inicial” no menu do navegador.
        </p>
      )}

      {estado === 'nao-suportado' && (
        <p className={estilos.estado} role="status">
          A instalação exige um navegador compatível e uma conexão HTTPS.
        </p>
      )}

      {erro && (
        <p className={estilos.estado} role="alert">
          {erro}
        </p>
      )}

      {(instalacao || atualizacao) && (
        <div className={estilos.acoes}>
          <button
            className={estilos.botao}
            type="button"
            disabled={estado === 'instalando' || estado === 'atualizando'}
            onClick={atualizacao ? atualizar : instalar}
          >
            {estado === 'instalando'
              ? 'Abrindo instalação…'
              : estado === 'atualizando'
                ? 'Atualizando…'
                : instalacao
                  ? 'Instalar app'
                  : 'Atualizar agora'}
          </button>
        </div>
      )}
    </section>
  )
}
