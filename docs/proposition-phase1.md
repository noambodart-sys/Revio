# Proposition Phase 1 — arborescence et schéma (à valider)

Le schéma complet est dans [`prisma/schema.prisma`](../prisma/schema.prisma) (validé par `prisma validate`).
Aucun code applicatif n'est écrit avant validation.

## Arborescence proposée

```
revio/
├── CLAUDE.md                  # règles du projet (résumé de l'architecture)
├── PROGRESS.md                # avancement, tenu à jour
├── docs/architecture.md       # référence
├── docker-compose.yml         # PostgreSQL 16 local
├── .env.example               # DATABASE_URL, clés de chiffrement / HMAC (jamais commitées)
├── prisma/
│   ├── schema.prisma
│   ├── migrations/            # migration initiale + SQL RLS, CHECK, triggers append-only
│   └── seed.ts                # commerce de démo, règles par défaut, niveaux, récompenses
├── public/                    # manifest PWA, icônes
├── src/
│   ├── config/product.ts      # PRODUCT_NAME = "Revio" (seule occurrence du nom)
│   ├── app/                   # Next.js App Router
│   │   ├── kiosque/           # tablette client (plein écran, tactile)
│   │   ├── caisse/            # écran vendeur
│   │   ├── gestion/           # back-office commerçant (option Pro)
│   │   ├── admin/             # admin Revio minimal
│   │   └── api/v1/            # routes API minces → appellent src/server/services
│   ├── server/                # toute la logique métier (jamais importée côté client)
│   │   ├── db/                # client Prisma + withTenant(merchantId, fn) pour la RLS
│   │   ├── crypto/            # AES-256-GCM, HMAC, Argon2id
│   │   ├── auth/              # sessions vendeurs, 2FA admin, jetons tablette
│   │   ├── services/          # points, rewards, tiers, wheel, consents, gdpr, customers, devices, kiosk
│   │   ├── jobs/              # expiration des points, anonymisation après inactivité
│   │   └── validation/        # schémas Zod des entrées API
│   ├── offline/               # service worker + file IndexedDB (clés d'idempotence)
│   ├── components/            # UI partagée (pavé numérique, boutons tactiles…)
│   └── i18n/fr.ts             # textes de l'interface
└── tests/
    ├── unit/                  # calcul des points, niveaux, roue, expiration
    ├── integration/           # API + base réelle, dont tests d'isolation multi-tenant
    └── e2e/                   # Playwright : parcours tablette → caisse complet
```

## Choix à valider

1. **Identification extensible** : le téléphone n'est pas une colonne de `customers` mais une ligne de
   `customer_identifiers` (type `PHONE`, empreinte HMAC + valeur chiffrée + 2 derniers chiffres pour
   l'affichage masqué). Wallet, NFC et carte bancaire s'ajouteront comme nouveaux types, sans migration
   de structure.
2. **Clé HMAC globale** (pas par commerçant) : l'unicité reste par commerçant, mais la V2 « réseau de
   quartier » pourra reconnaître le même numéro entre commerces. Le partage n'est jamais automatique.
3. **RLS avec Prisma** : l'application se connecte avec un rôle PostgreSQL dédié (`revio_app`, ni
   propriétaire ni superutilisateur, `FORCE ROW LEVEL SECURITY`). Chaque requête passe par
   `withTenant()`, qui ouvre une transaction et fait `set_config('app.merchant_id', …, true)`.
   L'admin Revio et les jobs utilisent un rôle séparé, explicitement autorisé et audité.
4. **Passage tablette → caisse** : nouvelle table `kiosk_sessions` (absente du document) qui relie
   l'identification sur la tablette à la validation sur la caisse, avec expiration courte.
5. **Codes SMS** : nouvelle table `phone_verifications` (code haché, essais, expiration).
6. **Consentements versionnés** : table `legal_documents` (texte + empreinte SHA-256 + version) ;
   `consents` est append-only, l'état courant est la dernière ligne par type. La base légale
   « contrat » de l'adhésion est représentée par l'acceptation des CGU (`TERMS`).
7. **Points** : `point_transactions` append-only (trigger SQL qui interdit UPDATE/DELETE), montants
   signés, bonus de niveau sur une ligne `TIER_BONUS` séparée, `idempotency_key` pour la resync
   hors-ligne, `occurred_at` (heure réelle) distinct de `created_at`. Les dépenses verrouillent la
   ligne client (`SELECT … FOR UPDATE`) pour empêcher un solde négatif en cas de double clic.
8. **Règles** : `rules` (1 ligne par commerçant) + `tier_levels` et `wheel_prizes` en tables filles
   typées plutôt qu'en JSON, pour valider les données en base.
9. **Suppression RGPD** : proposition d'**anonymiser** le client (identifiants, prénom, PIN et
   consentements marketing supprimés ; mouvements de points conservés sans lien identifiant) pour
   garder des statistiques justes au commerçant. Alternative : suppression totale en cascade.
   À confirmer avec l'avocat.
10. **Hors périmètre du schéma V1** : `networks` et `campaigns` (V2), ajoutés le moment venu.
11. **Montants** en centimes (`Int`), points en `Int`, `points_per_euro` en `Decimal(8,2)`.
