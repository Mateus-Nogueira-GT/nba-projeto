'use client'

import { useActionState } from 'react'

import { salvarCandidato, type EstadoCandidato } from './acoes'

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
      {estado.erro && <pre style={{ color: '#b00020', whiteSpace: 'pre-wrap' }}>{estado.erro}</pre>}
      <button type="submit" disabled={pendente}>
        {pendente ? 'Validando…' : 'Salvar candidato'}
      </button>
    </form>
  )
}
