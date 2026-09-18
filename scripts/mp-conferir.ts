import { configuracaoProdutoPago } from '../src/modules/plataforma/assinatura/configuracao'
import { configDoAmbiente } from '../src/modules/plataforma/assinatura/mercadopago'
import { precosDosPlanos } from '../src/modules/plataforma/assinatura/precos'
import { NOME_DO_SKU, SKUS } from '../src/modules/plataforma/assinatura/sku'
import { rulesetAtivo } from '../src/modules/entrega/ruleset-ativo'

/**
 * CONFERE a configuração do Mercado Pago sem ligar nada — o espelho do
 * `odds:censo` para cobrança.
 *
 * Chama a API real com o token do ambiente e imprime o que encontrou. NÃO
 * cria assinatura, NÃO liga flag, NÃO escreve no banco. Existe para que o dia
 * da virada seja "conferir e ligar", não "ligar e descobrir".
 *
 *   npm run mp:conferir
 */
async function principal() {
  let falhou = false

  // --- Metade 1: as credenciais -------------------------------------------
  const config = configDoAmbiente()
  if (!config) {
    console.log('✗ MERCADOPAGO_ACCESS_TOKEN / MERCADOPAGO_WEBHOOK_SECRET ausentes.')
    console.log('  Preencha o .env.local com as credenciais de TESTE e rode de novo.')
    console.log('  Passo a passo: docs/runbooks/cobranca-e-acesso.md')
    process.exitCode = 1
    return
  }

  console.log(`ambiente sandbox: ${config.sandbox}`)
  // GET /users/me valida o token e mostra a conta, sem efeito colateral.
  const resposta = await fetch('https://api.mercadopago.com/users/me', {
    headers: { Authorization: `Bearer ${config.accessToken}` },
    signal: AbortSignal.timeout(8_000),
  })
  if (!resposta.ok) {
    console.error(`✗ token REPROVADO: HTTP ${resposta.status}`)
    process.exitCode = 1
    return
  }
  const eu = (await resposta.json()) as { id?: number; nickname?: string; site_id?: string }
  console.log(`✓ token aceito — conta ${eu.nickname ?? eu.id} (site ${eu.site_id ?? '?'})`)

  // Token de teste começa com TEST-; produção, com APP_USR-. Não é regra do
  // Mercado Pago escrita em pedra, mas trocar um pelo outro é o erro clássico
  // da virada — vale o aviso, não a interrupção.
  const pareceTeste = config.accessToken.startsWith('TEST-')
  if (pareceTeste !== config.sandbox) {
    console.log(
      `! atenção: MERCADOPAGO_SANDBOX=${config.sandbox} mas o token ${pareceTeste ? 'parece de TESTE' : 'não parece de teste'}`,
    )
  }

  // --- Metade 2: a configuração do produto --------------------------------
  try {
    const produto = configuracaoProdutoPago()
    const { fuso } = (await rulesetAtivo()).rodada
    const precos = precosDosPlanos(fuso)
    if (precos) {
      for (const sku of SKUS) {
        const preco = precos.porSku[sku]
        const de = preco.deCentavos ? ` (de R$ ${(preco.deCentavos / 100).toFixed(2)})` : ''
        console.log(`plano ${NOME_DO_SKU[sku]}: R$ ${(preco.centavos / 100).toFixed(2)}${de}`)
      }
      console.log(`temporada vendida até: ${precos.fimDaTemporada.toISOString()}`)
    } else {
      console.log('! preços dos planos não configurados — o seletor não mostra valor')
    }
    console.log(`checkout habilitado: ${produto.checkoutHabilitado}`)
    console.log(`cadastro público habilitado: ${produto.cadastroPublicoHabilitado}`)
    console.log(`URL pública: ${produto.urlPublica || '(ausente)'}`)
    if (produto.urlPublica) {
      console.log(`webhook a registrar no painel: ${produto.urlPublica}/api/webhook/mercadopago`)
    } else {
      console.log('! sem APP_PUBLIC_URL não há URL de webhook para registrar no painel')
    }
  } catch (erro) {
    falhou = true
    console.error(`\n✗ configuração do produto inválida: ${erro instanceof Error ? erro.message : erro}`)
  }

  console.log('\nPróximo passo: docs/runbooks/cobranca-e-acesso.md (ordem de homologação).')
  if (falhou) process.exitCode = 1
}

principal().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro)
  process.exitCode = 1
})
