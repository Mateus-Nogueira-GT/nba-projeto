# ADR-0010 — Afiliados com rastreio próprio e liquidação manual

**Status:** aceito · 08/09/2026 · decisões D07–D18 da spec NIP

## Contexto

A NIP precisa saber qual link de parceiro foi acessado, quando uma saída para uma
casa foi emitida e quais resultados comerciais a casa informou. As casas e os
contratos ainda estão em definição; as integrações atuais fornecem somente odds.

## Decisão

- Todo link público resolve um código opaco persistido pelo administrador.
- Atribuição interna usa primeiro toque por 30 dias em UTC. Cliques posteriores
  permanecem no histórico e não trocam o titular da janela.
- Destinos externos exigem HTTPS e correspondência exata com o host da oferta.
- Clique, visita NIP, saída para casa e resultado importado são fatos diferentes.
- Relatórios entram por CSV, passam por prévia e só geram comissão após confirmação
  administrativa. Checksum do arquivo e ID externo por casa evitam duplicação.
- Cada linha conciliada referencia explicitamente a atribuição de primeiro toque e a
  versão do acordo. Link divergente, versão ausente ou moeda incompatível permanecem
  pendentes; a data do evento não escolhe contrato automaticamente.
- O livro preserva base, percentual versionado, moeda, ajustes e origem. Moedas não
  são somadas entre si.
- Recebimento da casa, liberação de comissão e repasse ao parceiro são registros
  separados. A plataforma não inicia pagamento; a liberação permanece manual até
  existir uma regra comercial homologada.
- Afiliados usam a autenticação existente, com vínculo e permissão próprios,
  independentes da assinatura esportiva.

## Relação com o ADR-0004

O ADR-0004 continua vigente. A extensão comercial permite redirecionamento para uma
página inicial homologada da casa e leitura de relatórios fornecidos pela operação.
Ela não permite envio de aposta, seleção automática de mercado, credencial de
apostador, acesso à conta da casa ou movimentação de dinheiro.

## Consequências

- Sem relatório conciliável, a NIP conhece cliques e saídas, mas não pode afirmar
  cadastro, depósito, chegada ao site ou comissão.
- UTMs descrevem campanha; identificadores comerciais específicos só serão usados
  após documentação da casa.
- Ajustes são lançamentos vinculados ao original. Histórico financeiro não é
  reescrito.
- Comprovantes ficam representados por uma chave privada; a escolha do armazenamento
  e da retenção precisa ser homologada antes de anexar documentos reais.
