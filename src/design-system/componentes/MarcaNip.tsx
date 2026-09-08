import { marcaNip } from '@/design-system/marca'

export function MarcaNip({ compacta = false }: { compacta?: boolean }) {
  return (
    <span className="marca-nip" aria-label={`${marcaNip.nome} — ${marcaNip.assinatura}`}>
      <strong>{marcaNip.nome}</strong>
      {compacta ? null : <small>{marcaNip.assinatura}</small>}
    </span>
  )
}
