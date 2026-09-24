import type { ReactNode } from 'react'
import { ConteudoDaMetodologia, SUMARIO } from './Conteudo'
import type { Metodologia } from './carregar'
import s from './Metodologia.module.css'

/** A página de leitura da metodologia: cabeçalho, sumário lateral e o texto. */
export function LeituraDaMetodologia({
  sobrancelha,
  titulo,
  introducao,
  metodologia,
  depois,
}: {
  sobrancelha: string
  titulo: string
  introducao: ReactNode
  metodologia: Metodologia
  depois?: ReactNode
}) {
  return (
    <div className={s.tela}>
      <header className={s.cabecalho}>
        <p className={s.sobrancelha}>{sobrancelha}</p>
        <h1 className={s.titulo}>{titulo}</h1>
        <p className={s.introducao}>{introducao}</p>
      </header>
      <div className={s.corpo}>
        <nav className={s.sumario} aria-label="Nesta página">
          <p className={s.sumarioTitulo}>Nesta página</p>
          <ol>
            {SUMARIO.map((item) => (
              <li key={item.id}>
                <a href={`#${item.id}`}>{item.rotulo}</a>
              </li>
            ))}
          </ol>
        </nav>
        <div className={s.texto}>
          <ConteudoDaMetodologia {...metodologia} />
          {depois}
        </div>
      </div>
    </div>
  )
}
