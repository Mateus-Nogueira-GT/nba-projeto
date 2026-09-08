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
    /*
     * O gerador da temporada simulada é PURO pelo mesmo motivo que o motor: é o
     * que permite testar a distribuição — quantas oscilações, que sequências,
     * que médias — sem subir banco. Dia, elencos e semente entram como
     * argumento. Ele vive em `ingestao/`, onde I/O é a regra e não a exceção,
     * e por isso precisa de guarda própria: as três regras acima só olham para
     * `motor/`, e sem estas a pureza dele seria promessa de comentário — foi
     * exatamente o que a revisão da spec da temporada simulada apontou.
     * Ver docs/superpowers/specs/2026-09-06-temporada-simulada-design.md.
     */
    {
      name: 'simulacao-sem-outras-camadas',
      severity: 'error',
      comment:
        'O gerador da temporada simulada não pode depender de domínio, entrega, plataforma ' +
        'nem app. O que ele precisa saber entra como argumento.',
      from: { path: '^src/modules/ingestao/demo/simulacao\\.ts$' },
      to: { path: '^src/(modules/(dominio|entrega|plataforma)|app|design-system|workflows)' },
    },
    {
      name: 'simulacao-sem-builtin-node',
      severity: 'error',
      comment:
        'Nada de builtin do Node no gerador: ler arquivo é I/O e Date/crypto é estado ' +
        'externo. A lista de jogadores chega pronta; o dia chega como string.',
      from: { path: '^src/modules/ingestao/demo/simulacao\\.ts$' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'simulacao-sem-io-externo',
      severity: 'error',
      comment: 'O gerador não pode depender de banco, framework web ou cliente de rede.',
      from: { path: '^src/modules/ingestao/demo/simulacao\\.ts$' },
      to: {
        path: 'node_modules/(next|react|react-dom|pg|postgres|drizzle-orm|@neondatabase|@vercel|@electric-sql|axios|node-fetch)(/|$)',
      },
    },
    {
      name: 'estatisticas-nao-passam-pelo-motor',
      severity: 'error',
      comment:
        'A aba de estatísticas é EXIBIÇÃO DE DADO CANÔNICO, não estratégia ' +
        '(docs/00-visao.md). Se ela importar o motor, alguém começou a calcular ' +
        'apito numa tela de consulta — e o número mostrado deixa de ser o que a ' +
        'liga registrou para virar o que a estratégia deduziu. Nem tipo: aqui a ' +
        'proibição é total, ao contrário da regra do app.',
      from: { path: '^src/(modules/entrega/estatisticas|app/\\(app\\)/estatisticas)' },
      to: { path: '^src/modules/motor' },
    },
    {
      name: 'tela-nao-chama-o-motor',
      severity: 'error',
      comment:
        'A tela lê feed_snapshot materializado, NUNCA executa o motor. Avaliação ' +
        'acontece uma vez por evento, não uma vez por usuário — é isso que separa ' +
        '10k usuários de ser trivial ou impossível. Ver docs/01-arquitetura.md. ' +
        'Importar TIPOS do motor é permitido: vocabulário de domínio não é execução.',
      from: { path: '^src/app' },
      to: {
        path: '^src/modules/motor',
        dependencyTypesNot: ['type-only'],
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
