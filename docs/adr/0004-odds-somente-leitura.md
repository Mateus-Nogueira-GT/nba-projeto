# ADR-0004 — Odds somente leitura, agregadas

**Status:** aceito · 18/08/2026 · decisão do cliente

## Contexto

A proposta (p.2, caixa vermelha) diz que o app não se conecta a casa de apostas. O
cliente reverteu: haverá integração — 2 casas com REST v2 documentada, outras em
negociação.

## Decisão

**Ler odds. Nunca enviar aposta.** As odds das casas são agregadas (mediana, mínimo de 2
casas) e exibidas como **faixa**. A tabela estática do documento do CJ vira _fallback_
para quando não houver cobertura.

## Consequências

- **Superfície regulatória menor:** sem vínculo de conta do usuário com a casa, sem
  credencial de casa, sem movimentação de dinheiro. Somos agregador de dado, não operador
  nem roteador de aposta. Nenhuma tabela dessas existe no modelo.
- O texto do doc do CJ ("a plataforma não possui acesso direto às odds") fica obsoleto —
  mas a mensagem ao usuário continua sendo _faixa média_, porque odd varia por casa e por minuto.
- Novo problema de mapeamento: nome de mercado de cada casa → nosso `(atributo, linha)`.
  Mesma natureza do mapa de jogadores, exige curadoria.
- Dois "greens" seguem distintos: o da **indicação** (jogador bateu a marca — só dado NBA)
  continua sendo o único implementado. O da **aposta** exige conta do usuário e está fora.
