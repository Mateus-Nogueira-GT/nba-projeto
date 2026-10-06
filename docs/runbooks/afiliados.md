# Runbook — afiliados NIP

## Fronteiras

Esta área controla fatos comerciais. Ela não envia apostas nem pagamentos. As casas
existentes em `casas` continuam sendo fontes de odds; uma oferta comercial precisa de
cadastro próprio, URL HTTPS e host exato homologado.

## Ordem de configuração

1. Criar a casa em `/admin/afiliados`.
2. Criar ou convidar o parceiro. O convite dura sete dias, é de uso único e exige o
   mesmo e-mail da conta autenticada.
3. Criar uma oferta em rascunho.
4. Criar o acordo com percentual do parceiro e início de vigência.
5. Ativar a oferta somente depois de validar URL, host, moeda, modalidade, contrato e
   teste de destino. A ativação exige um registro textual da homologação e um acordo
   na mesma moeda.
6. Criar campanha e link. O destino pode ser a página NIP ou a casa.
7. Testar `/r/{codigo}`. `HEAD` e robôs conhecidos não devem criar atribuição.

## CSV inicial

Arquivo UTF-8 separado por ponto e vírgula, com no máximo 1 MB e 10.000 linhas:

```csv
id_externo;indicado;data_evento;tipo;moeda;cpa_centavos;revshare_centavos;total_centavos;codigo_link;atribuicao_id;acordo_id
evento-001;ma***@exemplo.com;2026-09-08T10:00:00.000Z;HIBRIDO;BRL;10000;2500;12500;nip-campanha;00000000-0000-4000-8000-000000000001;00000000-0000-4000-8000-000000000002
```

- `data_evento`: ISO 8601 UTC.
- valores: inteiros em centavos; vazio significa ausente e `0` significa zero.
- `tipo`: `CPA`, `REVSHARE` ou `HIBRIDO`.
- em híbrido, `total_centavos` é a base quando informado; não somar o total novamente
  aos componentes.
- `id_externo` é único dentro da casa. Arquivo com o mesmo checksum é reutilizado.
- `atribuicao_id` identifica a janela interna de primeiro toque e `acordo_id` fixa a
  versão, o parceiro, a oferta e a moeda. Enquanto a casa não devolver identificadores
  conciliáveis, a operação deve enriquecer o arquivo com evidência auditável ou manter
  a linha pendente.
- `indicado` é mascarado novamente no servidor; não usar o arquivo para expor PII.

Upload cria uma prévia. Linhas sem link compatível ficam pendentes; confirmar o lote
é bloqueado enquanto houver erro ou pendência. A tela mostra o resultado de cada linha,
totais separados por moeda e a diferença entre o total declarado e seus componentes.
A versão do acordo é explícita, sem inferir um marco de vigência ainda não homologado.

## Liquidação manual

1. Registrar o recebimento externo da casa, com moeda, valor, data e referência.
2. Conferir a comissão importada e liberar um valor com motivo explícito.
3. Depois do pagamento fora da plataforma, registrar o repasse e alocá-lo à liberação.
4. Pagamentos parciais são aceitos; valor acima do saldo liberado é recusado.
5. Correções da casa geram ajuste vinculado à comissão original. Ajustes negativos
   após pagamento ficam visíveis como divergência e não descontam outro repasse.
6. Toda liberação referencia a comissão original e respeita o saldo líquido dos ajustes
   positivos e negativos já registrados.

## Indicações (sem pagamento)

Registra quem indicou cada conta — parceiro convidado ou outro usuário — e, se ela assinar
depois, o plano e a situação atual. **Nunca gera comissão nem mostra valor em dinheiro.**
Reaproveita o mesmo motor desta área: cookie, janela de 30 dias, primeiro toque, robôs e
pré-visualizações não contam.

- **Migração 0035** (`0035_silky_thunderbolt_ross`): rodar `db:migrate` **antes** do deploy
  do código — o código novo já assume as colunas, os `CHECK` e os índices que ela cria. Não
  faça a descida (`down`) depois que a funcionalidade estiver em uso: ela falha em três
  pontos, cada um disparado por um dado que passa a ser normal —
  - `SET NOT NULL` em `campanhas_afiliados.oferta_id`, assim que existir uma campanha de
    indicação (sem oferta);
  - ao recriar o `CHECK` antigo de `links_afiliados.tipo_destino` (só `NIP`/`CASA`), assim
    que existir um link `CADASTRO`;
  - ao recriar o `CHECK` antigo de `eventos_afiliados.tipo`, assim que existir uma linha
    `ASSINATURA_NIP`.
  Descer exigiria apagar esses dados antes, e com eles o histórico de indicações.
- **Link pessoal do usuário:** nasce sozinho na primeira vez que a conta abre `/conta`, sem
  passo manual. O código leva o prefixo `u-` (ex.: `/r/u-abc123`) e aponta direto para
  `/cadastrar`. Visitas seguintes a `/conta` só leem o link já existente — não há
  trava/lock nelas, só no instante da criação.
- **Link de indicação do parceiro:** o admin cria em `/admin/afiliados`, na opção "Link de
  indicação" — mesmo destino `/cadastrar`, sem oferta nem acordo. O canal `usuario` é
  reservado para o link pessoal e não pode ser escolhido ao criar um link de parceiro.
- **Tela `/admin/indicacoes`:** uma linha por conta indicada, com nome e e-mail, filtros
  (tipo de indicador, parceiro convidado, período) e totais. O nome do indicador em cada
  linha é um link para `/admin/indicacoes?parceiro=<id>` — é assim que se filtra por um
  indicador usuário comum, que não está no seletor. Acesso só ADMIN.
- **Painel do parceiro (`/afiliados`):** ganha os números de Cadastros e Assinaturas ao
  lado de cliques — nunca nomes.
- **Assinatura:** gravada depois do primeiro pagamento aprovado, fora da transação do
  pagamento em si. Se a gravação falhar, o pagamento segue normalmente e a falha vai para
  o log. A varredura que regrava o que faltou (idempotente, sem duplicar) roda **só** no
  cron `reconciliar-pagamentos`, que só existe com `CRON_COMPLETO=true` (plano **Pro**).
  **No Hobby, uma gravação que falhou não é refeita sozinha** — a conta aparece como
  "Não assinou" até alguém disparar a reconciliação à mão (Bearer do `CRON_SECRET`).
- **Situação na tela:** só quem assinou por pagamento (tem a linha `ASSINATURA_NIP`) tem
  situação lida da assinatura; quem nunca pagou aparece "Sem assinatura", mesmo que tenha
  cortesia do admin.
- **Indicação nunca gera comissão.** Cadastro e assinatura por indicação não entram na
  comissão de casa de aposta (D18), que continua exatamente como está.
- **Aceite de convite — os resultados possíveis.** Quem abre `/conta` ganha um parceiro
  pessoal (tipo `USUARIO`) com o link pessoal; o aceite trata isso assim:
  1. **Convite aponta um parceiro criado pelo admin e a conta tem parceiro pessoal:** o
     pessoal é **fundido** no do convite — campanhas, links e atribuições migram, o pessoal
     é apagado, e a conta fica ligada ao parceiro do admin. A fusão é recusada se o
     pessoal tiver linha comercial (acordo, importação, comissão ou repasse); nesse caso
     raro o admin resolve à mão.
  2. **Convite sem parceiro apontado e a conta tem parceiro pessoal:** o próprio pessoal é
     **promovido** a `PARCEIRO`, com o nome do convite; links e indicações ficam onde estão.
  3. **A conta já é `PARCEIRO` e o convite aponta outro parceiro:** o aceite é **recusado**
     ("Esta conta já é parceira; fale com a equipe NIP") — juntar dois parceiros
     comerciais é decisão do admin.
  (Sem parceiro nenhum, o aceite liga ao parceiro apontado ou cria um novo, como antes.)
- **Quem tem painel:** só parceiro `PARCEIRO` ativo vê `/afiliados`; o parceiro pessoal
  (`USUARIO`) cai em "sem parceria". `/admin/afiliados` também lista só `PARCEIRO` (com
  suas campanhas e links); os indicadores `USUARIO` aparecem em `/admin/indicacoes`, onde o
  nome de cada indicador filtra a lista por ele.

## Antes de produção

- Aplicar migrations 0019, 0020 e 0021 antes do código da aplicação.
- Aplicar a migração 0035 (indicações) antes do deploy — ver seção "Indicações (sem
  pagamento)" acima; não fazer a descida depois de haver campanhas de indicação.
- Confirmar URL/host e parâmetros documentados de cada casa.
- Validar uma amostra real de relatório e sua granularidade.
- Definir armazenamento privado, retenção e autorização de comprovantes.
- Rodar typecheck, lint, boundaries, testes, build e fluxo autenticado.
