#!/usr/bin/env bash
# Uso: scripts/captura-telas.sh [altura=1800] [padrão de teste=telas-]
# HTML real dos testes → Chrome nas quatro larguras do manual (320, 390, 768 e
# 1440), sem Next/Neon/.env. CAPTURA_LARGURAS=1440 recorta para uma só.
# Sai com código 1 se alguma tela tiver rolagem horizontal.
# CAPTURA_REUTILIZAR_HTML=1 refaz somente fotos de um HTML já conferido.
# CHROME, CONFERENCIA_DIR e CAPTURA_DIR podem substituir os caminhos padrão.
set -euo pipefail
cd "$(dirname "$0")/.."

ALTURA="${1:-1800}"
PADRAO="${2:-telas-}"
export CONFERENCIA_DIR="${CONFERENCIA_DIR:-.superpowers/conferencia}"
export CAPTURA_DIR="${CAPTURA_DIR:-.superpowers/capturas}"
export CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
if [[ ! "$ALTURA" =~ ^[1-9][0-9]*$ ]] || (( ALTURA < 320 || ALTURA > 10000 )); then
  echo "Altura deve ser um inteiro entre 320 e 10000." >&2
  exit 1
fi
if [ ! -x "$CHROME" ]; then
  echo "Chrome não encontrado; defina CHROME=/caminho/do/binário." >&2
  exit 1
fi

mkdir -p "$CONFERENCIA_DIR" "$CAPTURA_DIR"
if [ "${CAPTURA_REUTILIZAR_HTML:-0}" != "1" ]; then
  # Só remove artefatos de conferência conhecidos; preserva os relatórios.
  shopt -s nullglob
  htmls=("$CONFERENCIA_DIR"/*.html)
  if ((${#htmls[@]})); then rm -- "${htmls[@]}"; fi
  CONFERENCIA=1 npx --no-install vitest run "src/app/__tests__/${PADRAO}" --maxWorkers=1 --reporter=dot
fi
node scripts/captura-telas.mjs "$ALTURA"
