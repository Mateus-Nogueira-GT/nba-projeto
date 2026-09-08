'use client'

import { useEffect, useState } from 'react'

import estilos from './AtivarAlertas.module.css'
import {
  atualizarPreferenciaPush,
  CANAIS_ALERTA,
  ErroClientePush,
  inscreverPush,
  lerPreferenciasPush,
  lerAmbientePush,
  removerVinculoPush,
  type AmbientePush,
  type CanalAlerta,
  type PreferenciasAlerta,
} from './push-cliente'

type Estado =
  | 'carregando'
  | 'convite'
  | 'pronto'
  | 'instrucoes-ios'
  | 'processando'
  | 'ativo'
  | 'negado'
  | 'nao-suportado'
  | 'indisponivel'
  | 'erro'

export type AtivarAlertasProps = {
  chavePublicaVapid?: string
}

function mensagemDeErro(erro: unknown): string {
  return erro instanceof ErroClientePush
    ? erro.message
    : 'Não foi possível concluir. Tente novamente em alguns instantes.'
}

export function AtivarAlertas({
  chavePublicaVapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
}: AtivarAlertasProps) {
  const [estado, setEstado] = useState<Estado>('carregando')
  const [ambiente, setAmbiente] = useState<AmbientePush | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [preferencias, setPreferencias] = useState<PreferenciasAlerta | null>(null)

  useEffect(() => {
    const timerInicial = window.setTimeout(() => {
      const atual = lerAmbientePush()
      setAmbiente(atual)

      if (atual.iosInstalavel && !atual.instalado) {
        setEstado('convite')
      } else if (!atual.suportado) {
        setEstado('nao-suportado')
      } else if (!chavePublicaVapid) {
        setEstado('indisponivel')
      } else if (atual.permissao === 'denied') {
        setEstado('negado')
      } else if (atual.permissao === 'granted') {
        void inscreverPush(chavePublicaVapid)
          .then(async () => {
            setPreferencias(await lerPreferenciasPush())
            setEstado('ativo')
          })
          .catch(() => setEstado('pronto'))
      } else {
        setEstado('convite')
      }
    }, 0)

    return () => {
      window.clearTimeout(timerInicial)
    }
  }, [chavePublicaVapid])

  function demonstrarInteresse() {
    if (ambiente?.iosInstalavel && !ambiente.instalado) {
      setEstado('instrucoes-ios')
      return
    }
    setEstado('pronto')
  }

  async function ativar() {
    if (!chavePublicaVapid) return
    setErro(null)
    setEstado('processando')

    try {
      // Esta chamada só existe dentro do click explícito deste botão. Nenhum
      // effect, montagem ou convite solicita permissão automaticamente.
      const permissao =
        Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()

      if (permissao === 'denied') {
        setEstado('negado')
        return
      }
      if (permissao !== 'granted') {
        setEstado('pronto')
        return
      }

      await inscreverPush(chavePublicaVapid)
      setPreferencias(await lerPreferenciasPush())
      setEstado('ativo')
    } catch (causa) {
      setErro(mensagemDeErro(causa))
      setEstado('erro')
    }
  }

  async function alternarPreferencia(canal: CanalAlerta) {
    if (!preferencias) return
    setErro(null)
    try {
      setPreferencias(await atualizarPreferenciaPush(canal, !preferencias[canal]))
    } catch (causa) {
      setErro(mensagemDeErro(causa))
    }
  }

  async function desativar() {
    setErro(null)
    setEstado('processando')
    try {
      await removerVinculoPush()
      setEstado('pronto')
    } catch (causa) {
      setErro(mensagemDeErro(causa))
      setEstado('erro')
    }
  }

  if (estado === 'carregando') return null

  return (
    <section className={estilos.painel} aria-labelledby="titulo-alertas">
      <h2 id="titulo-alertas" className={estilos.titulo}>
        Alertas da NIP
      </h2>

      {estado === 'convite' && (
        <>
          <p className={estilos.texto}>
            Receba o apito enquanto a entrada ainda está viva. Você escolhe quando ativar.
          </p>
          <div className={estilos.acoes}>
            <button className={estilos.botaoPrimario} type="button" onClick={demonstrarInteresse}>
              Quero receber alertas
            </button>
          </div>
        </>
      )}

      {estado === 'instrucoes-ios' && (
        <>
          <p className={estilos.texto}>
            No iPhone ou iPad, instale o app antes de ativar notificações.
          </p>
          <ol className={estilos.passos}>
            <li>Toque em Compartilhar.</li>
            <li>Escolha “Adicionar à Tela de Início”.</li>
            <li>Abra a NIP pelo novo ícone e volte a esta opção.</li>
          </ol>
        </>
      )}

      {(estado === 'pronto' || estado === 'erro') && (
        <>
          <p className={estilos.texto}>
            Ao continuar, o navegador pedirá sua permissão. Ela pode ser alterada nas configurações.
          </p>
          {erro !== null && (
            <p className={estilos.estado} role="alert">
              {erro}
            </p>
          )}
          <div className={estilos.acoes}>
            <button className={estilos.botaoPrimario} type="button" onClick={ativar}>
              Ativar alertas
            </button>
          </div>
        </>
      )}

      {estado === 'processando' && (
        <p className={estilos.estado} role="status" aria-live="polite">
          Atualizando este dispositivo…
        </p>
      )}

      {estado === 'ativo' && (
        <>
          <p className={estilos.estado} role="status">
            Alertas ativos neste dispositivo.
          </p>
          <div className={estilos.acoes}>
            <button className={estilos.botaoSecundario} type="button" onClick={desativar}>
              Desativar neste dispositivo
            </button>
          </div>
          {preferencias !== null && (
            <fieldset className={estilos.preferencias}>
              <legend>O que você quer receber</legend>
              {CANAIS_ALERTA.map((canal) => (
                <label key={canal} className={estilos.preferencia}>
                  <input
                    type="checkbox"
                    checked={preferencias[canal]}
                    onChange={() => void alternarPreferencia(canal)}
                  />
                  {canal === 'FIRE_LIVE_APITO'
                    ? 'Apitos Fire Live'
                    : canal === 'GREEN'
                      ? 'Greens confirmados'
                      : 'Lista Secreta'}
                </label>
              ))}
            </fieldset>
          )}
          {erro !== null && (
            <p className={estilos.estado} role="alert">
              {erro}
            </p>
          )}
        </>
      )}

      {estado === 'negado' && (
        <p className={estilos.estado} role="status">
          As notificações estão bloqueadas. Reative a permissão nas configurações do navegador ou do
          app; não vamos pedir novamente automaticamente.
        </p>
      )}

      {estado === 'nao-suportado' && (
        <p className={estilos.estado} role="status">
          Este navegador ou contexto não oferece Web Push. Em iPhone e iPad, abra o app instalado
          pela Tela de Início.
        </p>
      )}

      {estado === 'indisponivel' && (
        <p className={estilos.estado} role="status">
          Alertas ainda não estão disponíveis neste ambiente.
        </p>
      )}
    </section>
  )
}
