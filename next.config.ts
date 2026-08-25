import { withWorkflow } from 'workflow/next'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // O ruleset é lido do DISCO em runtime (entrega/ruleset-ativo.ts) — de
  // propósito, para o ativo continuar versionado em git (ADR-0002). O file
  // tracing do build não enxerga esse readFile: sem a inclusão explícita, o
  // YAML fica fora do bundle e TODA rota que avalia estratégia responde 500
  // em produção (ENOENT). A chave é glob de ROTA; o valor, do raiz do projeto.
  outputFileTracingIncludes: {
    '/*': ['config/ruleset.v1.yaml'],
    '/**': ['config/ruleset.v1.yaml'],
  },
  // Fotos dos jogadores vêm do CDN público da NBA (ver
  // src/modules/ingestao/demo/fotos.ts). Sem o domínio liberado aqui o
  // next/image recusa a URL e o build quebra.
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'cdn.nba.com', pathname: '/headshots/**' }],
  },
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
      {
        source: '/manifest.webmanifest',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }],
      },
    ]
  },
}

// Habilita as diretivas "use workflow" e "use step". Sem isso o loop do 1º
// quarto compila como função comum e perde a durabilidade — ver ADR-0003.
export default withWorkflow(nextConfig)
