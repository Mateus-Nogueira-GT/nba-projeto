import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { semantico } from '@/design-system/tokens/semantico'
import manifest from '../manifest'

/** O código sem os comentários — para afirmar sobre o que RODA, não sobre a prosa. */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

function dimensoesPng(caminho: string): { largura: number; altura: number } {
  const arquivo = readFileSync(caminho)
  expect(arquivo.subarray(1, 4).toString('ascii')).toBe('PNG')
  return { largura: arquivo.readUInt32BE(16), altura: arquivo.readUInt32BE(20) }
}

describe('manifest PWA', () => {
  it('fecha identidade, escopo, idioma, modo e cores nos tokens', () => {
    const resultado = manifest()
    expect(resultado).toMatchObject({
      id: '/',
      name: 'NIP',
      short_name: 'NIP',
      lang: 'pt-BR',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      background_color: semantico.textoSobreCor,
      theme_color: semantico.textoSobreCor,
    })
  })

  it.each([
    ['/icons/app-192.png', 192, 'any'],
    ['/icons/app-512.png', 512, 'any'],
    ['/icons/app-maskable-512.png', 512, 'maskable'],
  ])('referencia %s com dimensão e purpose corretos', (src, tamanho, purpose) => {
    const icone = manifest().icons?.find((item) => item.src === src)
    expect(icone).toMatchObject({ sizes: `${tamanho}x${tamanho}`, purpose })

    const caminho = `public${src}`
    expect(existsSync(caminho)).toBe(true)
    expect(dimensoesPng(caminho)).toEqual({ largura: tamanho, altura: tamanho })
  })

  it('fornece Apple Touch Icon e assets locais de notificação válidos', () => {
    expect(dimensoesPng('public/icons/apple-touch-icon.png')).toEqual({
      largura: 180,
      altura: 180,
    })
    expect(dimensoesPng('public/icons/notification.png')).toEqual({
      largura: 192,
      altura: 192,
    })
    expect(dimensoesPng('public/icons/badge.png')).toEqual({ largura: 96, altura: 96 })
  })

  it('serve o worker sem cache longo e com escopo explícito', () => {
    const configuracao = readFileSync('next.config.ts', 'utf8')
    expect(configuracao).toContain("source: '/sw.js'")
    expect(configuracao).toContain("value: 'public, max-age=0, must-revalidate'")
    expect(configuracao).toContain("{ key: 'Service-Worker-Allowed', value: '/' }")

    const registro = readFileSync('src/components/pwa/RegistrarServiceWorker.tsx', 'utf8')
    expect(registro).toContain("process.env.NODE_ENV !== 'production'")
  })

  // O convite de instalar saiu da tela (pedido do parceiro, 15/09). O painel
  // SOBREVIVEU porque ele também é o caminho da ATUALIZAÇÃO: apagar o
  // componente inteiro levaria junto o aviso de versão nova, e quem instalou o
  // PWA ficaria preso numa versão velha sem saber.
  it('não convida mais a instalar — nem por prompt, nem pelo passo a passo do celular', () => {
    // Sem os comentários: o cabeçalho do módulo CITA o convite removido para
    // explicar por que ele saiu, e essa explicação é justamente o que impede
    // alguém de reintroduzir o convite sem querer. O que não pode voltar é o
    // código que o exibe.
    const painel = semComentarios(readFileSync('src/components/pwa/PainelPwa.tsx', 'utf8'))
    for (const convite of [
      'Instale a NIP',
      'Instalar app',
      'Adicionar à Tela de Início',
      'adicionar à tela inicial',
      'beforeinstallprompt',
    ]) {
      expect(painel, `ainda convida a instalar: ${convite}`).not.toContain(convite)
    }
  })

  it('continua sendo o caminho da atualização', () => {
    const painel = semComentarios(readFileSync('src/components/pwa/PainelPwa.tsx', 'utf8'))
    expect(painel).toContain('Atualização disponível')
    expect(painel).toContain('aplicarAtualizacaoPwa')
  })

  it('mantém a página offline neutra e sem acesso a sessão ou banco', () => {
    const pagina = readFileSync('src/app/offline/page.tsx', 'utf8')
    expect(pagina).toContain('Nenhum dado')
    expect(pagina).not.toMatch(/sessaoAtual|getDb|DATABASE_URL|cookies\(/)
  })
})
