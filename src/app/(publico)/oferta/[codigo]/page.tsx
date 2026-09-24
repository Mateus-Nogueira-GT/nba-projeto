import Link from 'next/link'
import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { getDb } from '@/modules/dominio/db/cliente'
import { sessaoAtual } from '@/modules/plataforma/auth/cookies'
import { COOKIE_VISITANTE_AFILIADO } from '@/modules/plataforma/afiliados/http'
import { registrarVisitaNip, resolverLinkSemRegistrar } from '@/modules/plataforma/afiliados/servico'
import { CartaoPublico } from '@/features/publico/CartaoPublico'
import s from '@/features/publico/CartaoPublico.module.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Oferta selecionada' }

/**
 * A tela intermediária de um link de afiliado que aponta para a NIP: diz que
 * a pessoa vai sair e entrega a saída por `/ir/<codigo>`, que é quem registra
 * o clique. Aqui só se registra a VISITA — e só de quem chegou por `/r/`
 * (tem o cookie de visitante).
 */
export default async function PaginaOferta({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params
  if (!process.env.DATABASE_URL) notFound()

  // Link pausado, campanha encerrada, parceiro inativo, código desconhecido:
  // o resolvedor lança, e a resposta é a MESMA de `/r/<codigo>` — a tela de
  // oferta indisponível, não um 404 seco.
  let destino: string
  try {
    // Onda 2: o resolvedor devolve `{ destino, configuracao }` (a configuração
    // serve a `/r/` para registrar o clique sem reler o link; aqui só o
    // destino importa).
    ;({ destino } = await resolverLinkSemRegistrar(getDb(), codigo))
  } catch {
    redirect('/oferta-indisponivel')
  }
  // Um link que aponta para a casa (ou para outro caminho da NIP) não tem
  // esta tela: é 404, não "indisponível".
  if (destino !== `/oferta/${codigo}`) notFound()

  const visitanteToken = (await cookies()).get(COOKIE_VISITANTE_AFILIADO)?.value
  if (visitanteToken) {
    try {
      const sessao = await sessaoAtual()
      await registrarVisitaNip(getDb(), { codigo, visitanteToken, usuarioId: sessao?.usuarioId, agora: new Date() })
    } catch (erro) {
      // O destino já está resolvido: falhar ao REGISTRAR a visita não pode
      // esconder a oferta de quem chegou (mesma regra de `/r/`, auditoria 23/09).
      console.error(JSON.stringify({ evento: 'afiliado_visita_falhou', codigo, mensagem: String(erro) }))
    }
  }
  return (
    <CartaoPublico etiqueta="Parceria comercial" titulo="Você está saindo da NIP">
      <p className={s.texto}>
        O próximo botão abre o site da casa parceira. A NIP registra esta saída para atribuir a
        campanha; cadastro, depósito e demais ações acontecem fora da plataforma.
      </p>
      <div className={s.acoes}>
        <Link href={`/ir/${codigo}`} prefetch={false} className={s.primaria}>
          Continuar para a oferta
        </Link>
        <Link href="/" className={s.secundaria}>
          Voltar para a NIP
        </Link>
      </div>
    </CartaoPublico>
  )
}
