'use client'

import { useState } from 'react'
import s from './Formulario.module.css'

/** Campo de senha com o olho de mostrar/ocultar. */
export function CampoSenha({
  id,
  nome,
  autoComplete,
  minLength,
  descritoPor,
  placeholder,
}: {
  id: string
  nome: string
  autoComplete: 'current-password' | 'new-password'
  minLength?: number
  descritoPor?: string
  placeholder?: string
}) {
  const [visivel, setVisivel] = useState(false)
  return (
    <div className={s.comBotao}>
      <input
        id={id}
        name={nome}
        type={visivel ? 'text' : 'password'}
        required
        autoComplete={autoComplete}
        minLength={minLength}
        maxLength={128}
        aria-describedby={descritoPor}
        placeholder={placeholder}
        className={s.entrada}
      />
      <button
        type="button"
        className={s.olho}
        onClick={() => setVisivel((v) => !v)}
        aria-label={visivel ? 'Ocultar senha' : 'Mostrar senha'}
        aria-pressed={visivel}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
          {visivel && <path d="M3 3l18 18" />}
        </svg>
      </button>
    </div>
  )
}
