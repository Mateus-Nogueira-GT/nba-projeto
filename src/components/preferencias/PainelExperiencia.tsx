'use client'

import { useState, type FormEvent } from 'react'

import type {
  AtributoAlerta,
  EstadoExperiencia,
  Intensidade,
} from '@/modules/plataforma/experiencia/contrato'

type ItemNomeado = { id: string; nome: string }

const ATRIBUTOS: { id: AtributoAlerta; rotulo: string }[] = [
  { id: 'PONTOS', rotulo: 'Pontos' },
  { id: 'REBOTES', rotulo: 'Rebotes' },
  { id: 'ASSISTENCIAS', rotulo: 'Assistências' },
]

const caixa = {
  border: '1px solid var(--divisor)',
  borderRadius: 12,
  padding: 12,
  background: 'var(--superficie)',
} as const

async function mutar(url: string, method: 'PATCH' | 'PUT', corpo: unknown) {
  const resposta = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(corpo),
  })
  if (!resposta.ok) throw new Error('Não foi possível salvar a preferência.')
  return (await resposta.json()) as { estado: EstadoExperiencia }
}

async function testarSom(volume: number): Promise<boolean> {
  if (typeof AudioContext === 'undefined') return false

  try {
    const contexto = new AudioContext()
    await contexto.resume()
    if (contexto.state !== 'running') {
      await contexto.close()
      return false
    }

    const inicio = contexto.currentTime
    const ganho = contexto.createGain()
    ganho.gain.setValueAtTime(0.0001, inicio)
    ganho.gain.exponentialRampToValueAtTime(Math.max(0.015, volume / 500), inicio + 0.015)
    ganho.gain.exponentialRampToValueAtTime(0.0001, inicio + 0.24)
    ganho.connect(contexto.destination)
    const oscilador = contexto.createOscillator()
    oscilador.frequency.setValueAtTime(980, inicio)
    oscilador.connect(ganho)
    oscilador.addEventListener('ended', () => void contexto.close(), { once: true })
    oscilador.start(inicio)
    oscilador.stop(inicio + 0.24)
    return true
  } catch {
    return false
  }
}

export function PainelExperiencia({
  inicial,
  jogadores,
  times,
}: {
  inicial: EstadoExperiencia
  jogadores: ItemNomeado[]
  times: ItemNomeado[]
}) {
  const [estado, setEstado] = useState(inicial)
  const [salvando, setSalvando] = useState(false)
  const [mensagem, setMensagem] = useState('')

  const salvarPreferencias = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    setSalvando(true)
    setMensagem('')
    try {
      const resposta = await mutar('/api/preferencias/experiencia', 'PATCH', estado.preferencias)
      setEstado(resposta.estado)
      setMensagem('Preferências salvas.')
    } catch (erro) {
      setMensagem(erro instanceof Error ? erro.message : 'Não foi possível salvar.')
    } finally {
      setSalvando(false)
    }
  }

  const definirAlerta = async (tipo: 'JOGADOR' | 'ATRIBUTO', id: string, silenciado: boolean) => {
    const antes = estado
    setEstado((atual) => ({
      ...atual,
      jogadoresSilenciados:
        tipo === 'JOGADOR'
          ? silenciado
            ? [...new Set([...atual.jogadoresSilenciados, id])]
            : atual.jogadoresSilenciados.filter((item) => item !== id)
          : atual.jogadoresSilenciados,
      atributosSilenciados:
        tipo === 'ATRIBUTO'
          ? silenciado
            ? [...new Set([...atual.atributosSilenciados, id as AtributoAlerta])]
            : atual.atributosSilenciados.filter((item) => item !== id)
          : atual.atributosSilenciados,
    }))
    try {
      const resposta = await mutar('/api/preferencias/alertas', 'PUT', { tipo, id, silenciado })
      setEstado(resposta.estado)
      setMensagem('Filtro de alerta atualizado.')
    } catch (erro) {
      setEstado(antes)
      setMensagem(erro instanceof Error ? erro.message : 'Não foi possível salvar.')
    }
  }

  const deixarDeAcompanhar = async (tipo: 'JOGADOR' | 'TIME', id: string) => {
    const antes = estado
    setEstado((atual) => ({
      ...atual,
      jogadoresAcompanhados:
        tipo === 'JOGADOR'
          ? atual.jogadoresAcompanhados.filter((item) => item !== id)
          : atual.jogadoresAcompanhados,
      timesAcompanhados:
        tipo === 'TIME'
          ? atual.timesAcompanhados.filter((item) => item !== id)
          : atual.timesAcompanhados,
    }))
    try {
      const resposta = await mutar('/api/preferencias/acompanhamento', 'PUT', {
        tipo,
        id,
        acompanhar: false,
      })
      setEstado(resposta.estado)
      setMensagem('Acompanhamento atualizado.')
    } catch (erro) {
      setEstado(antes)
      setMensagem(erro instanceof Error ? erro.message : 'Não foi possível salvar.')
    }
  }

  const jogadoresVisiveis = jogadores.filter(
    (jogador) =>
      estado.jogadoresAcompanhados.includes(jogador.id) ||
      estado.jogadoresSilenciados.includes(jogador.id),
  )
  const timesVisiveis = times.filter((time) => estado.timesAcompanhados.includes(time.id))

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <form onSubmit={salvarPreferencias} style={{ ...caixa, display: 'grid', gap: 12 }}>
        <label style={{ display: 'grid', gap: 5 }}>
          <span>Movimento no Ao Vivo</span>
          <select
            value={estado.preferencias.intensidade}
            onChange={(evento) =>
              setEstado((atual) => ({
                ...atual,
                preferencias: {
                  ...atual.preferencias,
                  intensidade: evento.target.value as Intensidade,
                },
              }))
            }
          >
            <option value="REDUZIDAS">Reduzido</option>
            <option value="PADRAO">Padrão</option>
            <option value="INTENSAS">Intenso</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={estado.preferencias.somHabilitado}
            onChange={(evento) =>
              setEstado((atual) => ({
                ...atual,
                preferencias: { ...atual.preferencias, somHabilitado: evento.target.checked },
              }))
            }
          />{' '}
          Som do apito no app
        </label>
        <label style={{ display: 'grid', gap: 5 }}>
          <span>Volume · {estado.preferencias.volume}%</span>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={estado.preferencias.volume}
            onChange={(evento) =>
              setEstado((atual) => ({
                ...atual,
                preferencias: { ...atual.preferencias, volume: Number(evento.target.value) },
              }))
            }
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={estado.preferencias.apenasAcompanhados}
            onChange={(evento) =>
              setEstado((atual) => ({
                ...atual,
                preferencias: { ...atual.preferencias, apenasAcompanhados: evento.target.checked },
              }))
            }
          />{' '}
          Alertar apenas jogadores acompanhados
        </label>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--texto55)' }}>
          Essa opção filtra apitos e greens identificados. O aviso geral da Lista Secreta continua
          controlado pelo canal próprio.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="submit" disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar preferências'}
          </button>
          <button
            type="button"
            disabled={!estado.preferencias.somHabilitado || estado.preferencias.volume === 0}
            onClick={async () => {
              const tocou = await testarSom(estado.preferencias.volume)
              setMensagem(tocou ? 'Som de teste reproduzido.' : 'O navegador não liberou o áudio.')
            }}
          >
            Testar som
          </button>
        </div>
      </form>

      <div style={caixa}>
        <strong>Não alertar por atributo</strong>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
          {ATRIBUTOS.map((atributo) => (
            <label key={atributo.id}>
              <input
                type="checkbox"
                checked={estado.atributosSilenciados.includes(atributo.id)}
                onChange={(evento) =>
                  void definirAlerta('ATRIBUTO', atributo.id, evento.target.checked)
                }
              />{' '}
              {atributo.rotulo}
            </label>
          ))}
        </div>
      </div>

      <div style={caixa}>
        <strong>Jogadores acompanhados</strong>
        {estado.jogadoresAcompanhados.length === 0 ? (
          <p style={{ marginBottom: 0, color: 'var(--texto-secundario)' }}>
            Você ainda não acompanha jogadores.
          </p>
        ) : (
          jogadoresVisiveis
            .filter((jogador) => estado.jogadoresAcompanhados.includes(jogador.id))
            .map((jogador) => (
              <div
                key={jogador.id}
                style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 8 }}
              >
                <span>{jogador.nome}</span>
                <span style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    onClick={() =>
                      void definirAlerta(
                        'JOGADOR',
                        jogador.id,
                        !estado.jogadoresSilenciados.includes(jogador.id),
                      )
                    }
                  >
                    {estado.jogadoresSilenciados.includes(jogador.id)
                      ? 'Reativar alertas'
                      : 'Silenciar alertas'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void deixarDeAcompanhar('JOGADOR', jogador.id)}
                  >
                    Deixar de acompanhar
                  </button>
                </span>
              </div>
            ))
        )}
      </div>

      <div style={caixa}>
        <strong>Times acompanhados</strong>
        {timesVisiveis.length === 0 ? (
          <p style={{ marginBottom: 0, color: 'var(--texto-secundario)' }}>
            Você ainda não acompanha times.
          </p>
        ) : (
          timesVisiveis.map((time) => (
            <div
              key={time.id}
              style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 8 }}
            >
              <span>{time.nome}</span>
              <button type="button" onClick={() => void deixarDeAcompanhar('TIME', time.id)}>
                Deixar de acompanhar
              </button>
            </div>
          ))
        )}
      </div>

      {jogadoresVisiveis.some(
        (jogador) =>
          estado.jogadoresSilenciados.includes(jogador.id) &&
          !estado.jogadoresAcompanhados.includes(jogador.id),
      ) && (
        <div style={caixa}>
          <strong>Alertas silenciados</strong>
          {jogadoresVisiveis
            .filter(
              (jogador) =>
                estado.jogadoresSilenciados.includes(jogador.id) &&
                !estado.jogadoresAcompanhados.includes(jogador.id),
            )
            .map((jogador) => (
              <div
                key={jogador.id}
                style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 8 }}
              >
                <span>{jogador.nome}</span>
                <button
                  type="button"
                  onClick={() => void definirAlerta('JOGADOR', jogador.id, false)}
                >
                  Reativar alertas
                </button>
              </div>
            ))}
        </div>
      )}

      {mensagem && (
        <p role="status" style={{ margin: 0, fontSize: 13 }}>
          {mensagem}
        </p>
      )}
    </div>
  )
}
