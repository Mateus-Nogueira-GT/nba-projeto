import { getDb } from '@/modules/dominio/db/cliente'
import { listarCandidatos } from '@/modules/entrega/backtest/candidatos'
import { rulesetAtivo } from '@/modules/entrega/ruleset-ativo'
import { listarUsuarios } from '@/modules/plataforma/admin/usuarios'
import { painelAdministrativo } from '@/modules/plataforma/afiliados/servico'
import { avisoDaTemporada, precosDosPlanos } from '@/modules/plataforma/assinatura/precos'
import { Atalho, Aviso, CabecalhoAdmin, GradeDeMetricas, Metrica } from '@/features/admin/componentes'
import { BancoNaoConfigurado, negarSeNaoForAdmin } from '@/features/admin/guarda'
import s from '@/features/admin/Admin.module.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Painel administrativo' }

/** O hub do painel: o estado de cada área num relance e o atalho para ela. */
export default async function PaginaAdmin() {
  const negado = await negarSeNaoForAdmin()
  if (negado) return negado
  if (!process.env.DATABASE_URL) return <BancoNaoConfigurado titulo="Painel administrativo" />

  const db = getDb()
  const ruleset = await rulesetAtivo()
  const [usuarios, candidatos, comercial] = await Promise.all([
    listarUsuarios(db),
    listarCandidatos(db),
    painelAdministrativo(db, {}, { fuso: ruleset.rodada.fuso }),
  ])

  let avisoTemporada: string | null = null
  try {
    avisoTemporada = avisoDaTemporada(precosDosPlanos(ruleset.rodada.fuso)?.fimDaTemporada ?? null, new Date())
  } catch {
    avisoTemporada = null
  }

  const bloqueados = usuarios.filter((u) => u.status === 'BLOQUEADO').length
  const assinantes = usuarios.filter((u) => u.direitoAtivo).length
  const ofertasAtivas = comercial.ofertas.filter((o) => o.status === 'ATIVA').length
  const linksAtivos = comercial.links.filter((l) => l.ativo).length

  return (
    <div className={s.tela}>
      <CabecalhoAdmin
        area="inicio"
        titulo="Painel administrativo"
        apoio="Contas, operação comercial, curadoria de dados e regras. Toda ação aqui é registrada com a sua conta."
      />

      {avisoTemporada && <Aviso tom="atencao">{avisoTemporada}</Aviso>}

      <GradeDeMetricas rotulo="Resumo do painel">
        <Metrica rotulo="Contas" valor={usuarios.length} apoio={`${bloqueados} bloqueada${bloqueados === 1 ? '' : 's'}`} />
        <Metrica rotulo="Com direito ativo" valor={assinantes} destaque />
        <Metrica rotulo="Parceiros" valor={comercial.parceiros.length} apoio={`${linksAtivos} link${linksAtivos === 1 ? '' : 's'} ativo${linksAtivos === 1 ? '' : 's'}`} />
        <Metrica rotulo="Ofertas ativas" valor={ofertasAtivas} apoio={`de ${comercial.ofertas.length} cadastrada${comercial.ofertas.length === 1 ? '' : 's'}`} />
      </GradeDeMetricas>

      <div className={s.atalhos}>
        <Atalho
          href="/admin/usuarios"
          titulo="Usuários"
          numero={usuarios.length}
          texto="Bloquear, desbloquear, excluir, emitir link de redefinição e adicionar contas."
        />
        <Atalho
          href="/admin/afiliados"
          titulo="Afiliados"
          numero={comercial.parceiros.length}
          texto="Casas, ofertas, acordos, campanhas, importação de relatórios, comissões e repasses."
        />
        <Atalho
          href="/admin/backtest"
          titulo="Backtest"
          numero={candidatos.length}
          texto="Compare um ruleset candidato com o ativo sobre o histórico e exporte o CSV."
        />
        <Atalho
          href="/admin/mapeamento"
          titulo="Mapeamento de jogadores"
          texto="Ligue o nome escrito na lista do CJ ao jogador do provedor. Toda ligação é confirmada por uma pessoa."
        />
        <Atalho
          href="/admin/mercados"
          titulo="Curadoria de mercados"
          texto="Confirme a que atributo corresponde cada mercado das casas e os nomes de jogador que elas usam."
        />
        <Atalho
          href="/admin/galeria"
          titulo="Galeria do design system"
          texto="Tokens, componentes e contraste do NIP v2 num lugar só."
        />
      </div>
    </div>
  )
}
