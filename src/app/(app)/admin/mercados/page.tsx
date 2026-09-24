import { like } from 'drizzle-orm'
import { getDb } from '@/modules/dominio/db/cliente'
import { casas, mapaJogadores, mapaMercados } from '@/modules/dominio/db/schema'
import { atributoEnum } from '@/modules/dominio/db/schema/enums'
import { ROTULO_ATRIBUTO } from '@/ui/marcas'
import { CabecalhoAdmin, Campo, GradeDeMetricas, Metrica, Painel, Status, Vazio } from '@/features/admin/componentes'
import { FormAcao } from '@/features/admin/FormAcao'
import { BancoNaoConfigurado, negarSeNaoForAdmin } from '@/features/admin/guarda'
import { confirmarVinculoDeMercado } from '@/features/admin/mercados/acoes'
import s from '@/features/admin/Admin.module.css'

// Lê banco a cada requisição — nunca prerenderiza no build.
export const dynamic = 'force-dynamic'
export const metadata = { title: 'Mercados · Painel' }

type Casa = { id: string; nome: string }
type Mercado = { id: string; casaId: string; nomeMercadoNaCasa: string; atributo: string; confirmado: boolean }
type VinculoDeCasa = {
  id: string
  nomeNaLista: string
  provedor: string
  confirmadoEm: Date | null
  confirmadoPor: string | null
}

/**
 * CURADORIA DE MERCADOS E NOMES DAS CASAS.
 *
 * Cada casa nomeia o mercado e grafa o jogador à sua maneira. Vínculo errado
 * aqui mostra a odd de um jogador no card de outro — por isso NADA é
 * automático. A fila povoa quando a coleta de odds existir (contrato com as
 * casas); a tela já opera sobre as tabelas.
 */
export default async function PaginaMercados() {
  const negado = await negarSeNaoForAdmin()
  if (negado) return negado
  if (!process.env.DATABASE_URL) return <BancoNaoConfigurado titulo="Mercados" />

  const db = getDb()
  const [listaCasas, mercados, vinculosDeCasa] = (await Promise.all([
    db.select().from(casas),
    db.select().from(mapaMercados),
    db.select().from(mapaJogadores).where(like(mapaJogadores.provedor, 'casa:%')),
  ])) as [Casa[], Mercado[], VinculoDeCasa[]]
  const nomeDaCasa = new Map(listaCasas.map((c) => [c.id, c.nome] as const))
  const pendentes = mercados.filter((m) => !m.confirmado)
  const confirmados = mercados.filter((m) => m.confirmado)

  return (
    <div className={s.tela}>
      <CabecalhoAdmin
        area="mercados"
        titulo="Curadoria de mercados"
        apoio="Cada casa nomeia o mercado e grafa o jogador do seu jeito. Nada é vinculado automaticamente: um vínculo errado mostraria a odd de um jogador no card de outro."
      />

      <GradeDeMetricas rotulo="Resumo da curadoria">
        <Metrica rotulo="Casas" valor={listaCasas.length} />
        <Metrica rotulo="Mercados pendentes" valor={pendentes.length} destaque={pendentes.length > 0} />
        <Metrica rotulo="Mercados confirmados" valor={confirmados.length} />
        <Metrica rotulo="Vínculos de jogador" valor={vinculosDeCasa.length} />
      </GradeDeMetricas>

      {listaCasas.length === 0 && (
        <Vazio>
          Nenhuma casa cadastrada. A coleta de odds aguarda o contrato comercial com as casas; quando ele
          chegar, a fila de curadoria povoa sozinha.
        </Vazio>
      )}

      <div className={s.grade}>
        <Painel titulo={`Mercados pendentes (${pendentes.length})`} apoio="Confirme a qual atributo o mercado da casa corresponde." largo>
          {pendentes.length === 0 ? (
            <Vazio>Fila vazia.</Vazio>
          ) : (
            <ul className={s.lista}>
              {pendentes.map((m) => (
                <li key={m.id}>
                  <span className={s.pilha}>
                    <span className={s.celulaPrincipal}>{m.nomeMercadoNaCasa}</span>
                    <span className={s.fraco}>{nomeDaCasa.get(m.casaId) ?? m.casaId}</span>
                  </span>
                  <FormAcao acao={confirmarVinculoDeMercado} compacto rotulo={`Confirmar ${m.nomeMercadoNaCasa}`}>
                    <input type="hidden" name="casaId" value={m.casaId} />
                    <input type="hidden" name="nomeMercadoNaCasa" value={m.nomeMercadoNaCasa} />
                    <Campo rotulo="Atributo">
                      <select name="atributo" defaultValue={m.atributo}>
                        {atributoEnum.enumValues.map((a) => (
                          <option key={a} value={a}>
                            {ROTULO_ATRIBUTO[a]}
                          </option>
                        ))}
                      </select>
                    </Campo>
                    <button type="submit" className={s.botao}>
                      Confirmar
                    </button>
                  </FormAcao>
                </li>
              ))}
            </ul>
          )}
        </Painel>

        <Painel titulo="Confirmados">
          {confirmados.length === 0 ? (
            <Vazio>Nenhum mercado confirmado ainda.</Vazio>
          ) : (
            <ul className={s.lista}>
              {confirmados.map((m) => (
                <li key={m.id}>
                  <span className={s.pilha}>
                    <span className={s.celulaPrincipal}>{m.nomeMercadoNaCasa}</span>
                    <span className={s.fraco}>{nomeDaCasa.get(m.casaId) ?? m.casaId}</span>
                  </span>
                  <span>→ {m.atributo in ROTULO_ATRIBUTO ? ROTULO_ATRIBUTO[m.atributo as keyof typeof ROTULO_ATRIBUTO] : m.atributo}</span>
                </li>
              ))}
            </ul>
          )}
        </Painel>

        <Painel titulo="Vínculos de jogador por casa">
          {vinculosDeCasa.length === 0 ? (
            <Vazio>Nenhum vínculo de jogador registrado.</Vazio>
          ) : (
            <ul className={s.lista}>
              {vinculosDeCasa.map((v) => (
                <li key={v.id}>
                  <span className={s.pilha}>
                    <span className={s.celulaPrincipal}>“{v.nomeNaLista}”</span>
                    <span className={s.fraco}>{v.provedor}</span>
                  </span>
                  {v.confirmadoEm ? (
                    <span className={s.fraco}>confirmado por {v.confirmadoPor}</span>
                  ) : (
                    <Status valor="PENDENTE" />
                  )}
                </li>
              ))}
            </ul>
          )}
        </Painel>
      </div>
    </div>
  )
}
