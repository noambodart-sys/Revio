#!/usr/bin/env bash
# Réaffiche le QR code de la tablette et un nouveau code d'appairage,
# pendant que « npm run tablette » tourne dans une autre fenêtre du Terminal.
set -euo pipefail
cd "$(dirname "$0")/.."
[[ -x /opt/homebrew/bin/brew ]] && eval "$(/opt/homebrew/bin/brew shellenv)"
PORT="${PORT:-3000}"
URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' .tablette/tunnel.log 2>/dev/null | head -1 || true)
if [[ -z "$URL" ]]; then
  echo "Adresse du tunnel introuvable (.tablette/tunnel.log). Lance d'abord : bash scripts/tablette.sh"
  exit 1
fi
if ! curl -s -o /dev/null --max-time 5 "http://127.0.0.1:$PORT/"; then
  echo "Le tunnel existe ($URL) mais l'application ne répond pas sur le port $PORT."
  echo "Regarde la première fenêtre du Terminal : si elle affiche une erreur ou est revenue à l'invite %,"
  echo "relance-y : bash scripts/tablette.sh"
  exit 1
fi
set -a; . ./.env; set +a
CODE=$(npx tsx scripts/pairing-code.ts)
echo
node -e 'require("qrcode-terminal").generate(process.argv[1], { small: true })' "$URL/kiosque"
echo "Tablette : $URL/kiosque"
printf "\033[1mCode d'appairage : %s\033[0m   (valable 30 min)\n" "$CODE"
echo "Caisse   : $URL/caisse"
echo "Gestion  : $URL/gestion  (proprio@demo.local / demo-proprio-2026)"
echo "Appli du commerçant (téléphone) : $URL/app"
