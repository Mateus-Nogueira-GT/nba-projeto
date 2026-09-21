'use client'

import { useActionState } from 'react'

import { salvarCandidato, type EstadoCandidato } from './acoes'
import { semantico } from '@/design-system/tokens/semantico'

const INICIAL: EstadoCandidato = { erro: null }

export function FormularioCandidato() {
  const [estado, agir, pendente] = useActionState(salvarCandidato, INICIAL)

  return (
    <form action={agir} style={{ display: 'grid', gap: 8, maxWidth: 560 }}>
      <label>
        Versão (rótulo)
        <br />
        <input name="versao" placeholder="candidato-delta-7" required />
      </label>
      <label>
        YAML completo do ruleset
        <br />
        <textarea
          name="conteudoYaml"
          rows={10}
          required
          style={{ width: '100%', fontFamily: 'monospace' }}
        />
      </label>
      {estado.erro && <pre style={{ color: semantico.alerta, whiteSpace: 'pre-wrap' }}>{estado.erro}</pre>}
      <button type="submit" disabled={pendente}>
        {pendente ? 'Validando…' : 'Salvar candidato'}
      </button>
    </form>
  )
}
