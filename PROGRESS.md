# PROGRESS

## Phase 1 — MVP

### Fait (13/11/2026)

- [x] Arborescence, schéma Prisma (19 tables) — validés
- [x] Migrations : schéma initial + sécurité (rôles, RLS forcée, droits, CHECK, registre immuable)
- [x] Services métier : points (gain, bonus de niveau, plafond quotidien, idempotence hors-ligne,
      corrections avec alerte anti-fraude, expiration), niveaux, récompenses (stock, annulation),
      roue (tirage serveur, 1/jour), consentements versionnés, inscription + code SMS, PIN
      (blocage après N essais, repli vendeur, PIN oublié), parcours tablette, RGPD (export,
      rectification, désinscription marketing, effacement, conservation automatique, suivi des
      demandes), appareils (appairage, révocation), comptes (Argon2id, blocage, 2FA admin), admin
- [x] API REST `/api/v1` : tablette, caisse, RGPD, réglages, admin
- [x] Écran tablette (`/kiosque`) : appairage, numéro, PIN, inscription, SMS, choix du PIN, solde,
      niveau, prochaine récompense, points gagnés, roue, remise à zéro automatique
- [x] Écran caisse (`/caisse`) : clients à la tablette, validation d'identité, montant, récompenses,
      correction, historique, droits RGPD (propriétaire), file d'achats hors-ligne
- [x] Admin minimal (`/admin`) : commerces, comptes, appairage/révocation des tablettes,
      suspension, journal d'audit
- [x] PWA : manifest, service worker (écrans en cache, jamais l'API)
- [x] Tests : 77 tests Vitest (calculs, crypto, TOTP, **isolation multi-tenant table par table**,
      parcours complets) + parcours navigateur Playwright (`tests/e2e/parcours.mjs`)

### Back-office commerçant (14/11/2026)

- [x] `/gestion` (propriétaire) : tableau de bord (offre Pro), clients (liste, recherche, export
      CSV à numéros masqués, accès à la fiche), récompenses, règles des points, roue et niveaux,
      apparence de la tablette (couleur, logo), suivi des demandes RGPD
- [x] Offres : `src/config/plans.ts` — roue, niveaux et tableau de bord réservés à l'offre Pro
- [x] La tablette recharge l'apparence et les règles à chaque retour à l'accueil
- [x] Tests : 84 tests Vitest + parcours navigateur `tests/e2e/gestion.mjs`
- [ ] Gestion de l'équipe (ajouter un vendeur) par le propriétaire : aujourd'hui via l'admin

### Différenciation, lot 1 (14/11/2026)

- [x] Tablette repensée : accueil en deux colonnes (paysage) ou empilé (portrait), couleurs du
      commerce, solde avec anneau de progression, compteur animé, confettis, bonus détaillés
- [x] Mode vitrine : après 30 s sans contact, diaporama (message du jour, récompenses, heures
      creuses, avantages, invitation à s'inscrire)
- [x] Heures creuses : créneaux à points multipliés (table `bonus_periods`), annoncés sur la
      tablette et la caisse
- [x] Bonus de régularité : Ne visite, N semaines d'affilée, anniversaire d'inscription
      (sans date de naissance) — lignes dédiées dans le registre, soumises au plafond quotidien
- [x] « Ce que votre programme vous apporte » : clients revenus après une absence et leurs achats,
      part des achats faite par les réguliers, passages en heures creuses, bonus offerts
- [x] Habitués à relancer (absents depuis plus de deux fois leur rythme habituel)
- [x] Modèles par métier (boulangerie, boucherie, café, coiffeur, librairie) : démarrage rapide
      dans `/gestion`, choix du métier à la création dans `/admin`
- [x] 99 tests Vitest + parcours navigateur (vitrine incluse)

### Appli du commerçant, version web (16/11/2026)

- [x] `/app`, pensée pour le téléphone et installable sur l'écran d'accueil : Aujourd'hui (chiffres du
      jour, suggestions), Clients (groupes prêts à l'emploi, fiche), Offre (assistant en 3 étapes),
      Résultats (clients venus dans les 7 jours, achats, offres utilisées)
- [x] Groupes : habitués, pas vus depuis 1 mois, nouveaux, meilleurs clients, proches d'une
      récompense, anniversaire de fidélité
- [x] 7 modèles de SMS + message libre, personnalisés (prénom, points, récompense), longueur calculée
- [x] Garde-fous : consentement marketing, limite de SMS par client et par mois (réglable),
      9 h – 20 h hors dimanche, mention STOP, numéros jamais montrés, audit
- [x] Offre reçue par SMS affichée sur la tablette et en caisse, appliquée en un clic
- [x] Suggestions du jour par règles simples (sans IA)
- [x] 117 tests + parcours navigateur `tests/e2e/appli.mjs`
- [ ] IA (rédaction des messages, suggestions) : nécessite une clé Anthropic
- [ ] Envoi réel (Brevo) et gestion des réponses STOP entrantes (webhook du fournisseur)
- [ ] Envoi programmé (aujourd'hui : envoi immédiat dans la plage horaire)
- [ ] Appli native (Expo) une fois le parcours validé par des commerçants

### Audit « prêt à vendre », lot 1 (21/11/2026)

Voir `docs/audit-commercialisation.md` (bloquants restants, décisions, risques).

- [x] Mauvais compte : page explicative au lieu d'une redirection muette vers la caisse
- [x] Caisse : fiche du client ouverte automatiquement dès qu'il s'identifie sur la tablette
- [x] Mode comptoir : encaisser, remettre une récompense, appliquer une offre ou confirmer
      l'identité sur la tablette avec un code vendeur (sans ordinateur)
- [x] Équipe gérée par le propriétaire (code vendeur, e-mail facultatif, désactivation) ;
      changement de mot de passe ; sessions de 30 jours glissants
- [x] Tablette personnalisable : 4 styles, titre, photo de fond ; icônes au lieu d'emojis (tablette + appli)
- [x] Préférences du client sur la tablette (offres SMS) ; reprise d'une ancienne carte en caisse
- [x] 127 tests + 4 parcours navigateur (dont `tests/e2e/comptoir.mjs`)

### Idées en attente (à valider avec des commerçants)

- [ ] Cagnotte solidaire pour une association du quartier (affichée sur la tablette)
- [ ] Défi collectif du quartier (« 1 000 passages en décembre = cadeau pour tous »)
- [ ] Passeport du quartier entre commerces voisins (offre Quartier, V2)
- [ ] « Ma carte » : page personnelle du client par lien SMS (solde, historique, suppression)

### Reste à faire pour clore la Phase 1

- [x] Inscription testée sur une vraie tablette (14/11/2026)
- [x] Outil de test tablette : `npm run tablette` (Mac — serveur de production local, tunnel
      HTTPS Cloudflare, QR code, codes SMS dans le terminal via `ALLOW_CONSOLE_SMS=true`)
- [ ] **Test sur une vraie tablette** (critère de sortie) : installation PWA plein écran sur iPad
      et Android, taille des touches, mode kiosque (accès guidé iOS / épinglage Android)
- [ ] Hébergement UE : choisir le fournisseur, créer les 3 rôles PostgreSQL, secrets, HTTPS, cron
      quotidien pour `npm run jobs:run`, sauvegardes chiffrées + test de restauration
- [ ] Compte Brevo (SMS) et test d'envoi réel ; nom d'expéditeur SMS
- [ ] Faire relire les textes modèles (`src/server/legal-templates.ts`) par l'avocat

### Limites connues / décisions prises

- **Hors-ligne** : les écrans restent disponibles sans réseau ; la *caisse* met les achats en file
  (IndexedDB) et les renvoie avec une clé d'idempotence. La *tablette* ne peut pas identifier un
  client sans réseau : elle invite à donner son numéro au vendeur. Un client dont la fiche n'était
  pas ouverte avant la coupure ne peut pas être crédité hors-ligne.
- **Consentement e-mail** : aucune adresse e-mail n'est collectée en V1 (minimisation), la case
  e-mail n'est donc pas proposée sur la tablette (enregistrée « non »). À ajouter avec la collecte
  de l'e-mail si besoin.
- **Lot « récompense » de la roue** : affiché sur la tablette et sur la fiche caisse du jour ; la
  remise n'est pas tracée séparément.
- **Rappel avant expiration des points** (SMS si consentement) : réglage présent
  (`expiry_reminder_days`), envoi pas encore implémenté.
- **Limitation de débit** en mémoire : suffit pour une instance ; passer à Redis si plusieurs.
- Tablette : changer de commerce = révoquer puis ré-appairer.

### Phase 3 (rappel)

Stripe Billing, back-office Pro (stats, réglages, export), documents juridiques finaux.
