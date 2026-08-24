import { componente } from '../tokens/componente'
import { semantico } from '../tokens/semantico'

/** A moldura de contorno da identidade 02. A COR vem de quem chama
 *  (CONFIANCA_GRAU, semantico.aoVivo...) — a pílula não conhece domínio. */
export function Pilula({
  texto, cor, brilho = false, tamanho = 'padrao',
}: { texto: string; cor: string; brilho?: boolean; tamanho?: 'padrao' | 'hero' }) {
  const hero = tamanho === 'hero'
  return (
    <span
      style={{
        display: 'inline-block', whiteSpace: 'nowrap',
        padding: hero ? '6px 16px' : '4px 12px', borderRadius: 10,
        border: `${componente.pilulaBordaLargura} solid ${cor}`, color: cor,
        fontFamily: semantico.fonteTitulo, fontSize: hero ? 34 : 18,
        lineHeight: 1.2, fontVariantNumeric: 'tabular-nums',
        boxShadow: brilho ? `0 0 14px 1px ${cor}66` : undefined,
      }}
    >
      {texto}
    </span>
  )
}
