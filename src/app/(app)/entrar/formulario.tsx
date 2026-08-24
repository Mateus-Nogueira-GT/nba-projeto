'use client'

import { useActionState } from 'react'
import { componente } from '@/design-system/tokens/componente'
import { semantico } from '@/design-system/tokens/semantico'
import { entrar } from './acoes'

/**
 * Impressão do dispositivo.
 *
 * Não é anti-fraude: é o que permite reconhecer "o mesmo celular" entre
 * sessões, para que reentrar não consuma uma das 2 vagas. Quem quer burlar
 * limpa o storage — o bloqueio de conta compartilhada de verdade vem da
 * detecção de uso simultâneo, do lado do servidor.
 */
function impressaoDoDispositivo(): string {
  const CHAVE = 'ia_nba_dispositivo'
  const guardado = localStorage.getItem(CHAVE)
  if (guardado) return guardado

  const nova = crypto.randomUUID()
  localStorage.setItem(CHAVE, nova)
  return nova
}

export function FormularioLogin({ destino }: { destino: string }) {
  // A impressão é lida no MOMENTO do envio, não em efeito: localStorage e
  // navigator só existem no cliente, e guardá-los em estado só criaria uma
  // renderização a mais para chegar no mesmo lugar.
  const [erro, acao, enviando] = useActionState(
    async (estado: string | null, dados: FormData) => {
      dados.set('dispositivo', impressaoDoDispositivo())
      dados.set('ua', navigator.userAgent)
      return entrar(estado, dados)
    },
    null,
  )

  const campo = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 8,
    border: `1px solid ${semantico.divisor}`,
    background: semantico.superficie,
    color: semantico.textoPrimario,
    fontSize: 15,
  } as const

  return (
    <form action={acao} style={{ display: 'grid', gap: 12 }}>
      <input type="hidden" name="destino" value={destino} />

      <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
        E-mail
        <input name="email" type="email" required autoComplete="email" style={campo} />
      </label>

      <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
        Senha
        <input name="senha" type="password" required autoComplete="current-password" style={campo} />
      </label>

      {erro && (
        <p role="alert" style={{ margin: 0, fontSize: 13, color: semantico.alerta }}>
          {erro}
        </p>
      )}

      <button
        type="submit"
        disabled={enviando}
        style={{
          ...campo,
          background: componente.ctaFundo,
          color: semantico.textoSobreCor,
          fontFamily: semantico.fonteTitulo,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          fontWeight: 700,
          cursor: 'pointer',
          border: 'none',
        }}
      >
        {enviando ? 'Entrando…' : 'Entrar'}
      </button>

      <p style={{ margin: 0, fontSize: 11, color: semantico.textoSecundario, lineHeight: 1.5 }}>
        Sua assinatura permite 2 aparelhos ativos. Ao entrar em um terceiro, a sessão mais
        antiga é encerrada.
      </p>
    </form>
  )
}
