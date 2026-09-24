import pagina from '@/features/apito/Pagina.module.css'
import s from '@/features/lista/Carregando.module.css'

/**
 * O detalhe em página cheia (link direto, push) consulta o banco — sem esta
 * fronteira o toque parece não ter sido ouvido (`carregamento.test.ts`). A
 * casca já está na tela; aqui só o cartão do detalhe, no formato dele.
 */
export default function Carregando() {
  return (
    <div className={pagina.pagina} aria-busy="true">
      <span className="so-leitor" role="status">
        Carregando
      </span>
      <div className={s.titulo} />
      <div className={s.subtitulo} />
      <div className={s.abas} />
      <div className={s.abas} />
    </div>
  )
}
