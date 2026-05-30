#!/usr/bin/env bash

set -euo pipefail

CSV_FILE="${1:-backend/target/site/jacoco/jacoco.csv}"
OUTPUT_FILE="${2:-.github/badges/jacoco.svg}"

if [[ ! -f "$CSV_FILE" ]]; then
  echo "JaCoCo CSV not found: $CSV_FILE" >&2
  echo "Run 'mvn -f backend/pom.xml verify' first." >&2
  exit 1
fi

read -r missed covered < <(
  awk -F, 'NR>1 {m+=$4; c+=$5} END {printf "%d %d\n", m, c}' "$CSV_FILE"
)

total=$((missed + covered))
if [[ "$total" -eq 0 ]]; then
  percent=0
else
  percent=$(awk -v c="$covered" -v t="$total" 'BEGIN {printf "%d", (c/t)*100 + 0.5}')
fi

if   (( percent >= 90 )); then color="#4c1"
elif (( percent >= 80 )); then color="#97ca00"
elif (( percent >= 70 )); then color="#a4a61d"
elif (( percent >= 60 )); then color="#dfb317"
elif (( percent >= 50 )); then color="#fe7d37"
else                           color="#e05d44"
fi

label="coverage"
value="${percent}%"
label_w=63
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

echo "Wrote ${OUTPUT_FILE} (${percent}% — covered=${covered}, missed=${missed})"
