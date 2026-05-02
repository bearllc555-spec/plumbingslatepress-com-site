#!/usr/bin/env bash
# Regenerates mockups/manifest.json from the current /mockups/_NNN/ folder layout.
# Run this whenever you add or remove a mockup folder, before zipping for deploy.
#
# Usage:  bash build-manifest.sh
#
# Output: writes mockups/manifest.json with [{n: "NNN", title: "..."}, ...]

set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="$DIR/mockups/manifest.json"

echo "[" > "$OUT"
first=1
for d in "$DIR/mockups"/_*/; do
  [ -d "$d" ] || continue
  n=$(basename "$d" | sed 's/^_//')
  title=$(grep -oP '<title>\K[^<]+' "$d/index.html" 2>/dev/null | head -1 || echo "Mockup _$n")
  # Strip "De Vito Plumbing & Heating —" prefix and decode &amp;
  title=$(echo "$title" \
    | sed 's/^De Vito Plumbing &amp; Heating *[—–-] *//' \
    | sed 's/^De Vito Plumbing & Heating *[—–-] *//' \
    | sed 's/&amp;/\&/g')
  if [ "$first" -eq 0 ]; then echo "," >> "$OUT"; fi
  printf '  {"n":"%s","title":"%s"}' "$n" "$title" >> "$OUT"
  first=0
done
echo "" >> "$OUT"
echo "]" >> "$OUT"

echo "Wrote $OUT:"
cat "$OUT"
