import s from '@/features/ao-vivo/Carregando.module.css'

/** Esqueleto no formato do Ao Vivo: seletor de jogos, placar e linhas. */
export default function Carregando() {
  return (
    <div className={s.tela} aria-busy="true">
      <span className="so-leitor" role="status">
        Carregando os alvos do 1º quarto
      </span>
      <div className={s.titulo} />
      <div className={s.subtitulo} />
      <div className={s.seletor}>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className={s.jogo} />
        ))}
      </div>
      <div className={s.placar} />
      <div className={s.tabela}>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className={s.linha}>
            <span className={s.circulo} />
            <span className={s.barra} style={{ width: 150 - (i % 3) * 20 }} />
            <span className={s.barra} style={{ flex: 1 }} />
          </div>
        ))}
      </div>
    </div>
  )
}
