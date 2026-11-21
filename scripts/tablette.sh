#!/usr/bin/env bash
# =============================================================================
# Test sur une vraie tablette, depuis un Mac — une seule commande : npm run tablette
#
#  1. installe ce qui manque (Node, PostgreSQL 16, cloudflared) via Homebrew
#  2. prépare la base de démo et génère un code d'appairage
#  3. construit l'application et la lance en mode production
#  4. ouvre une adresse HTTPS publique temporaire (tunnel Cloudflare, sans compte)
#     et affiche un QR code à scanner avec la tablette
#
# Les codes SMS ne sont PAS envoyés : ils s'affichent dans ce terminal.
# Données de démo uniquement : ne pas inscrire de vrais clients sur ce serveur de test.
# Ctrl+C pour tout arrêter.
#
# Option : bash scripts/tablette.sh --reset   → repart d'une base de démo neuve
# (efface les clients de test ; un nouveau secret 2FA admin est généré).
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${PORT:-3000}"
RESET=0
[[ "${1:-}" == "--reset" ]] && RESET=1
LOGDIR=".tablette"
mkdir -p "$LOGDIR"

bold() { printf "\033[1m%s\033[0m\n" "$*"; }
info() { printf "\033[36m▸ %s\033[0m\n" "$*"; }
fail() { printf "\033[31m✗ %s\033[0m\n" "$*"; exit 1; }
has() { command -v "$1" >/dev/null 2>&1; }

# --- 1. Outils -----------------------------------------------------------------
if ! has brew; then
  fail "Homebrew est requis. Installe-le avec la commande indiquée sur https://brew.sh puis relance « npm run tablette »."
fi
if ! has node; then info "Installation de Node.js…"; brew install node; fi
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[[ "$NODE_MAJOR" -ge 20 ]] || fail "Node.js 20 ou plus est requis (tu as $(node -v)). Lance : brew upgrade node"

PG_PREFIX="$(brew --prefix)/opt/postgresql@16"
if [[ ! -x "$PG_PREFIX/bin/psql" ]]; then info "Installation de PostgreSQL 16…"; brew install postgresql@16; fi
export PATH="$PG_PREFIX/bin:$PATH"
if ! pg_isready -q -h localhost; then
  info "Démarrage de PostgreSQL…"
  brew services start postgresql@16 >/dev/null
  for _ in $(seq 1 20); do pg_isready -q -h localhost && break; sleep 1; done
  pg_isready -q -h localhost || fail "PostgreSQL ne démarre pas (voir : brew services list)"
fi
if ! has cloudflared; then info "Installation de cloudflared (tunnel HTTPS)…"; brew install cloudflared; fi

# --- 2. Projet et base -----------------------------------------------------------
if [[ ! -d node_modules || package-lock.json -nt node_modules/.package-lock.json ]]; then
  info "Installation des dépendances (npm install)…"
  npm install --no-audit --no-fund
fi

if [[ ! -f .env ]]; then
  info "Création du fichier .env avec des clés aléatoires…"
  cp .env.example .env
  sed -i '' "s|^DATA_ENCRYPTION_KEY=.*|DATA_ENCRYPTION_KEY=\"$(openssl rand -base64 32)\"|" .env
  sed -i '' "s|^LOOKUP_HMAC_KEY=.*|LOOKUP_HMAC_KEY=\"$(openssl rand -base64 32)\"|" .env
fi
set -a; . ./.env; set +a

# Régénère le client Prisma : indispensable après une mise à jour du schéma (git pull)
info "Mise à jour du code d'accès à la base…"
npx prisma generate >/dev/null

info "Préparation de la base de démo…"
if [[ $RESET == 1 ]]; then
  info "Remise à zéro de la base de démo…"
  bash scripts/db-setup.sh --reset >/dev/null
else
  bash scripts/db-setup.sh >/dev/null
fi
npx prisma migrate deploy >/dev/null
npx tsx prisma/seed.ts > "$LOGDIR/seed.log"
PAIRING_CODE=$(grep -o "valable 30 min) : [A-Z0-9-]*" "$LOGDIR/seed.log" | awk '{print $NF}')
TOTP_LINE=$(grep "Secret 2FA" "$LOGDIR/seed.log" || true)
if [[ -n "$TOTP_LINE" ]]; then cp "$LOGDIR/seed.log" "$LOGDIR/premier-seed.log"; fi

# --- 3. Tunnel HTTPS (d'abord, pour connaître l'adresse publique) -------------------
# Libère le port (un ancien serveur encore lancé servirait l'ancienne version)
free_port() {
  local pids
  pids=$(lsof -ti "tcp:$PORT" -sTCP:LISTEN 2>/dev/null || true)
  if [[ -n "$pids" ]]; then kill $pids 2>/dev/null || true; sleep 1; fi
}
free_port

PIDS=()
cleanup() {
  echo
  info "Arrêt du serveur et du tunnel…"
  for p in "${PIDS[@]:-}"; do [[ -n "$p" ]] && kill "$p" 2>/dev/null || true; done
  free_port
  pkill -f "cloudflared tunnel --no-autoupdate --url http://localhost:$PORT" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

info "Ouverture du tunnel HTTPS…"
: > "$LOGDIR/tunnel.log"
cloudflared tunnel --no-autoupdate --url "http://localhost:$PORT" > "$LOGDIR/tunnel.log" 2>&1 &
PIDS+=($!)
URL=""
for _ in $(seq 1 40); do
  URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$LOGDIR/tunnel.log" | head -1 || true)
  [[ -n "$URL" ]] && break
  sleep 1
done
[[ -n "$URL" ]] || fail "Le tunnel n'a pas donné d'adresse (voir $LOGDIR/tunnel.log). Vérifie ta connexion internet et relance."

# --- 4. Application en mode production ------------------------------------------------
info "Construction de l'application (1 à 2 minutes la première fois)…"
npx next build > "$LOGDIR/build.log" 2>&1 || { tail -30 "$LOGDIR/build.log"; fail "La construction a échoué (voir $LOGDIR/build.log)"; }

export APP_URL="$URL" ALLOW_CONSOLE_SMS=true SMS_PROVIDER=console
npx next start -p "$PORT" &
PIDS+=($!)
for _ in $(seq 1 30); do curl -s -o /dev/null "http://localhost:$PORT/" && break; sleep 1; done

# --- Résumé ---------------------------------------------------------------------------
clear || true
bold "════════════════════════════════════════════════════════════════"
bold "  Serveur de test prêt"
bold "════════════════════════════════════════════════════════════════"
echo
bold "1) TABLETTE — scanne ce QR code avec l'appareil photo de la tablette :"
node -e 'require("qrcode-terminal").generate(process.argv[1], { small: true })' "$URL/kiosque" 2>/dev/null || true
echo "   ou tape : $URL/kiosque"
echo
bold "   Code d'appairage : $PAIRING_CODE   (valable 30 min)"
echo "   Plein écran — iPad : Safari › Partager › « Sur l'écran d'accueil »"
echo "                 Android : Chrome › ⋮ › « Installer l'application »"
echo
bold "2) CAISSE — sur ce Mac ou ton téléphone : $URL/caisse"
echo "   vendeur@demo.local / demo-vendeur-2026     (propriétaire : proprio@demo.local / demo-proprio-2026)"
echo
bold "3) APPLI DU COMMERÇANT (téléphone) — scanne avec ton téléphone :"
node -e 'require("qrcode-terminal").generate(process.argv[1], { small: true })' "$URL/app" 2>/dev/null || true
echo "   ou tape : $URL/app   (proprio@demo.local / demo-proprio-2026)"
echo "   Installer : Safari › Partager › « Sur l'écran d'accueil »"
echo
bold "   GESTION complète (ordinateur) — $URL/gestion"
echo "   proprio@demo.local / demo-proprio-2026"
echo
bold "4) ADMIN — $URL/admin"
echo "   admin@revio.local / admin-revio-dev-2026 + code 2FA"
echo "   (secret 2FA à ajouter dans une app d'authentification : voir $LOGDIR/premier-seed.log)"
echo
echo "Les codes SMS s'afficheront ci-dessous (📱). L'adresse change à chaque lancement."
echo "Ne pas utiliser avec de vrais clients. Ctrl+C pour tout arrêter."
bold "────────────────────────────────────────────────────────────────"
wait
