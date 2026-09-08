# Runbook — afiliados NIP

## Fronteiras

Esta área controla fatos comerciais. Ela não envia apostas nem pagamentos. As casas
existentes em `casas` continuam sendo fontes de odds; uma oferta comercial precisa de
cadastro próprio, URL HTTPS e host exato homologado.

## Ordem de configuração

1. Criar a casa em `/admin/afiliados`.
2. Criar ou convidar o parceiro. O convite dura sete dias, é de uso único e exige o
   mesmo e-mail da conta autenticada.
3. Criar uma oferta em rascunho. Ativá-la apenas quando URL, host, moeda e modalidade
   estiverem confirmados.
4. Criar o acordo com percentual do parceiro e início de vigência.
5. Criar campanha e link. O destino pode ser a página NIP ou a casa.
6. Testar `/r/{codigo}` com destino de homologação. `HEAD` e robôs conhecidos não
   devem criar atribuição.

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
é bloqueado enquanto houver erro ou pendência. A tela mostra o resultado de cada linha
e a versão do acordo é explícita, sem inferir um marco de vigência ainda não homologado.

## Liquidação manual

1. Registrar o recebimento externo da casa, com moeda, valor, data e referência.
2. Conferir a comissão importada e liberar um valor com motivo explícito.
3. Depois do pagamento fora da plataforma, registrar o repasse e alocá-lo à liberação.
4. Pagamentos parciais são aceitos; valor acima do saldo liberado é recusado.
5. Correções da casa geram ajuste vinculado à comissão original. Ajustes negativos
   após pagamento ficam visíveis como divergência e não descontam outro repasse.

## Antes de produção

- Aplicar migrations 0019 e 0020 antes do código da aplicação.
- Confirmar URL/host e parâmetros documentados de cada casa.
- Validar uma amostra real de relatório e sua granularidade.
- Definir armazenamento privado, retenção e autorização de comprovantes.
- Rodar typecheck, lint, boundaries, testes, build e fluxo autenticado.
