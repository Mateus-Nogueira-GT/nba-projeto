import { desc, eq, inArray } from 'drizzle-orm'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { CabecalhoTela, Moldura } from '@/components/navegacao'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import { AvatarUsuario, Selo } from '@/design-system/componentes'
import { semantico } from '@/design-system/tokens/semantico'
import { getDb } from '@/modules/dominio/db/cliente'
import { assinaturas, times, usuarios } from '@/modules/dominio/db/schema'
import { dispositivosDoUsuario } from '@/modules/plataforma/admin/usuarios'
import { avaliarAcesso } from '@/modules/plataforma/assinatura/direito'
import { sessaoAtual } from '@/modules/plataforma/auth/cookies'
import { MENSAGEM_REGRA_SENHA } from '@/modules/plataforma/auth/senha'
import { sair } from '../entrar/acoes'
import { BlocoAlertas, BlocoAssinatura, BlocoConta, BlocoDispositivos } from './blocos'
import { estadoExperienciaDoUsuario } from '@/modules/plataforma/experiencia/servico'
import { identidadesDeApresentacao } from '@/modules/dominio/identidade-apresentacao'
import { identidadeDoTime } from '@/design-system/times'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Minha conta' }

/**
 * Mensagem de cada `?aviso=` que uma ação desta tela pode devolver depois do
 * redirect. 'nome-ok' e 'avatar-ok' nascem aqui (Task 4); 'senha-ok',
 * 'email-ok' e 'sessao-ok' chegam com as ações de segurança da Task 5 — as
 * chaves já estão aqui para as duas tasks escreverem no MESMO dicionário.
 */
const TEXTO_DO_AVISO: Record<string, string> = {
  'nome-ok': 'Nome atualizado.',
  'avatar-ok': 'Avatar atualizado.',
  'senha-ok': 'Senha alterada.',
  'email-ok': 'E-mail alterado.',
  'sessao-ok': 'Sessão encerrada.',
}

/**
 * Mesmo dicionário, para `?erro=`. Antes, as ações redirecionavam com a
 * mensagem por extenso na própria URL: `/conta?erro=<qualquer frase>` cai
 * direto num `role="alert"` desta tela, e qualquer um pode forjar esse link
 * sem nunca ter passado pela ação — texto de atacante dentro de um alerta da
 * própria NIP, num app que leva a uma casa de apostas (achado da revisão
 * final). Um código fora daqui não vira alerta vazio: some, como `?aviso=`
 * já fazia.
 */
const TEXTO_DO_ERRO: Record<string, string> = {
  'nome-curto': 'Nome muito curto.',
  'nome-longo': 'Nome muito longo.',
  'avatar-invalido': 'Avatar inválido.',
  'senha-fraca': MENSAGEM_REGRA_SENHA,
  'senha-atual-incorreta': 'Senha atual incorreta.',
  'email-invalido': 'E-mail inválido.',
  'email-em-uso': 'Este e-mail já está em uso.',
  'dispositivo-invalido': 'Dispositivo inválido.',
}

export default async function PaginaConta({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sessao = await sessaoAtual()
  if (!sessao) redirect('/entrar?destino=/conta')
  const { fuso } = (await rulesetAtivo()).rodada
  const db = getDb()
  const agora = new Date()
  // `validarSessao` (dentro de `sessaoAtual`) já preenche `dispositivoId` pela
  // MESMA linha e condição de vida que uma consulta separada repetiria — é
  // sempre o dispositivo por trás do cookie desta requisição.
  const esteAparelho = sessao.dispositivoId
  const [acesso, dispositivos, experiencia, linhas, usuarioLinhas, parametros] = await Promise.all([
    avaliarAcesso(db, sessao.usuarioId),
    dispositivosDoUsuario(db, sessao.usuarioId),
    estadoExperienciaDoUsuario(db, sessao.usuarioId),
    db
      .select()
      .from(assinaturas)
      .where(eq(assinaturas.usuarioId, sessao.usuarioId))
      .orderBy(desc(assinaturas.atualizadoEm))
      .limit(1),
    db
      .select({ nome: usuarios.nome, email: usuarios.email, fotoUrl: usuarios.fotoUrl })
      .from(usuarios)
      .where(eq(usuarios.id, sessao.usuarioId))
      .limit(1),
    searchParams,
  ])
  // A sessão validada já garante a linha (FK de `sessoes` para `usuarios`).
  const usuario = usuarioLinhas[0]!
  const idsJogadores = [
    ...new Set([...experiencia.jogadoresAcompanhados, ...experiencia.jogadoresSilenciados]),
  ]
  const [identidades, timesSeguidos] = await Promise.all([
    identidadesDeApresentacao(db, idsJogadores),
    experiencia.timesAcompanhados.length === 0
      ? Promise.resolve([])
      : db
          .select({ id: times.id, nome: times.nome, sigla: times.sigla })
          .from(times)
          .where(inArray(times.id, experiencia.timesAcompanhados)),
  ])
  const assinatura = linhas[0] ?? null
  const estadoCancelamento = Array.isArray(parametros.cancelamento)
    ? parametros.cancelamento[0]
    : parametros.cancelamento
  const aviso = Array.isArray(parametros.aviso) ? parametros.aviso[0] : parametros.aviso
  const erro = Array.isArray(parametros.erro) ? parametros.erro[0] : parametros.erro
  // `?aviso=` é URL: uma chave fora de TEXTO_DO_AVISO (link velho, dedo no
  // teclado) não pode virar `<p role="status"></p>` vazio — um anúncio em
  // branco para quem usa leitor de tela.
  const mensagemDoAviso = aviso ? TEXTO_DO_AVISO[aviso] : undefined
  // Mesma regra para `?erro=`: uma chave fora do dicionário não aparece —
  // nunca o texto cru da URL.
  const mensagemDeErro = erro ? TEXTO_DO_ERRO[erro] : undefined
  const podeCancelar = Boolean(
    assinatura?.mercadopagoId &&
    !['CANCELADA', 'CANCELED', 'CANCELLED'].includes(assinatura.status),
  )

  return (
    <Moldura aba="conta" largura="dados">
      <CabecalhoTela sobrancelha="SUA CONTA" titulo="PERFIL" />
      <section style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 20 }}>
        <AvatarUsuario
          nome={usuario.nome}
          email={usuario.email}
          fotoUrl={usuario.fotoUrl}
          tamanho={72}
        />
        <div style={{ minWidth: 0 }}>
          <p
            style={{
              margin: 0,
              fontFamily: semantico.fonteTitulo,
              fontSize: 22,
              textTransform: 'uppercase',
            }}
          >
            {usuario.nome ?? 'Sem nome'}
          </p>
          <p style={{ margin: '2px 0 0', color: semantico.textoSecundario, fontSize: 13 }}>
            {usuario.email}
          </p>
          <p style={{ margin: '6px 0 0' }}>
            {/* Duas perguntas diferentes, duas fontes diferentes. O RÓTULO diz
                qual é o contrato — `plano` é anulável, então sem nome sobra o
                status, a mesma palavra que o bloco de Assinatura escreve logo
                abaixo; "SEM PLANO" é só de quem não tem contrato nenhum. O
                ÍCONE diz se o acesso vale AGORA: "✓" em cima de "CANCELADA"
                (ou de "SEM PLANO") seria um confirmado sobre o que não vale —
                é a contradição que a Task 4 já tinha consertado uma vez.
                Puramente decorativo (`aria-hidden` no Selo). */}
            <Selo
              icone={acesso.permitido ? '✓' : '—'}
              rotulo={assinatura ? (assinatura.plano ?? assinatura.status) : 'SEM PLANO'}
            />
          </p>
        </div>
      </section>
      {mensagemDoAviso && (
        <p role="status" style={{ color: semantico.apitoNivel3 }}>
          {mensagemDoAviso}
        </p>
      )}
      {mensagemDeErro && (
        <p role="alert" style={{ color: semantico.alerta }}>
          {mensagemDeErro}
        </p>
      )}

      {/* Os quatro blocos da spec §4.3, nesta ordem: é ela que o celular lê de
          cima para baixo. Dois por linha no desktop — a grade é inline e a
          classe leva SÓ a media query, que o estilo inline não faz. */}
      <div className="grade-conta" style={{ display: 'grid', gap: 16 }}>
        <BlocoConta usuario={usuario} />
        <BlocoAssinatura
          assinatura={assinatura}
          acesso={acesso}
          podeCancelar={podeCancelar}
          estadoCancelamento={estadoCancelamento}
          agora={agora}
          fuso={fuso}
        />
        <BlocoAlertas
          experiencia={experiencia}
          jogadores={idsJogadores.map((id) => ({
            id,
            nome: identidades.get(id)?.nome ?? 'Jogador',
          }))}
          times={timesSeguidos.map((time) => ({
            id: time.id,
            nome: identidadeDoTime(time.sigla).nome,
          }))}
        />
        <BlocoDispositivos dispositivos={dispositivos} esteAparelho={esteAparelho} fuso={fuso} />
      </div>

      <form action={sair} style={{ marginTop: 20 }}>
        <button
          type="submit"
          style={{
            padding: '11px 12px',
            borderRadius: 8,
            border: `1px solid ${semantico.acento}`,
            background: 'transparent',
            color: semantico.acento,
            fontFamily: semantico.fonteTitulo,
            letterSpacing: 0.5,
            textTransform: 'uppercase',
            fontWeight: 700,
            fontSize: 15,
            cursor: 'pointer',
          }}
        >
          Sair
        </button>
      </form>

      {/* Estatísticas e "como funciona" não são conta: eram um bloco de
          navegação no meio da tela e viram rodapé, alcançáveis sem disputar
          espaço com o que a pessoa veio fazer aqui. */}
      <p
        style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          margin: '18px 0 0',
          fontSize: 13,
          color: semantico.textoSecundario,
        }}
      >
        <Link href="/estatisticas" style={{ color: semantico.textoSecundario }}>
          Estatísticas
        </Link>
        <span aria-hidden>·</span>
        <Link href="/como-funciona" style={{ color: semantico.textoSecundario }}>
          Como funciona
        </Link>
      </p>
    </Moldura>
  )
}
