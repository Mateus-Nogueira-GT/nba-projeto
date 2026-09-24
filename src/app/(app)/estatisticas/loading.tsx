import s from '@/features/estatisticas/Carregando.module.css'

/** Esqueleto da aba: cabeçalho, uma faixa de controles e blocos de tabela. */
export default function Carregando() {
  return (
    <div className={s.tela} aria-busy="true">
      <span className="so-leitor" role="status">
        Carregando estatísticas
      </span>
      <div className={s.titulo} />
      <div className={s.faixa} />
      <div className={s.bloco} />
      <div className={s.bloco} />
    </div>
  )
}
