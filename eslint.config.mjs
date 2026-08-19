import coreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'
import prettier from 'eslint-config-prettier'

const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'coverage/**',
      'next-env.d.ts',
      // Rotas de runtime geradas por withWorkflow() a cada build. O próprio
      // gerador as mantém fora do git; lintar código gerado não tem valor.
      'src/app/.well-known/**',
    ],
  },
  ...coreWebVitals,
  ...nextTypescript,
  prettier,
  {
    rules: {
      // Prefixo _ marca argumento que a INTERFACE exige mas a implementação
      // não usa — remover quebraria a assinatura da porta.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
]

export default config
