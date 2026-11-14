# CLAUDE.md — règles du projet

Programme de fidélité SaaS multi-commerces (nom provisoire : voir `src/config/product.ts`).
Référence fonctionnelle : `docs/architecture.md`. Avancement : `PROGRESS.md` (à tenir à jour à chaque session).

## Règles non négociables

1. **Multi-tenant strict.** Toute donnée métier porte `merchant_id`. L'application lit et écrit
   uniquement via `withTenant(merchantId, tx => …)` (`src/server/db.ts`), qui fixe `app.merchant_id`
   pour la transaction ; PostgreSQL applique la Row Level Security (forcée, rôle `revio_app`).
   - `systemDb()` (rôle `revio_system`, BYPASSRLS) est réservé à : authentification, admin Revio, jobs.
     Toute écriture via `systemDb()` doit être auditée.
   - **Nouvelle table** : ajouter dans sa migration les `GRANT` pour `revio_app` / `revio_system`,
     `ENABLE` + `FORCE ROW LEVEL SECURITY` et la policy `tenant_isolation`, puis l'ajouter à
     `TENANT_TABLES` dans `tests/integration/isolation.test.ts`.
2. **Points = registre de mouvements.** `point_transactions` est append-only (pas d'UPDATE/DELETE
   pour `revio_app`, trigger d'immutabilité pour tous). Le solde est toujours `SUM(points)`.
   Pour corriger : un nouveau mouvement (`ADJUSTMENT` avec motif, `REVERSAL`).
3. **Aucune règle commerciale en dur.** Points par euro, niveaux, roue, expiration, conservation,
   plafond anti-fraude, bonus de régularité… sont dans `rules`, `tier_levels`, `wheel_prizes`,
   `bonus_periods`. Les modèles par métier (`src/config/templates.ts`) ne sont que des valeurs
   proposées, copiées dans ces tables. Tout bonus est une ligne dédiée du registre
   (`*_BONUS`), calculée dans `services/engagement.ts` et soumise au plafond quotidien. Seuls les paramètres
   techniques (durée de session, nb de SMS/heure…) sont dans `TECH` (`src/config/product.ts`).
4. **Données personnelles.**
   - Téléphone : chiffré AES-256-GCM (`encrypt`) + empreinte HMAC (`lookupHash`) pour la recherche,
     dans `customer_identifiers`. Jamais en clair en base, dans les logs ou l'audit.
     Affichage : uniquement la forme masquée (`+32 4•• •• •• 12`).
   - PIN, mots de passe : Argon2id. Codes SMS, jetons : empreinte uniquement.
   - Minimisation : seul le numéro est obligatoire. Ne jamais ajouter date de naissance, adresse, eID.
   - Consentements : une ligne par choix (append-only) liée à la version du texte (`legal_documents`).
     Marketing = consentement séparé, jamais pré-coché.
   - Effacement = anonymisation (`eraseCustomer`) ; les mouvements restent pour les stats.
5. **Toute la logique métier est dans `src/server/services/`.** Les routes API (`src/app/api/v1`)
   valident l'entrée (Zod), authentifient, ouvrent `withTenant` et appellent un service. Les écrans
   ne calculent rien.
6. **Offres.** Ce que chaque offre inclut est défini dans `src/config/plans.ts`. La roue et les niveaux
   ne s'appliquent que via `getRules()` (règles *effectives*, filtrées par l'offre) ; `getStoredRules()`
   ne sert qu'à l'écran de réglages.
7. **Interface en français**, pensée pour le tactile (grandes cibles, pavé numérique).
   Le nom du produit vient de `PRODUCT_NAME` uniquement.
8. **Échecs qui doivent être comptés** (PIN, code SMS) : le service renvoie un résultat au lieu de
   lever une exception, sinon la transaction annule l'incrément du compteur.

## Commandes

```bash
npm run db:setup          # crée la base locale et les rôles PostgreSQL (dev)
npm run db:migrate        # applique les migrations
npm run db:seed           # données de démo (affiche identifiants, secret 2FA, code d'appairage)
npm run db:test:setup     # base de test revio_test
npm test                  # tests unitaires + intégration (base réelle)
npm run typecheck
npm run dev               # http://localhost:3000
npm run jobs:run          # jobs quotidiens (expiration, conservation)
npm run tablette          # Mac : serveur de test + tunnel HTTPS + QR code pour une vraie tablette
npm run tablette:qr       # réaffiche le QR code + nouveau code d'appairage (serveur lancé)
```

Tests navigateur : `tests/e2e/parcours.mjs` puis `tests/e2e/gestion.mjs` (voir leur en-tête).

Écrans : `/kiosque` (tablette), `/caisse` (vendeur), `/gestion` (propriétaire), `/admin` (équipe).

## Repères

- Rôles PostgreSQL : `revio_owner` (migrations, `MIGRATION_DATABASE_URL`), `revio_app` (`DATABASE_URL`),
  `revio_system` (`SYSTEM_DATABASE_URL`).
- Authentification : tablette = jeton d'appareil (`Authorization: Bearer`) ; vendeurs = cookie
  `httpOnly` + contrôle d'origine (CSRF) ; admin Revio = 2FA TOTP obligatoire.
- Dates « du jour » (roue, plafond quotidien) : fuseau `BUSINESS_TIMEZONE`.
- Montants en centimes (`Int`). Jamais de flottant sur l'argent ou les points.
