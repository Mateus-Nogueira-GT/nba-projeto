import { withWorkflow } from 'workflow/next'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {}

// Habilita as diretivas "use workflow" e "use step". Sem isso o loop do 1º
// quarto compila como função comum e perde a durabilidade — ver ADR-0003.
export default withWorkflow(nextConfig)
