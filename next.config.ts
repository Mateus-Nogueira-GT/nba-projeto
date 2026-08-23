import { withWorkflow } from 'workflow/next'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
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
