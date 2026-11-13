# Revio (nom provisoire) — Architecture

> Référence du projet (périmètre, stack, modèle de données, RGPD, sécurité). Version du 13/11/2026.

## Vision et périmètre V1

Revio est un programme de fidélité en SaaS, vendu par abonnement aux commerçants de la région : le client s'identifie sur une tablette, gagne des points et les échange contre des récompenses.

| Module | V1 | Plus tard |
|---|---|---|
| Écran tablette client (kiosque) | Oui | — |
| Écran caisse / commerçant | Oui | — |
| Base de données multi-commerces | Oui | — |
| Conformité RGPD complète | Oui | — |
| Back-office commerçant (stats, réglages, export) | Option | Inclus en offre Pro |
| Admin Revio (gestion des commerçants, abonnements) | Oui (minimal) | Complet |
| Wallet Apple / Google, badges NFC | — | V2 |
| Roue, niveaux, défis, parrainage | Roue + niveaux | Défis, parrainage |
| Cagnotte de quartier | — | V2 (offre Quartier) |
| Carte bancaire liée | — | V3 |

Cible : commerces de proximité (boulangerie, boucherie, coiffeur, café, librairie…), puis associations de commerçants et communes.

## Architecture globale

Une seule application web hébergée en Europe sert tous les commerçants (multi-tenant). Chaque magasin ne voit que ses propres données.

1. **App tablette (kiosque)** : application web installée en plein écran sur une tablette Android ou un iPad (PWA). Elle est liée à un magasin par un code d'appairage. Elle continue de fonctionner en cas de coupure internet et se resynchronise ensuite.
2. **App caisse / commerçant** : sur le PC ou le téléphone du vendeur. Elle sert à encoder le montant d'achat, valider les points et remettre les récompenses.
3. **Back-office commerçant** : stats, réglages des règles, liste des clients, export.
4. **Admin Revio** : espace pour créer les commerçants, gérer les abonnements et le support.
5. **API centrale** : toute la logique métier (calcul des points, récompenses, consentements) passe par elle. Les écrans ne calculent rien eux-mêmes.
6. **Base de données PostgreSQL** : une base unique, avec une colonne `merchant_id` sur chaque table et une isolation au niveau des lignes (Row Level Security).
7. **Services externes** : paiement des abonnements (Stripe), envoi de SMS / e-mails (fournisseur européen), sauvegardes automatiques.

Flux type : client tape son numéro sur la tablette → l'API le reconnaît → le vendeur encode le montant sur la caisse → l'API ajoute les points → la tablette affiche le nouveau solde (et la roue).

## Stack technique

Une stack unique en TypeScript, courante, pour aller vite et pouvoir recruter un développeur plus tard.

| Couche | Choix | Pourquoi |
|---|---|---|
| Front (tablette, caisse, back-office) | Next.js + React + Tailwind, en PWA | Un seul code pour les 3 écrans, installable en plein écran |
| API | Routes API Next.js (ou NestJS si ça grossit) | Moins de pièces à maintenir au départ |
| Base de données | PostgreSQL + Prisma | Fiable, relationnel, isolation par commerçant |
| Hébergement | Serveurs dans l'UE (ex. Supabase région Francfort, Scaleway ou OVH) | Exigence RGPD : données en Europe |
| Authentification commerçants | E-mail + mot de passe, 2FA pour les admins | Sécurité des comptes |
| Abonnements | Stripe Billing | Prélèvement mensuel, factures automatiques |
| SMS / e-mails | Fournisseur européen (ex. Brevo) | Codes de vérification, campagnes avec consentement |
| Mode hors-ligne tablette | Service worker + file d'attente locale | Le magasin ne bloque pas si le wifi tombe |

Tous ces choix sont à confirmer au lancement, selon les prix du moment.

## Modèle de données

Chaque client appartient à un commerçant (ou à un réseau de quartier en V2). Les points ne sont jamais stockés comme un simple total : chaque mouvement est une ligne, et le solde en est la somme. C'est plus facile à auditer et à corriger.

| Table | Contenu principal |
|---|---|
| `merchants` | Commerce : nom, TVA, adresse, abonnement, réseau éventuel |
| `networks` (V2) | Groupement de quartier : commerces membres, cagnotte, association bénéficiaire |
| `users` | Comptes du commerçant et de ses vendeurs, avec leur rôle (propriétaire, vendeur, admin Revio) |
| `devices` | Tablettes appairées à un magasin (code, dernier contact) |
| `customers` | Client : téléphone chiffré + empreinte pour la recherche, prénom (facultatif), PIN haché, niveau, date d'inscription, dernière visite |
| `consents` | Historique des consentements : CGU, fidélité, marketing SMS, marketing e-mail, date, version du texte, appareil |
| `point_transactions` | Mouvement de points : gain, dépense, bonus roue, correction, expiration, avec montant d'achat et vendeur |
| `rewards` | Catalogue de récompenses du commerçant (coût en points, stock, actif ou non) |
| `redemptions` | Récompense remise : client, vendeur, date |
| `rules` | Règles du commerçant : points par euro, seuils des niveaux, roue (lots + probabilités), expiration |
| `campaigns` (V2) | Défis du mois, envois SMS / e-mails |
| `audit_log` | Qui a fait quoi et quand (corrections de points, exports, suppressions) |
| `data_requests` | Demandes RGPD : accès, rectification, suppression, avec suivi et date de clôture |

## Écrans et parcours

### Tablette client

1. Écran d'accueil aux couleurs du commerce : « Tapez votre numéro ».
2. Client connu : PIN à 4 chiffres ou validation par le vendeur, puis affichage du solde, du niveau et de la prochaine récompense.
3. Nouveau client : inscription en 30 secondes (numéro, prénom facultatif, cases de consentement séparées, lien vers la politique de confidentialité), puis code SMS pour vérifier le numéro.
4. Après validation de l'achat par la caisse : animation des points gagnés, et roue si elle est activée.
5. Retour automatique à l'accueil après 10 secondes : aucune donnée ne reste affichée.

### Caisse / vendeur

1. Voir le client qui vient de s'identifier sur la tablette (prénom, solde).
2. Encoder le montant de l'achat, ce qui calcule les points automatiquement.
3. Remettre une récompense, avec déduction des points.
4. Rechercher un client, corriger des points (motif obligatoire, tracé dans l'audit).

### Back-office commerçant (option)

- Tableau de bord : clients actifs, passages, points distribués et utilisés, récompenses remises.
- Réglages : points par euro, récompenses, roue, niveaux, logo et couleurs.
- Clients : liste, fiche, export, traitement des demandes RGPD.
- Rapport hebdomadaire : clients fidèles inactifs depuis X semaines (V2).

### Admin Revio

- Créer et suspendre des commerçants, suivre les abonnements, appairer les tablettes, consulter les journaux pour le support.

## Identification client

V1 : numéro de téléphone + protection contre l'usurpation. Le code est prévu dès le départ pour accueillir d'autres moyens d'identification sans tout refaire.

| Moyen | Version | Vitesse | Remarque |
|---|---|---|---|
| Numéro + PIN 4 chiffres | V1 | ~5 s | Vérification par SMS à l'inscription, blocage après 5 essais ratés |
| Numéro + validation vendeur | V1 | ~5 s | Alternative au PIN, au choix du commerçant |
| Carte Apple / Google Wallet (QR) | V2 | ~1 s | Pas d'app à installer, la carte affiche les points |
| Badge ou porte-clés NFC | V2 | ~1 s | Idéal pour les clients sans smartphone |
| Carte bancaire liée | V3 | 0 s | Nécessite un partenariat avec un fournisseur de terminaux |

Reconnaissance faciale exclue : ce sont des données biométriques (article 9 du RGPD), trop risquées pour le produit.

## Règles de points et mécaniques

Toutes les règles sont des réglages du commerçant, avec des valeurs par défaut. Rien n'est codé en dur.

- **Gain** : X points par euro dépensé (défaut 1 point / 1 EUR), arrondi à l'inférieur, ou un montant fixe par passage.
- **Récompenses** : catalogue libre (ex. 100 points = un café offert, 250 points = 5 EUR de réduction).
- **Expiration** : points expirés après 12 mois sans visite (réglable), avec un rappel avant expiration si le client a consenti.
- **Niveaux** (V1) : Bronze, Argent, Or selon les points cumulés sur 12 mois, avec un bonus par niveau (ex. +10 % de points).
- **Roue** (V1, désactivée par défaut) : lots et probabilités réglés par le commerçant, une seule roue par jour et par client, tirage côté serveur.
- **Défis du mois et parrainage** (V2) : ex. 3 visites en novembre = bonus, 50 points pour le parrain et le filleul.
- **Cagnotte de quartier** (V2) : l'outil compte et affiche ; l'argent va directement du commerçant à l'association, jamais via Revio.
- **Anti-fraude** : plafond de points par jour et par client, alerte en cas de corrections anormales par un vendeur.

Point à vérifier avec un juriste : en Belgique, les jeux promotionnels avec tirage au sort (roue) sont encadrés (Code de droit économique, législation sur les jeux de hasard). Il faut s'assurer que la roue reste dans un cadre légal, par exemple sans obligation d'achat supplémentaire.

## RGPD

Chaque commerçant est responsable du traitement de ses clients ; Revio est son sous-traitant (article 28 du RGPD). Ce partage des rôles doit être écrit dans le contrat. L'outil doit permettre au commerçant d'être en règle sans effort de sa part.

### Documents à fournir (à faire relire par un avocat avant la première vente)

- [ ] Conditions générales de vente de l'abonnement Revio
- [ ] Contrat de sous-traitance (DPA) entre Revio et chaque commerçant
- [ ] Modèle de politique de confidentialité pour le client final, pré-rempli au nom du commerçant
- [ ] Registre des traitements de Revio et liste des sous-traitants ultérieurs (hébergeur, SMS, Stripe)
- [ ] Procédure en cas de fuite de données (notification à l'APD sous 72 h)
- [ ] Analyse d'impact (AIPD) à évaluer, surtout pour la V2 réseau de quartier

### Règles intégrées dans le produit

- **Minimisation** : seul le numéro est obligatoire, le prénom est facultatif. Pas de date de naissance, pas d'adresse, pas de carte d'identité. L'APD belge a déjà sanctionné une carte de fidélité qui exigeait la lecture de l'eID (décision 06/2019).
- **Bases légales séparées** : l'adhésion au programme repose sur le contrat. Le marketing SMS ou e-mail repose sur un consentement séparé, non coché par défaut, retirable à tout moment.
- **Information claire à l'inscription** : qui est responsable, pourquoi, combien de temps, quels droits. Lien vers la politique accessible sur la tablette.
- **Durée de conservation** : suppression ou anonymisation automatique après 24 mois d'inactivité (réglable, plafonné). La CNIL a sanctionné Carrefour notamment pour avoir gardé des clients fidélité inactifs depuis des années.
- **Droits des clients en un clic** pour le commerçant : export des données du client (accès et portabilité), rectification, suppression définitive, désinscription marketing.
- **Aucune revente ni transfert publicitaire** des données, écrit noir sur blanc. En France, la CNIL a infligé 3,5 millions d'euros d'amende pour un transfert de données de fidélité à un réseau social sans consentement valable.
- **Hébergement dans l'UE**, chez des sous-traitants qui ont eux-mêmes signé un DPA.
- **Réseau de quartier (V2)** : si plusieurs commerçants partagent les clients, ils deviennent probablement responsables conjoints. Il faut alors un accord entre eux et une information spécifique au client.
- **Mineurs** : programme réservé aux 16 ans et plus (case à cocher), ou pas de marketing pour les mineurs.

Ce document n'est pas un avis juridique. Un passage chez un avocat spécialisé en protection des données est à prévoir avant la commercialisation.

## Sécurité

- Numéros de téléphone chiffrés en base. La recherche se fait via une empreinte (HMAC), jamais en clair.
- PIN client et mots de passe hachés (Argon2 ou bcrypt), blocage après plusieurs essais ratés.
- Isolation stricte entre commerçants (Row Level Security + tests automatiques qui le vérifient).
- Tablette : jeton propre à l'appareil, révocable à distance, écran qui se réinitialise tout seul, numéro masqué à l'affichage (+32 4•• •• •• 12).
- HTTPS partout, limitation du nombre de requêtes, journal d'audit des actions sensibles.
- Sauvegardes chiffrées quotidiennes, avec un test de restauration chaque mois.
- Mises à jour de sécurité des dépendances automatisées.

## Offre commerciale et facturation

Un abonnement mensuel par commerce, sans engagement long, avec la tablette en option. Les prix sont des hypothèses de départ, à tester auprès des premiers commerçants.

| Offre | Prix indicatif HTVA | Contenu |
|---|---|---|
| Essentiel | 29 EUR / mois | Tablette + caisse, points, récompenses, RGPD inclus |
| Pro | 49 EUR / mois | + back-office, stats, roue, niveaux, rapport hebdomadaire |
| Quartier (V2) | Sur devis (~39 EUR / commerce / mois) | Réseau de commerces, points partagés, cagnotte, vente aux associations et communes |
| Tablette | Location ~10 EUR / mois ou vente | Tablette préconfigurée + support |

- Paiement par Stripe (domiciliation SEPA ou carte), factures automatiques.
- Essai gratuit d'un mois pour lever les freins.
- Prévoir une société ou une activité complémentaire déclarée avant la première facture, ainsi qu'une assurance RC professionnelle.

## Roadmap

1. **Phase 0 — Cadrage** : choix du nom définitif (vérifier que la marque et le nom de domaine sont libres), validation de la stack, rendez-vous avec un avocat RGPD.
2. **Phase 1 — MVP** : base de données, API, tablette, caisse, admin minimal, consentements et droits RGPD. Critère de sortie : un parcours complet qui fonctionne sur une vraie tablette.
3. **Phase 2 — Pilote** : 2 à 3 commerçants testés gratuitement pendant 1 à 2 mois. On mesure le taux d'inscription, le nombre de passages et les retours du commerçant.
4. **Phase 3 — Lancement payant** : Stripe, back-office Pro, roue et niveaux, documents juridiques finaux.
5. **Phase 4 — V2** : Wallet, NFC, défis, parrainage, offre Quartier avec cagnotte.
6. **Phase 5 — V3** : carte bancaire liée via un fournisseur de terminaux.

## Consignes de développement (prompt de démarrage)

1. Proposer d'abord l'arborescence du projet et le schéma Prisma complet, et attendre validation.
2. Ensuite, développer dans cet ordre : schéma + migrations, API (points, récompenses, consentements, droits RGPD), écran tablette, écran caisse, admin minimal.
3. Multi-tenant strict : `merchant_id` partout + Row Level Security + tests d'isolation.
4. Points = table de mouvements, solde calculé. Aucune règle en dur : tout dans la table `rules`.
5. Téléphones chiffrés + empreinte HMAC, PIN hachés, consentements versionnés.
6. Interface en français, pensée pour le tactile, nom du produit dans une seule variable de configuration (il va changer).
7. Un `CLAUDE.md` résume ces règles, et un fichier `PROGRESS.md` est tenu à jour.
