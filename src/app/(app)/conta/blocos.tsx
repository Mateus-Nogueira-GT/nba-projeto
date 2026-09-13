import Link from 'next/link'

import { dataHora, diaCompleto } from '@/components/formato'
import { PainelExperiencia } from '@/components/preferencias/PainelExperiencia'
import { AtivarAlertas } from '@/components/pwa'
import { AvatarUsuario, AVATARES_PRONTOS } from '@/design-system/componentes'
import { componente } from '@/design-system/tokens/componente'
import { semantico } from '@/design-system/tokens/semantico'
import type { DispositivoDoUsuario } from '@/modules/plataforma/admin/usuarios'
import type { ResultadoAcesso } from '@/modules/plataforma/assinatura/direito'
import type { EstadoExperiencia } from '@/modules/plataforma/experiencia/contrato'

import {
  atualizarNome,
  cancelarAssinatura,
  encerrarDispositivo,
  escolherAvatar,
  trocarEmail,
  trocarSenha,
} from './acoes'

/**
 * OS QUATRO BLOCOS DA CONTA (spec 12/09, §4.3) — só apresentação.
 *
 * Eram cinco listas de mesmo peso empilhadas na página; viram Conta,
 * Assinatura, Alertas e Dispositivos, dois por linha no desktop. O
 * carregamento dos dados continua em `page.tsx`: aqui nada consulta banco,
 * lê cookie ou chama relógio — o que um bloco precisa saber chega por
 * propriedade.
 */

/** Estilos de campo (copiado de cadastrar/formulario.tsx). */
const ESTILO_CAMPO = {
  width: '100%',
  padding: '11px 12px',
  borderRadius: 8,
  border: `1px solid ${semantico.divisor}`,
  background: semantico.superficie,
  color: semantico.textoPrimario,
  fontSize: 15,
} as const

/** Estilo de botão principal (CTA). */
const ESTILO_BOTAO_PRINCIPAL = {
  ...ESTILO_CAMPO,
  border: 0,
  background: componente.ctaFundo,
  color: semantico.textoSobreCor,
  fontFamily: semantico.fonteTitulo,
  letterSpacing: 0.5,
  textTransform: 'uppercase' as const,
  fontWeight: 700,
  cursor: 'pointer',
} as const

/** Estilo de botão secundário/destrutivo. */

/** Estilo de botão secundário com acento (manutenção de conta). */
const ESTILO_BOTAO_SECUNDARIO_ACENTO = {
  padding: '11px 12px',
  borderRadius: 8,
  border: `1px solid ${semantico.acento}`,
  background: 'transparent',
  color: semantico.acento,
  fontFamily: semantico.fonteTitulo,
  letterSpacing: 0.5,
  textTransform: 'uppercase' as const,
  fontWeight: 700,
  fontSize: 15,
  cursor: 'pointer',
} as const

const ESTILO_BOTAO_SECUNDARIO = {
  padding: '11px 12px',
  borderRadius: 8,
  border: `1px solid ${semantico.divisor}`,
  background: 'transparent',
  color: semantico.textoPrimario,
  fontFamily: 'inherit',
  fontSize: 15,
  cursor: 'pointer',
} as const

/**
 * O cartão de um bloco. O título chega JÁ em caixa alta, e não por
 * `text-transform`: a ordem dos quatro é contrato de spec (é a leitura do
 * celular, de cima para baixo) e está travada por asserção sobre o HTML.
 */
function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        padding: 16,
        borderRadius: 14,
        border: `1px solid ${semantico.divisor}`,
        background: semantico.superficie,
      }}
    >
      <h2
        style={{
          margin: '0 0 12px',
          fontFamily: semantico.fonteRotulo,
          fontSize: 12,
          letterSpacing: 1.5,
          color: semantico.textoSecundario,
        }}
      >
        {titulo}
      </h2>
      {children}
    </section>
  )
}

/**
 * A contagem regressiva da próxima cobrança (spec §4.3) — "em 5 dias", com a
 * data ao lado.
 *
 * Passada a data, a contagem não tem o que contar: "em 0 dias" seria ruído
 * sobre um dado que o provedor ainda não atualizou, então sobra a data
 * escrita, que continua verdadeira. `agora` entra por parâmetro — chamar o
 * relógio aqui dentro tornaria o texto dependente do instante do render.
 */
export function proximaCobrancaEmTexto(
  quando: Date | null,
  agora: Date,
  fuso: string,
): string | null {
  if (!quando) return null
  const dias = Math.ceil((quando.getTime() - agora.getTime()) / 86_400_000)
  if (dias <= 0) return `Próxima cobrança · ${diaCompleto(quando, fuso)}`
  return `Próxima cobrança em ${dias} ${dias === 1 ? 'dia' : 'dias'} · ${diaCompleto(quando, fuso)}`
}

/** Identidade e as ações sobre ela: nome, avatar, senha e e-mail. */
export function BlocoConta({
  usuario,
}: {
  usuario: { nome: string | null; email: string; fotoUrl: string | null }
}) {
  return (
    <Bloco titulo="CONTA">
      {/* Só a galeria de avatares fica dobrada — são oito botões de imagem, e
          ela já veio assim. Trocar senha e trocar e-mail ficam à vista: a
          altura da coluna só é problema acima de 900px, e esconder duas ações
          sensíveis da conta em 390px, onde está a maioria de um PWA, pagaria
          o layout do desktop com a visibilidade do celular. */}
      <div style={{ display: 'grid', gap: 16 }}>
        <details>
          <summary>Editar nome e avatar</summary>
          <form action={atualizarNome} style={{ marginTop: 10, display: 'grid', gap: 8 }}>
            <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
              Nome{' '}
              <input
                name="nome"
                defaultValue={usuario.nome ?? ''}
                maxLength={60}
                required
                style={ESTILO_CAMPO}
              />
            </label>
            <button type="submit" style={ESTILO_BOTAO_PRINCIPAL}>
              Salvar nome
            </button>
          </form>
          <form
            action={escolherAvatar}
            style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}
          >
            {AVATARES_PRONTOS.map((a) => (
              <button
                key={a}
                type="submit"
                name="fotoUrl"
                value={a}
                aria-label={`Escolher avatar ${a.slice(-6, -4)}`}
                aria-pressed={usuario.fotoUrl === a}
                style={{
                  padding: 0,
                  border:
                    usuario.fotoUrl === a
                      ? `2px solid ${semantico.acento}`
                      : `1px solid ${semantico.divisor}`,
                  borderRadius: 12,
                  background: 'transparent',
                }}
              >
                <AvatarUsuario nome={null} email={usuario.email} fotoUrl={a} tamanho={44} />
              </button>
            ))}
            <button
              type="submit"
              name="fotoUrl"
              value=""
              style={{
                padding: '10px 14px',
                borderRadius: 8,
                border: `1px solid ${semantico.divisor}`,
                background: 'transparent',
                color: semantico.textoPrimario,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Sem avatar
            </button>
          </form>
        </details>

        {/* O título de segurança da Task 5 continua aqui, um nível abaixo: é
            por ele que se acha onde trocar a senha. */}
        <h3 style={{ margin: 0, fontSize: 15 }}>Segurança</h3>

        <form action={trocarSenha} style={{ display: 'grid', gap: 8 }}>
          <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
            Senha atual
            <input
              name="senhaAtual"
              type="password"
              autoComplete="current-password"
              required
              style={ESTILO_CAMPO}
            />
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
            Nova senha
            <input
              name="novaSenha"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
              aria-describedby="regra-nova-senha"
              style={ESTILO_CAMPO}
            />
          </label>
          <p
            id="regra-nova-senha"
            style={{ margin: 0, color: semantico.textoSecundario, fontSize: 12 }}
          >
            {/* Mesma frase de cadastrar/formulario.tsx: duas redações da
                mesma regra de senha fariam a pessoa achar que são regras
                diferentes. */}
            Use pelo menos 12 caracteres, com letra e número.
          </p>
          <button type="submit" style={ESTILO_BOTAO_SECUNDARIO_ACENTO}>
            Trocar senha
          </button>
        </form>

        <form action={trocarEmail} style={{ display: 'grid', gap: 8 }}>
          <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
            Novo e-mail
            <input
              name="novoEmail"
              type="email"
              autoComplete="email"
              required
              style={ESTILO_CAMPO}
            />
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
            Senha atual
            <input
              name="senhaAtual"
              type="password"
              autoComplete="current-password"
              required
              style={ESTILO_CAMPO}
            />
          </label>
          <button type="submit" style={ESTILO_BOTAO_SECUNDARIO_ACENTO}>
            Trocar e-mail
          </button>
          <p style={{ margin: 0, color: semantico.textoSecundario, fontSize: 12 }}>
            {/* Desvio declarado (spec §4.3 x §5.3): sem provedor de e-mail no
                projeto não há como confirmar no endereço novo — a troca vale
                na hora, protegida pela senha atual. */}
            A troca de e-mail vale na hora. A confirmação por e-mail no endereço novo entra quando a
            NIP tiver envio de e-mail.
          </p>
        </form>
      </div>
    </Bloco>
  )
}

/** Plano, validade, contagem regressiva — e a chamada de quem ainda não assinou. */
export function BlocoAssinatura({
  assinatura,
  acesso,
  podeCancelar,
  estadoCancelamento,
  agora,
  fuso,
}: {
  assinatura: { plano: string | null; status: string; proximaCobranca: Date | null } | null
  acesso: ResultadoAcesso
  podeCancelar: boolean
  estadoCancelamento?: string
  agora: Date
  fuso: string
}) {
  const cobranca = proximaCobrancaEmTexto(assinatura?.proximaCobranca ?? null, agora, fuso)

  return (
    <Bloco titulo="ASSINATURA">
      {estadoCancelamento && (
        <p
          role="status"
          style={{
            margin: '0 0 12px',
            fontSize: 14,
            color: estadoCancelamento === 'confirmado' ? semantico.apitoNivel3 : semantico.alerta,
          }}
        >
          {estadoCancelamento === 'confirmado'
            ? 'Cancelamento confirmado. Seu período já pago permanece válido até o vencimento.'
            : estadoCancelamento === 'reauth'
              ? 'Entre novamente para confirmar esta operação sensível.'
              : estadoCancelamento === 'limite'
                ? 'Muitas tentativas. Aguarde antes de repetir.'
                : 'Não foi possível confirmar o cancelamento no Mercado Pago.'}
        </p>
      )}
      {assinatura ? (
        <>
          {/* Quem manda na forma é EXISTIR contrato, não ele ter nome: `plano`
              é anulável e o Mercado Pago devolve contrato sem `reason`. Quem
              paga não pode receber a chamada de quem nunca assinou — nem
              perder o botão de cancelar, que mora aqui dentro.

              E só os campos que TÊM valor: a lista fixa de cinco linhas do
              print escrevia um travessão em cada dado que o provedor ainda não
              mandou, e quatro traços seguidos parecem falha. */}
          <dl
            style={{
              margin: 0,
              display: 'grid',
              gridTemplateColumns: 'auto 1fr',
              gap: '6px 12px',
              fontSize: 14,
            }}
          >
            {assinatura.plano && (
              <>
                <dt style={{ color: semantico.textoSecundario }}>Plano</dt>
                <dd style={{ margin: 0 }}>{assinatura.plano}</dd>
              </>
            )}
            <dt style={{ color: semantico.textoSecundario }}>Situação</dt>
            <dd style={{ margin: 0 }}>{assinatura.status}</dd>
            {acesso.permitido && acesso.validoAte && (
              <>
                <dt style={{ color: semantico.textoSecundario }}>Válido até</dt>
                <dd style={{ margin: 0 }}>{diaCompleto(acesso.validoAte, fuso)}</dd>
              </>
            )}
          </dl>
          {cobranca && <p style={{ margin: '12px 0 0', fontSize: 14 }}>{cobranca}</p>}
          {!acesso.permitido && (
            <p style={{ margin: '12px 0 0', fontSize: 14 }}>
              Acesso inativo. <Link href="/assinar">Renovar acesso</Link>
            </p>
          )}
          {podeCancelar && (
            <form action={cancelarAssinatura} style={{ marginTop: 14 }}>
              <button type="submit" style={ESTILO_BOTAO_SECUNDARIO}>
                Cancelar assinatura
              </button>
            </form>
          )}
        </>
      ) : (
        <>
          {/* Quem nunca assinou não quer um relatório do que não tem: quer
              saber o que o plano dá e onde clicar. */}
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
            Sem plano ativo. Com o plano você recebe a Lista Secreta antes dos jogos e o Fire Live
            no 1º quarto.
          </p>
          <p style={{ margin: '14px 0 0' }}>
            <Link
              href="/assinar"
              style={{
                display: 'inline-block',
                padding: '11px 18px',
                borderRadius: 10,
                background: componente.ctaFundo,
                color: semantico.textoSobreCor,
                fontFamily: semantico.fonteTitulo,
                letterSpacing: 0.5,
                textTransform: 'uppercase',
                textDecoration: 'none',
              }}
            >
              Assinar
            </Link>
          </p>
        </>
      )}
    </Bloco>
  )
}

/** Push e as preferências de alerta — o que existe hoje; Telegram é da §6. */
export function BlocoAlertas({
  experiencia,
  jogadores,
  times,
}: {
  experiencia: EstadoExperiencia
  jogadores: { id: string; nome: string }[]
  times: { id: string; nome: string }[]
}) {
  return (
    <Bloco titulo="ALERTAS">
      <div style={{ display: 'grid', gap: 14 }}>
        <AtivarAlertas />
        <PainelExperiencia inicial={experiencia} jogadores={jogadores} times={times} />
      </div>
    </Bloco>
  )
}

/** Os aparelhos com sessão, cada um com o próprio "encerrar sessão". */
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
    <Bloco titulo="DISPOSITIVOS">
      {dispositivos.map((dispositivo) => {
        const ehEsteAparelho = esteAparelho === dispositivo.id
        return (
          <div
            key={dispositivo.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
              margin: '5px 0',
            }}
          >
            <p style={{ margin: 0, fontSize: 13 }}>
              {dispositivo.tipo} · último uso {dataHora(dispositivo.ultimoUso, fuso)}
              {ehEsteAparelho ? ' · este aparelho' : dispositivo.temSessaoAtiva ? ' · ativo' : ''}
            </p>
            <form action={encerrarDispositivo}>
              <input type="hidden" name="dispositivoId" value={dispositivo.id} />
              {/* O botão do aparelho em uso precisa dizer o que vai acontecer:
                  não faz sentido oferecer "encerrar sessão" nele sem avisar
                  que encerrar ESTA sessão desconecta quem está lendo a tela
                  agora. */}
              <button
                type="submit"
                disabled={!dispositivo.temSessaoAtiva}
                style={{
                  ...ESTILO_BOTAO_SECUNDARIO,
                  opacity: !dispositivo.temSessaoAtiva ? 0.5 : 1,
                }}
              >
                {ehEsteAparelho ? 'Encerrar esta sessão (você sai agora)' : 'Encerrar sessão'}
              </button>
            </form>
          </div>
        )
      })}
      {dispositivos.length === 0 && <p style={{ margin: 0 }}>Nenhum dispositivo.</p>}
    </Bloco>
  )
}
