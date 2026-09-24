'use client'

import { useState, useTransition, type FormEvent } from 'react'
import type { AtributoAlerta, EstadoExperiencia, Intensidade } from '@/modules/plataforma/experiencia/contrato'
import { definirAcompanhamentoDaConta, definirAlerta, salvarPreferencias } from './acoes-experiencia'
import s from './Conta.module.css'

type ItemNomeado = { id: string; nome: string }

const ATRIBUTOS: { id: AtributoAlerta; rotulo: string }[] = [
  { id: 'PONTOS', rotulo: 'Pontos' },
  { id: 'REBOTES', rotulo: 'Rebotes' },
  { id: 'ASSISTENCIAS', rotulo: 'Assistências' },
]

const INTENSIDADES: { id: Intensidade; rotulo: string }[] = [
  { id: 'REDUZIDAS', rotulo: 'Reduzido' },
  { id: 'PADRAO', rotulo: 'Padrão' },
  { id: 'INTENSAS', rotulo: 'Intenso' },
]

/** O mesmo tom curto do apito do Ao Vivo, para testar o volume escolhido. */
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

/**
 * Movimento, som e filtros de alerta. As preferências são dado da PESSOA, não
 * conteúdo pago: ficam visíveis também no plano grátis.
 */
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
  const [mensagem, setMensagem] = useState('')
  const [salvando, iniciar] = useTransition()
  const p = estado.preferencias

  const mudar = (parcial: Partial<EstadoExperiencia['preferencias']>) =>
    setEstado((atual) => ({ ...atual, preferencias: { ...atual.preferencias, ...parcial } }))

  const salvar = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault()
    setMensagem('')
    iniciar(async () => {
      const r = await salvarPreferencias(estado.preferencias)
      setMensagem(r.ok ? 'Preferências salvas.' : (r.mensagem ?? 'Não foi possível salvar.'))
    })
  }

  // Otimista: a tela muda na hora e volta atrás só se o servidor recusar.
  const alternarAlerta = (tipo: 'JOGADOR' | 'ATRIBUTO', id: string, silenciado: boolean) => {
    const antes = estado
    setEstado((atual) => ({
      ...atual,
      jogadoresSilenciados:
        tipo === 'JOGADOR'
          ? silenciado
            ? [...new Set([...atual.jogadoresSilenciados, id])]
            : atual.jogadoresSilenciados.filter((i) => i !== id)
          : atual.jogadoresSilenciados,
      atributosSilenciados:
        tipo === 'ATRIBUTO'
          ? silenciado
            ? [...new Set([...atual.atributosSilenciados, id as AtributoAlerta])]
            : atual.atributosSilenciados.filter((i) => i !== id)
          : atual.atributosSilenciados,
    }))
    iniciar(async () => {
      const r = await definirAlerta({ tipo, id, silenciado })
      if (!r.ok) setEstado(antes)
      setMensagem(r.ok ? 'Filtro de alerta atualizado.' : (r.mensagem ?? 'Não foi possível salvar.'))
    })
  }

  const deixarDeAcompanhar = (tipo: 'JOGADOR' | 'TIME', id: string) => {
    const antes = estado
    setEstado((atual) => ({
      ...atual,
      jogadoresAcompanhados: tipo === 'JOGADOR' ? atual.jogadoresAcompanhados.filter((i) => i !== id) : atual.jogadoresAcompanhados,
      timesAcompanhados: tipo === 'TIME' ? atual.timesAcompanhados.filter((i) => i !== id) : atual.timesAcompanhados,
    }))
    iniciar(async () => {
      const r = await definirAcompanhamentoDaConta({ tipo, id, acompanhar: false })
      if (!r.ok) setEstado(antes)
      setMensagem(r.ok ? 'Acompanhamento atualizado.' : (r.mensagem ?? 'Não foi possível salvar.'))
    })
  }

  const acompanhados = jogadores.filter((j) => estado.jogadoresAcompanhados.includes(j.id))
  const soSilenciados = jogadores.filter(
    (j) => estado.jogadoresSilenciados.includes(j.id) && !estado.jogadoresAcompanhados.includes(j.id),
  )
  const timesVisiveis = times.filter((t) => estado.timesAcompanhados.includes(t.id))

  return (
    <div className={s.pilha}>
      <form onSubmit={salvar} className={s.subbloco}>
        <fieldset className={s.grupo}>
          <legend className={s.rotulo}>Movimento no Ao Vivo</legend>
          <div className={s.segmentado} role="radiogroup">
            {INTENSIDADES.map((i) => (
              <label key={i.id} className={s.segmento} data-ativo={p.intensidade === i.id}>
                <input
                  type="radio"
                  name="intensidade"
                  value={i.id}
                  checked={p.intensidade === i.id}
                  onChange={() => mudar({ intensidade: i.id })}
                  className="so-leitor"
                />
                {i.rotulo}
              </label>
            ))}
          </div>
        </fieldset>
        <label className={s.alternar}>
          <span>
            <strong>Som do apito no app</strong>
            <span className={s.ajuda}>Toca quando um apito chega com o app aberto.</span>
          </span>
          <input type="checkbox" role="switch" checked={p.somHabilitado} onChange={(e) => mudar({ somHabilitado: e.target.checked })} className={s.chave} />
        </label>
        <div className={s.campo}>
          <label htmlFor="volume" className={s.rotulo}>
            Volume · <span className="num">{p.volume}%</span>
          </label>
          <input
            id="volume"
            type="range"
            min="0"
            max="100"
            step="5"
            value={p.volume}
            disabled={!p.somHabilitado}
            onChange={(e) => mudar({ volume: Number(e.target.value) })}
            className={s.faixa}
          />
        </div>
        <label className={s.alternar}>
          <span>
            <strong>Alertar apenas jogadores acompanhados</strong>
            <span className={s.ajuda}>
              Filtra apitos e greens identificados. O aviso geral da Lista Secreta continua controlado
              pelo canal próprio.
            </span>
          </span>
          <input type="checkbox" role="switch" checked={p.apenasAcompanhados} onChange={(e) => mudar({ apenasAcompanhados: e.target.checked })} className={s.chave} />
        </label>
        <div className={s.acoesLinha}>
          <button type="submit" disabled={salvando} className={s.botaoPrimario}>
            {salvando ? 'Salvando…' : 'Salvar preferências'}
          </button>
          <button
            type="button"
            className={s.botaoSecundario}
            disabled={!p.somHabilitado || p.volume === 0}
            onClick={async () => {
              const tocou = await testarSom(p.volume)
              setMensagem(tocou ? 'Som de teste reproduzido.' : 'O navegador não liberou o áudio.')
            }}
          >
            Testar som
          </button>
        </div>
      </form>

      <fieldset className={`${s.subbloco} ${s.grupo}`}>
        <legend className={s.rotulo}>Não alertar por atributo</legend>
        <div className={s.chips}>
          {ATRIBUTOS.map((a) => {
            const silenciado = estado.atributosSilenciados.includes(a.id)
            return (
              <label key={a.id} className={s.chip} data-ativo={silenciado}>
                <input type="checkbox" checked={silenciado} onChange={(e) => alternarAlerta('ATRIBUTO', a.id, e.target.checked)} className="so-leitor" />
                {a.rotulo}
              </label>
            )
          })}
        </div>
      </fieldset>

      <div className={s.subbloco}>
        <p className={s.rotulo}>Jogadores acompanhados</p>
        {acompanhados.length === 0 ? (
          <p className={s.vazio}>Você ainda não acompanha jogadores.</p>
        ) : (
          <ul className={s.lista}>
            {acompanhados.map((j) => {
              const silenciado = estado.jogadoresSilenciados.includes(j.id)
              return (
                <li key={j.id} className={s.itemLista}>
                  <span>{j.nome}</span>
                  <span className={s.acoesItem}>
                    <button type="button" className={s.botaoTexto} onClick={() => alternarAlerta('JOGADOR', j.id, !silenciado)}>
                      {silenciado ? 'Reativar alertas' : 'Silenciar alertas'}
                    </button>
                    <button type="button" className={s.botaoTexto} onClick={() => deixarDeAcompanhar('JOGADOR', j.id)}>
                      Deixar de acompanhar
                    </button>
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className={s.subbloco}>
        <p className={s.rotulo}>Times acompanhados</p>
        {timesVisiveis.length === 0 ? (
          <p className={s.vazio}>Você ainda não acompanha times.</p>
        ) : (
          <ul className={s.lista}>
            {timesVisiveis.map((t) => (
              <li key={t.id} className={s.itemLista}>
                <span>{t.nome}</span>
                <button type="button" className={s.botaoTexto} onClick={() => deixarDeAcompanhar('TIME', t.id)}>
                  Deixar de acompanhar
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {soSilenciados.length > 0 && (
        <div className={s.subbloco}>
          <p className={s.rotulo}>Alertas silenciados</p>
          <ul className={s.lista}>
            {soSilenciados.map((j) => (
              <li key={j.id} className={s.itemLista}>
                <span>{j.nome}</span>
                <button type="button" className={s.botaoTexto} onClick={() => alternarAlerta('JOGADOR', j.id, false)}>
                  Reativar alertas
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p role="status" aria-live="polite" className={s.status}>
        {mensagem}
      </p>
    </div>
  )
}
