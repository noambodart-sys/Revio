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

## Tests

```bash
npm run db:test:setup
npm test
```

Règles de développement : `CLAUDE.md`. Avancement : `PROGRESS.md`.
