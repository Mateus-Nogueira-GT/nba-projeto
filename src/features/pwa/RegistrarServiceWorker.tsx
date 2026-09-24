'use client'

import { useEffect } from 'react'
import {
  CAMINHO_SERVICE_WORKER,
  CHAVE_ATUALIZACAO_SOLICITADA,
  ESCOPO_SERVICE_WORKER,
  EVENTO_ATUALIZACAO_PWA,
} from './pwa-cliente'

/**
 * REGISTRO ÚNICO DO SERVICE WORKER, no layout raiz.
 *
 * Sem ele o `public/sw.js` só entraria em cena quando alguém ativasse alertas
 * — e aí o app inteiro ficaria sem cache offline, sem a página `/offline` e
 * sem nenhum caminho para aplicar uma versão nova. O componente não pede
 * permissão e não instala Push: isso continua sendo gesto da pessoa, em
 * `/conta`.
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
      // Só recarrega quando FOI A PESSOA que pediu a troca: uma recarga
      // espontânea no meio da leitura seria a tela sumindo sozinha.
      if (sessionStorage.getItem(CHAVE_ATUALIZACAO_SOLICITADA) !== '1') return
      sessionStorage.removeItem(CHAVE_ATUALIZACAO_SOLICITADA)
      window.location.reload()
    }

    navigator.serviceWorker.addEventListener('controllerchange', aoTrocarControlador)
    window.addEventListener('online', verificarAtualizacao)
    document.addEventListener('visibilitychange', verificarAtualizacao)

    void navigator.serviceWorker
      .register(CAMINHO_SERVICE_WORKER, { scope: ESCOPO_SERVICE_WORKER, updateViaCache: 'none' })
      .then((novoRegistro) => {
        registro = novoRegistro
        if (novoRegistro.waiting && navigator.serviceWorker.controller) anunciarAtualizacao()
        observarInstalacao(novoRegistro.installing)
        novoRegistro.addEventListener('updatefound', () => observarInstalacao(novoRegistro.installing))
      })
      .catch(() => {
        // Não inclui URL, inscrição nem chaves: o erro fica observável sem
        // transformar material do dispositivo em telemetria.
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
