import { withWorkflow } from 'workflow/next'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // O ruleset é lido do DISCO em runtime (entrega/ruleset-ativo.ts) — de
  // propósito, para o ativo continuar versionado em git (ADR-0002). O file
  // tracing do build não enxerga esse readFile: sem a inclusão explícita, o
  // YAML fica fora do bundle e TODA rota que avalia estratégia responde 500
  // em produção (ENOENT). A chave é glob de ROTA; o valor, do raiz do projeto.
  // A lista de níveis do CJ é lida do disco pelo seed da demonstração, que o
  // cron /api/cron/demo executa em runtime — mesma armadilha do ruleset: sem a
  // inclusão explícita o arquivo fica fora do bundle e a rota responde ENOENT.
  outputFileTracingIncludes: {
    '/*': ['config/ruleset.v1.yaml'],
    '/**': ['config/ruleset.v1.yaml'],
    '/api/cron/demo': ['config/ruleset.v1.yaml', 'data/fontes/introducao-ia-nba.md'],
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
        // Toda rota. Sem isto um site de fora embutia `/conta` num iframe e
        // induzia o clique em "cancelar assinatura" (auditoria 23/09). A CSP
        // leva SÓ `frame-ancestors`: uma política completa arrisca quebrar
        // script e fica para quando houver como testá-la no navegador.
        // Vem PRIMEIRO: quando duas regras batem, a última vence por chave —
        // e `/redefinir/:token` precisa manter o `no-referrer` dela.
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
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
      {
        // O token de redefinição de senha viaja no PATH (decisão registrada
        // na spec, §5.3): uso único e validade de uma hora limitam a janela
        // de exposição, mas o `Referer` para um destino EXTERNO continua
        // evitável — sem este cabeçalho, um link ou recurso de fora nesta
        // página vazaria a URL (e o token) pela origem da navegação
        // (achado da revisão final).
        source: '/redefinir/:token',
        headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }],
      },
    ]
  },
}

// Habilita as diretivas "use workflow" e "use step". Sem isso o loop do 1º
// quarto compila como função comum e perde a durabilidade — ver ADR-0003.
export default withWorkflow(nextConfig)
