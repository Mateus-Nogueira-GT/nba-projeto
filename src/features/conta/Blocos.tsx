import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'
import type { DispositivoDoUsuario } from '@/modules/plataforma/admin/usuarios'
import type { AcessoComNivel } from '@/modules/plataforma/assinatura/direito'
import { ROTULO_DA_MODALIDADE, ROTULO_DO_NIVEL } from '@/modules/plataforma/assinatura/nivel-do-plano'
import { MENSAGEM_REGRA_SENHA } from '@/modules/plataforma/auth/senha'
import type { EstadoExperiencia } from '@/modules/plataforma/experiencia/contrato'
import { atualizarNome, cancelarAssinatura, encerrarDispositivo, escolherAvatar, trocarEmail, trocarSenha } from './acoes'
import { AtivarAlertas } from './AtivarAlertas'
import { AVATARES_PRONTOS } from './avatares'
import type { AssinaturaDaConta } from './carregar'
import { PainelExperiencia } from './PainelExperiencia'
import s from './Conta.module.css'

function Bloco({ titulo, descricao, children }: { titulo: string; descricao?: string; children: ReactNode }) {
  return (
    <section className={s.bloco} aria-labelledby={`bloco-${titulo}`}>
      <header className={s.blocoCabecalho}>
        <h2 id={`bloco-${titulo}`} className={s.blocoTitulo}>
          {titulo}
        </h2>
        {descricao && <p className={s.blocoDescricao}>{descricao}</p>}
      </header>
      {children}
    </section>
  )
}

function dia(quando: Date, fuso: string) {
  return quando.toLocaleDateString('pt-BR', { timeZone: fuso })
}

function diaHora(quando: Date, fuso: string) {
  return quando.toLocaleString('pt-BR', { timeZone: fuso, dateStyle: 'short', timeStyle: 'short' })
}

/**
 * "Próxima cobrança em 5 dias · 27/09/2026". Passada a data, a contagem não
 * tem o que contar e sobra só a data. `agora` entra por parâmetro.
 */
export function proximaCobrancaEmTexto(quando: Date | null, agora: Date, fuso: string): string | null {
  if (!quando) return null
  const dias = Math.ceil((quando.getTime() - agora.getTime()) / 86_400_000)
  if (dias <= 0) return `Próxima cobrança · ${dia(quando, fuso)}`
  return `Próxima cobrança em ${dias} ${dias === 1 ? 'dia' : 'dias'} · ${dia(quando, fuso)}`
}

/** O rosto da CONTA (não o do jogador): foto do catálogo ou iniciais. */
export function AvatarDaConta({ nome, email, fotoUrl, tamanho }: { nome: string | null; email: string; fotoUrl: string | null; tamanho: number }) {
  const partes = (nome ?? '').trim().split(/\s+/).filter(Boolean)
  const iniciais = partes.length > 0 ? ((partes[0]![0] ?? '') + (partes.length > 1 ? (partes[partes.length - 1]![0] ?? '') : '')).toUpperCase() : email.slice(0, 1).toUpperCase()
  return (
    <span className={s.avatar} style={{ width: tamanho, height: tamanho }}>
      {fotoUrl ? (
        <Image src={fotoUrl} alt="" width={tamanho} height={tamanho} unoptimized />
      ) : (
        <span aria-hidden style={{ fontSize: tamanho * 0.36 }}>
          {iniciais}
        </span>
      )}
    </span>
  )
}

export function BlocoConta({ usuario }: { usuario: { nome: string | null; email: string; fotoUrl: string | null } }) {
  return (
    <Bloco titulo="Conta" descricao="Nome, avatar e segurança do acesso.">
      <form action={atualizarNome} className={s.form}>
        <div className={s.campo}>
          <label htmlFor="nome" className={s.rotulo}>
            Nome
          </label>
          <div className={s.linhaCampo}>
            <input id="nome" name="nome" defaultValue={usuario.nome ?? ''} minLength={2} maxLength={60} required autoComplete="name" className={s.entrada} />
            <button type="submit" className={s.botaoSecundario}>
              Salvar
            </button>
          </div>
        </div>
      </form>

      <form action={escolherAvatar} className={s.subbloco}>
        <p className={s.rotulo}>Avatar</p>
        <div className={s.avatares}>
          {AVATARES_PRONTOS.map((a) => (
            <button
              key={a}
              type="submit"
              name="fotoUrl"
              value={a}
              aria-label={`Escolher avatar ${a.slice(-6, -4)}`}
              aria-pressed={usuario.fotoUrl === a}
              className={s.opcaoAvatar}
            >
              <AvatarDaConta nome={null} email={usuario.email} fotoUrl={a} tamanho={44} />
            </button>
          ))}
          <button type="submit" name="fotoUrl" value="" aria-pressed={usuario.fotoUrl === null} className={s.semAvatar}>
            Sem avatar
          </button>
        </div>
      </form>

      <div className={s.separador} />
      <h3 className={s.subtitulo}>Segurança</h3>

      <form action={trocarSenha} className={s.form}>
        <div className={s.campo}>
          <label htmlFor="senha-atual-1" className={s.rotulo}>
            Senha atual
          </label>
          <input id="senha-atual-1" name="senhaAtual" type="password" autoComplete="current-password" required className={s.entrada} />
        </div>
        <div className={s.campo}>
          <label htmlFor="nova-senha" className={s.rotulo}>
            Nova senha
          </label>
          {/* 12, e não 10: é o `senhaSchema.min(12)` do back (MENSAGEM_REGRA_SENHA
              logo abaixo diz o mesmo). Com 10 o navegador deixava passar e a
              ação devolvia `senha-fraca`. */}
          <input id="nova-senha" name="novaSenha" type="password" autoComplete="new-password" minLength={12} maxLength={128} required aria-describedby="regra-nova-senha" className={s.entrada} />
          <p id="regra-nova-senha" className={s.ajuda}>
            {MENSAGEM_REGRA_SENHA}
          </p>
        </div>
        <button type="submit" className={s.botaoPrimario}>
          Trocar senha
        </button>
      </form>

      <form action={trocarEmail} className={s.form}>
        <div className={s.campo}>
          <label htmlFor="novo-email" className={s.rotulo}>
            Novo e-mail
          </label>
          <input id="novo-email" name="novoEmail" type="email" autoComplete="email" required className={s.entrada} />
        </div>
        <div className={s.campo}>
          <label htmlFor="senha-atual-2" className={s.rotulo}>
            Senha atual
          </label>
          <input id="senha-atual-2" name="senhaAtual" type="password" autoComplete="current-password" required className={s.entrada} />
        </div>
        <button type="submit" className={s.botaoPrimario}>
          Trocar e-mail
        </button>
        <p className={s.ajuda}>
          A troca de e-mail vale na hora. A confirmação por e-mail no endereço novo entra quando a
          NIP tiver envio de e-mail.
        </p>
      </form>
    </Bloco>
  )
}

const MENSAGEM_DO_CANCELAMENTO: Record<string, string> = {
  confirmado: 'Cancelamento confirmado. Seu período já pago permanece válido até o vencimento.',
  reauth: 'Entre novamente para confirmar esta operação sensível.',
  limite: 'Muitas tentativas. Aguarde antes de repetir.',
  erro: 'Não foi possível confirmar o cancelamento no Mercado Pago.',
}

export function BlocoAssinatura({
  assinatura,
  acesso,
  podeCancelar,
  estadoCancelamento,
  agora,
  fuso,
}: {
  assinatura: AssinaturaDaConta | null
  acesso: AcessoComNivel
  podeCancelar: boolean
  estadoCancelamento?: string
  agora: Date
  fuso: string
}) {
  const cobranca = proximaCobrancaEmTexto(assinatura?.proximaCobranca ?? null, agora, fuso)
  const mensagemCancelamento = estadoCancelamento ? MENSAGEM_DO_CANCELAMENTO[estadoCancelamento] : undefined
  const pago = acesso.nivel !== 'GRATIS'
  return (
    <Bloco titulo="Assinatura" descricao="Seu plano e a validade do acesso.">
      {mensagemCancelamento && (
        <p role="status" className={estadoCancelamento === 'confirmado' ? s.aviso : s.erro}>
          {mensagemCancelamento}
        </p>
      )}
      {pago || assinatura ? (
        <>
          <dl className={s.dados}>
            {/* A linha "Plano" fala o ACESSO (nível · modalidade), nunca o
                contrato — e só existe com acesso pago: com o acesso já caído
                para o grátis, o que sobra do plano expirado é "Situação" e o
                aviso de acesso inativo (telas-05-conta, Task 10 do front antigo). */}
            {pago && (
              <div>
                <dt>Plano</dt>
                <dd>
                  {ROTULO_DO_NIVEL[acesso.nivel]}
                  {acesso.modalidade && ` · ${ROTULO_DA_MODALIDADE[acesso.modalidade]}`}
                </dd>
              </div>
            )}
            {assinatura && (
              <div>
                <dt>Situação</dt>
                <dd>{assinatura.status}</dd>
              </div>
            )}
            {pago && acesso.validoAte && (
              <div>
                <dt>Válido até</dt>
                <dd className="num">{dia(acesso.validoAte, fuso)}</dd>
              </div>
            )}
          </dl>
          {cobranca && <p className={s.textoAlerta}>{cobranca}</p>}
          {!pago && (
            <p className={s.textoAlerta}>
              Acesso inativo. <Link href="/assinar" className={s.link}>Renovar acesso</Link>
            </p>
          )}
          <div className={s.acoesLinha}>
            <Link href="/assinar" className={s.botaoSecundario}>
              Ver planos
            </Link>
            {podeCancelar && (
              <form action={cancelarAssinatura}>
                <button type="submit" className={s.botaoPerigo}>
                  Cancelar assinatura
                </button>
              </form>
            )}
          </div>
        </>
      ) : (
        <>
          <p className={s.textoAlerta}>
            Sem plano ativo. Com o plano você recebe a Lista Secreta antes dos jogos e o Fire Live
            no 1º quarto.
          </p>
          <div className={s.acoesLinha}>
            <Link href="/assinar" className={s.botaoPrimario}>
              Assinar
            </Link>
          </div>
        </>
      )}
    </Bloco>
  )
}

/**
 * O botão de ativar alertas SOME no grátis (a permissão de notificação só se
 * pede uma vez por origem — queimá-la antes de a pessoa poder usar é
 * irreversível). As preferências NÃO somem: são dado da pessoa.
 */
export function BlocoAlertas({
  recebeAlertas,
  usuarioId,
  experiencia,
  jogadores,
  times,
}: {
  recebeAlertas: boolean
  /** Da sessão do servidor, para o cliente de push deduplicar o reenvio por conta. */
  usuarioId: string
  experiencia: EstadoExperiencia
  jogadores: { id: string; nome: string }[]
  times: { id: string; nome: string }[]
}) {
  return (
    <Bloco titulo="Alertas" descricao="Como e quando o NIP te avisa.">
      {recebeAlertas ? (
        <AtivarAlertas usuarioId={usuarioId} />
      ) : (
        <div className={s.convite}>
          <p>
            <strong>Os alertas de apito são do plano MVP.</strong> Assine para receber o apito no
            celular enquanto a entrada ainda está viva.
          </p>
          <Link href="/assinar?nivel=MVP&voltar=%2Fconta" className={s.botaoPrimario}>
            Ver planos
          </Link>
        </div>
      )}
      <PainelExperiencia inicial={experiencia} jogadores={jogadores} times={times} />
    </Bloco>
  )
}

export function BlocoDispositivos({
  dispositivos,
  esteAparelho,
  fuso,
}: {
  dispositivos: DispositivoDoUsuario[]
  esteAparelho: string | null
  fuso: string
}) {
  return (
    <Bloco titulo="Dispositivos" descricao="Sua assinatura permite 2 aparelhos ativos. Ao entrar em um terceiro, a sessão mais antiga é encerrada.">
      {dispositivos.length === 0 ? (
        <p className={s.vazio}>Nenhum dispositivo.</p>
      ) : (
        <ul className={s.lista}>
          {dispositivos.map((d) => {
            const ehEste = esteAparelho === d.id
            return (
              <li key={d.id} className={s.itemLista}>
                <span className={s.dispositivo}>
                  <strong>
                    {d.tipo === 'MOBILE' ? 'Celular' : 'Computador'}
                    {ehEste && <span className={s.marcador}>Este aparelho</span>}
                    {!ehEste && d.temSessaoAtiva && <span className={s.marcadorNeutro}>Ativo</span>}
                  </strong>
                  <span className={s.ajuda}>Último uso {diaHora(d.ultimoUso, fuso)}</span>
                </span>
                <form action={encerrarDispositivo}>
                  <input type="hidden" name="dispositivoId" value={d.id} />
                  {/* No aparelho em uso o botão diz o que vai acontecer:
                      encerrar ESTA sessão desconecta quem está lendo. */}
                  <button type="submit" disabled={!d.temSessaoAtiva} className={s.botaoTexto}>
                    {ehEste ? 'Encerrar esta sessão (você sai agora)' : 'Encerrar sessão'}
                  </button>
                </form>
              </li>
            )
          })}
        </ul>
      )}
    </Bloco>
  )
}
