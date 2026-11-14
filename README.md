# Programme de fidélité (nom provisoire)

SaaS de fidélité pour commerces de proximité : le client s'identifie sur une tablette, gagne des
points à la caisse et les échange contre des récompenses. Voir `docs/architecture.md`.

## Démarrer en local

Prérequis : Node.js 22, PostgreSQL 16.

```bash
npm install
cp .env.example .env           # puis générer les deux clés : openssl rand -base64 32
npm run db:setup               # base « revio » + rôles PostgreSQL
npm run db:migrate
npm run db:seed                # affiche les identifiants de démo et un code d'appairage
npm run dev
```

- Tablette : http://localhost:3000/kiosque (saisir le code d'appairage). En dev, les SMS sont
  affichés dans la console du serveur.
- Caisse : http://localhost:3000/caisse (`vendeur@demo.local` / `demo-vendeur-2026`)
- Admin : http://localhost:3000/admin (`admin@revio.local` / `admin-revio-dev-2026` + code 2FA :
  ajouter le secret affiché par le seed dans une app d'authentification)

## Tester sur une vraie tablette (Mac)

Une seule commande, depuis le dossier du projet :

```bash
npm run tablette
```

Elle installe ce qui manque (Node.js, PostgreSQL 16, cloudflared, via [Homebrew](https://brew.sh)),
prépare la base de démo, lance l'application en mode production et ouvre une adresse HTTPS
temporaire (tunnel Cloudflare, sans compte). Le terminal affiche ensuite :

- un **QR code** à scanner avec l'appareil photo de la tablette (ouvre l'écran client) ;
- le **code d'appairage** à saisir sur la tablette ;
- l'adresse de la **caisse** à ouvrir sur le Mac ou un téléphone ;
- les **codes SMS**, qui ne sont pas envoyés mais affichés dans le terminal.

Plein écran : sur iPad, Safari › Partager › « Sur l'écran d'accueil » ; sur Android, Chrome › ⋮ ›
« Installer l'application ». Pour bloquer la tablette sur l'app : Accès guidé (iPad) ou épinglage
d'écran (Android). Pour réafficher le QR code avec un nouveau code d'appairage, dans une **autre** fenêtre du
Terminal : `npm run tablette:qr`. `Ctrl+C` arrête tout. L'adresse change à chaque lancement.

⚠️ Serveur de test : données de démo uniquement, pas de vrais clients.

## Tests

```bash
npm run db:test:setup
npm test
```

Règles de développement : `CLAUDE.md`. Avancement : `PROGRESS.md`.
