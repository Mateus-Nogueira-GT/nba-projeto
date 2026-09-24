import s from '@/features/lista/Carregando.module.css'

/** Esqueleto no formato da tabela — a tela não pisca de branco para cheio. */
export default function Carregando() {
  return (
    <div className={s.tela} aria-busy="true">
      <span className="so-leitor" role="status">
        Carregando
      </span>
      <div className={s.titulo} />
      <div className={s.subtitulo} />
      <div className={s.abas} />
      <div className={s.tabela}>
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className={s.linha}>
            <span className={s.circulo} />
            <span className={s.barra} style={{ width: 160 - (i % 3) * 24 }} />
            <span className={s.barra} style={{ width: 90 }} />
            <span className={s.barra} style={{ width: 56 }} />
          </div>
        ))}
      </div>
    </div>
  )
}
