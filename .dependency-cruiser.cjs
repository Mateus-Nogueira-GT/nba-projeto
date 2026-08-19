/**
 * GUARDA DE FRONTEIRA — IA da NBA
 *
 * A única regra de dependência que realmente importa neste projeto:
 * o motor (L2) é PURO. Sem I/O, sem rede, sem banco, sem relógio, sem framework.
 *
 * Se esta guarda cair, o motor deixa de ser testável e o backtest de rulesets
 * morre junto. Ver CLAUDE.md (regra 2), docs/01-arquitetura.md e ADR-0001/0002.
 */
module.exports = {
  forbidden: [
    {
      name: 'motor-sem-outras-camadas',
      severity: 'error',
      comment:
        'O motor (L2) não pode depender de ingestão, domínio, entrega, plataforma ou app. ' +
        'Fatos entram como argumento — o motor nunca vai buscar nada.',
      from: { path: '^src/modules/motor' },
      to: {
        path: '^src/(modules/(ingestao|dominio|entrega|plataforma)|app|design-system|workflows)',
      },
    },
    {
      name: 'motor-sem-builtin-node',
      severity: 'error',
      comment:
        'O motor não pode usar builtin do Node (fs, path, crypto, node:*). ' +
        'Ler arquivo é I/O; Date/crypto é estado externo. Tudo entra por Fatos.',
      from: { path: '^src/modules/motor' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'motor-sem-io-externo',
      severity: 'error',
      comment: 'O motor não pode depender de banco, framework web ou cliente de rede.',
      from: { path: '^src/modules/motor' },
      to: {
        path: 'node_modules/(next|react|react-dom|pg|postgres|drizzle-orm|@neondatabase|@vercel|axios|node-fetch)(/|$)',
      },
    },
    {
      name: 'componente-nao-usa-token-primitivo',
      severity: 'error',
      comment:
        'Componente que importa a paleta crua pulou duas camadas de token. ' +
        'Use semantico/componente — trocar a marca tem que ser um diff só no primitivo. ' +
        'Ver docs/04-design-system.md > Camadas de token.',
      from: { path: '^src/(design-system/componentes|app)' },
      to: { path: '^src/design-system/tokens/primitivo' },
    },
    {
      name: 'sem-dependencia-circular',
      severity: 'error',
      comment: 'Ciclo de importação indica fronteira mal desenhada.',
      from: {},
      to: { circular: true },
    },
  ],

  options: {
    doNotFollow: { path: 'node_modules' },
    // Sem exclusões. Os testes do motor também são verificados de propósito:
    // se um teste precisa importar outra camada, a regra 2 do CLAUDE.md foi violada.
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.js', '.jsx', '.ts', '.tsx'],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
}
