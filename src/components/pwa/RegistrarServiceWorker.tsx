'use client'

import { useEffect } from 'react'

import { CHAVE_ATUALIZACAO_SOLICITADA, EVENTO_ATUALIZACAO_PWA } from './pwa-cliente'
import { CAMINHO_SERVICE_WORKER, ESCOPO_SERVICE_WORKER } from './push-cliente'

/**
 * Registro único do worker compartilhado pelas Specs 02 e 03.
 *
 * Este componente não pede permissão e não instala Push. Ele pode ser montado
 * no layout quando a fundação PWA for integrada sem violar o gesto obrigatório.
 */
export function RegistrarServiceWorker() {
  useEffect(() => {
    // O dev server reutiliza caminhos de assets durante HMR; cacheá-los faria
    // o navegador servir CSS/JS antigos. A PWA é exercitada em `next start`.
    if (process.env.NODE_ENV !== 'production') return
    if (!window.isSecureContext || !('serviceWorker' in navigator)) return

    let registro: ServiceWorkerRegistration | null = null

    const anunciarAtualizacao = () => {
      window.dispatchEvent(new Event(EVENTO_ATUALIZACAO_PWA))
    }
    const observarInstalacao = (instalacao: ServiceWorker | null) => {
      if (!instalacao) return
      instalacao.addEventListener('statechange', () => {
        if (instalacao.state === 'installed' && navigator.serviceWorker.controller) {
          anunciarAtualizacao()
        }
      })
    }
    const verificarAtualizacao = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        void registro?.update().catch(() => {
          console.error('Falha ao verificar atualização da aplicação.')
        })
      }
    }
    const aoTrocarControlador = () => {
      if (sessionStorage.getItem(CHAVE_ATUALIZACAO_SOLICITADA) !== '1') return
      sessionStorage.removeItem(CHAVE_ATUALIZACAO_SOLICITADA)
      window.location.reload()
    }

    navigator.serviceWorker.addEventListener('controllerchange', aoTrocarControlador)
    window.addEventListener('online', verificarAtualizacao)
    document.addEventListener('visibilitychange', verificarAtualizacao)

    void navigator.serviceWorker
      .register(CAMINHO_SERVICE_WORKER, {
        scope: ESCOPO_SERVICE_WORKER,
        updateViaCache: 'none',
      })
      .then((novoRegistro) => {
        registro = novoRegistro
        if (novoRegistro.waiting && navigator.serviceWorker.controller) anunciarAtualizacao()
        observarInstalacao(novoRegistro.installing)
        novoRegistro.addEventListener('updatefound', () =>
          observarInstalacao(novoRegistro.installing),
        )
      })
      .catch(() => {
        // Não inclui URL, inscrição nem chaves. O erro permanece observável no
        // cliente sem transformar material do dispositivo em telemetria.
        console.error('Falha ao registrar o service worker da aplicação.')
      })

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', aoTrocarControlador)
      window.removeEventListener('online', verificarAtualizacao)
      document.removeEventListener('visibilitychange', verificarAtualizacao)
    }
  }, [])

  return null
}
