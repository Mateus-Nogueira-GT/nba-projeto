import { redirect } from 'next/navigation'

import { ConteudoDaMetodologia, lerMetodologia } from '@/components/metodologia/Conteudo'
import { CabecalhoTela, Moldura } from '@/components/navegacao'
import { semantico } from '@/design-system/tokens/semantico'
import { sessaoAtual } from '@/modules/plataforma/auth/cookies'
import '@/design-system/tokens/tokens.css'

import { aceitarMetodologia } from './acoes'
import { paraOndeVoltar } from './destino'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'A metodologia NIP' }

/**
 * O PORTÃO DA METODOLOGIA — toda conta passa por aqui uma vez.
 *
 * Mesmo texto da `/como-funciona`, com um aceite no fim. Quem chega é mandado
 * pelo guarda de acesso, que carrega na URL a tela que a pessoa queria.
 *
 * NÃO passa pelo guarda de nível: se passasse, o portão a mandaria para ela
 * mesma, em laço. Ela checa a sessão direto — é a única coisa de que precisa.
 *
 * Sem `voltarHref` no cabeçalho, e de propósito: é um portão, não uma leitura.
 * Quem só quer ler tem a `/como-funciona`, que não pede nada em troca.
 */
export default async function PaginaMetodologia({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sessao = await sessaoAtual()
  if (!sessao) redirect('/entrar?destino=/metodologia')

  const params = await searchParams
  const bruto = Array.isArray(params.destino) ? params.destino[0] : params.destino
  const destino = paraOndeVoltar(bruto ?? null)
  const metodologia = await lerMetodologia()

  return (
    <Moldura aba={null}>
      <CabecalhoTela sobrancelha="ANTES DE COMEÇAR" titulo="A METODOLOGIA NIP" />
      <p style={{ margin: '0 0 24px', color: semantico.textoSecundario, fontSize: 14 }}>
        Leia uma vez e confirme embaixo. Depois disso os cards se explicam sozinhos, e esta tela não
        aparece mais — ela continua disponível em COMO FUNCIONA.
      </p>

      <ConteudoDaMetodologia {...metodologia} />

      <form action={aceitarMetodologia} style={{ margin: '32px 0 8px' }}>
        <input type="hidden" name="destino" value={destino} />
        <button
          type="submit"
          className="botao-primario"
          style={{
            width: '100%',
            minHeight: 52,
            borderRadius: 12,
            fontFamily: semantico.fonteTitulo,
            fontSize: 18,
            letterSpacing: 1,
            textTransform: 'uppercase',
            cursor: 'pointer',
          }}
        >
          OK, CONCORDO
        </button>
      </form>
    </Moldura>
  )
}
