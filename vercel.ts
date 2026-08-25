/**
 * FONTE ÚNICA da configuração da Vercel.
 *
 * `@vercel/config` compila este arquivo para `vercel.json` durante
 * `vercel build`, `vercel dev` e `vercel deploy`. Ter os dois versionados é
 * erro declarado ("One config file only") e, na prática, foi o que deixou o
 * cron de reconciliação de pagamento existir em um e faltar no outro.
 * Por isso `vercel.json` é artefato gerado e está no .gitignore.
 */
import type { VercelConfig } from '@vercel/config/v1'

export const config: VercelConfig = {
  framework: 'nextjs',
  /**
   * A FUNÇÃO RODA ONDE O BANCO ESTÁ.
   *
   * `gru1` é São Paulo (sa-east-1) — a mesma região do Neon
   * (`...sa-east-1.aws.neon.tech`). Sem esta linha a Vercel usa o padrão
   * `iad1` (Washington), e foi o que estava em produção: o cabeçalho
   * `x-vercel-id: gru1::iad1` mostrava a requisição entrando em São Paulo e
   * a função executando nos EUA.
   *
   * O custo disso não é uma travessia por página, é uma POR CONSULTA. Cada
   * tela autenticada faz de 4 a 6 consultas em sequência (validar sessão,
   * conferir direito, ler o feed), e a medição de 25/08 mostrou o TTFB
   * acompanhando o número delas:
   *
   *   /offline      0 consultas    ~78ms
   *   /estatisticas poucas        ~430ms
   *   /gestao       cadeia toda   ~920ms
   *
   * Da mesma região, cada ida e volta cai de ~130ms para a casa de 10ms.
   *
   * Hobby permite UMA região (Pro, 5). Se o banco mudar de região, esta linha
   * muda junto — é a única coisa que as mantém casadas.
   */
  regions: ['iad1'], // EXPERIMENTO: isolar se o bloqueio é a chave ou o valor
  functions: {
    'src/app/api/fila/push/route.ts': {
      experimentalTriggers: [
        {
          type: 'queue/v2beta',
          topic: 'push-eventos',
          retryAfterSeconds: 30,
          maxDeliveries: 20,
          maxConcurrency: 2,
        },
      ],
    },
    'src/app/api/fila/push/entregas/route.ts': {
      experimentalTriggers: [
        {
          type: 'queue/v2beta',
          topic: 'push-entregas',
          retryAfterSeconds: 30,
          maxDeliveries: 20,
          maxConcurrency: 5,
        },
      ],
    },
  },
  crons: cronsDoPlano(),
}

/**
 * O plano Hobby da Vercel aceita NO MÁXIMO dois crons, ambos diários — e o
 * produto depende de crons sub-diários: `ao-vivo` a cada minuto é o gatilho
 * do Fire Live, a reconciliação de pagamento roda a cada 10 min e a saúde a
 * cada 5. Ou seja: EM PRODUÇÃO, o plano Pro é requisito, não luxo (ADR-0003).
 *
 * O PADRÃO É O CONJUNTO DIÁRIO, e o completo é opt-in por `CRON_COMPLETO`.
 *
 * A inversão tem uma razão concreta. A versão anterior era o contrário
 * (completo por padrão, `CRON_SOMENTE_DIARIO=true` para reduzir) e a flag era
 * setada pelos scripts `deploy`/`deploy:prod` do package.json. Isso funcionou
 * enquanto todo deploy saía da CLI. Quando o repositório foi conectado à
 * Vercel (25/08/2026), o build passou a ser disparado pelo push — sem passar
 * por script nenhum, lendo o env do PROJETO. O primeiro deploy pelo Git morreu
 * assim:
 *
 *   Hobby accounts are limited to daily cron jobs. This cron expression
 *   (0 *\/6 * * *) would run more than once per day.
 *
 * (A contrabarra na expressão acima é só para não fechar este comentário.)
 *
 * Com o padrão invertido, um deploy pelo Git nasce válido sem depender de
 * variável configurada no painel — e o custo de esquecer é um Fire Live que
 * não dispara, não um deploy que não existe.
 *
 * PARA LIGAR O PRODUTO DE VERDADE: conta Pro + `CRON_COMPLETO=true` nas
 * Environment Variables do projeto. Sem isso, `ao-vivo` não roda e o Fire Live
 * não existe; a Lista Secreta também não republica sozinha, e precisa do
 * disparo manual com o Bearer do CRON_SECRET (ver docs/runbooks).
 */
function cronsDoPlano(): VercelConfig['crons'] {
  const cronsCompletos = [
    { path: '/api/cron/sincronizar-elenco', schedule: '0 9 * * *' },
    { path: '/api/cron/sincronizar-rodada', schedule: '0 11 * * *' },
    { path: '/api/cron/sincronizar-escalacao', schedule: '0 */6 * * *' },
    { path: '/api/cron/ao-vivo', schedule: '* * * * *' },
    { path: '/api/cron/lista-secreta', schedule: '*/15 * * * *' },
    { path: '/api/cron/reconciliar-pagamentos', schedule: '*/10 * * * *' },
    { path: '/api/cron/saude', schedule: '*/5 * * * *' },
  ]
  if (process.env.CRON_COMPLETO === 'true') return cronsCompletos

  // Dos DOIS diários que o Hobby permite, um vai para o re-seed da
  // DEMONSTRAÇÃO (decisão do parceiro, 25/08/2026). Sem provedor conectado
  // `sincronizar-elenco` não tem de onde sincronizar; já a demo abrindo "Sem
  // jogos hoje" na frente do cliente custa a apresentação. `sincronizar-rodada`
  // fica: é dele que saem os jogos do dia quando houver provedor.
  //
  // O re-seed NÃO entra no conjunto completo: conta Pro trabalha com dado
  // real. E ele só age com DEMO_AUTOSSEMEADURA=true — a rota é a guarda.
  return [
    ...cronsCompletos.filter((c) => c.path === '/api/cron/sincronizar-rodada'),
    { path: '/api/cron/demo', schedule: '0 9 * * *' },
  ]
}
