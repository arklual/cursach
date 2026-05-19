#!/usr/bin/env bash
# Генерация SVG-бейджика coverage для фронта из lcov.info (karma-coverage).
# Выходной файл — самодостаточный SVG, коммитится в репо (как и jacoco-бейдж).
#
# Usage: scripts/frontend-coverage-badge.sh [lcov_path] [svg_path]

set -euo pipefail

LCOV_FILE="${1:-frontend/coverage/fluxpilot-workflow-lab/lcov.info}"
OUTPUT_FILE="${2:-.github/badges/frontend-coverage.svg}"

if [[ ! -f "$LCOV_FILE" ]]; then
  echo "lcov.info не найден: $LCOV_FILE" >&2
  echo "Сначала: (cd frontend && npm run test:coverage)" >&2
  exit 1
fi

# lcov формат: LF = lines found (всего), LH = lines hit (покрыто). Сумма по всем SF-блокам.
read -r found hit < <(
  awk -F: '
    /^LF:/ { lf += $2 }
    /^LH:/ { lh += $2 }
    END    { printf "%d %d\n", lf, lh }
  ' "$LCOV_FILE"
)

if [[ "$found" -eq 0 ]]; then
  percent=0
else
  percent=$(awk -v h="$hit" -v f="$found" 'BEGIN {printf "%d", (h/f)*100 + 0.5}')
fi

if   (( percent >= 90 )); then color="#4c1"
elif (( percent >= 80 )); then color="#97ca00"
elif (( percent >= 70 )); then color="#a4a61d"
elif (( percent >= 60 )); then color="#dfb317"
elif (( percent >= 50 )); then color="#fe7d37"
else                           color="#e05d44"
fi

label="frontend coverage"
value="${percent}%"
label_w=120
value_w=44
total_w=$((label_w + value_w))
label_x=$((label_w * 10 / 2))
value_x=$(( (label_w + value_w / 2) * 10 ))

mkdir -p "$(dirname "$OUTPUT_FILE")"

cat > "$OUTPUT_FILE" <<EOF
<svg xmlns="http://www.w3.org/2000/svg" width="${total_w}" height="20" role="img" aria-label="${label}: ${value}">
  <title>${label}: ${value}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r"><rect width="${total_w}" height="20" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${label_w}" height="20" fill="#555"/>
    <rect x="${label_w}" width="${value_w}" height="20" fill="${color}"/>
    <rect width="${total_w}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="110">
    <text x="${label_x}" y="140" transform="scale(.1)" textLength="$((label_w * 10 - 80))">${label}</text>
    <text x="${value_x}" y="140" transform="scale(.1)" textLength="$((value_w * 10 - 80))">${value}</text>
  </g>
</svg>
EOF

echo "Wrote ${OUTPUT_FILE} (${percent}% — hit=${hit}, found=${found})"
