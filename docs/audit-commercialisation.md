# Audit avant commercialisation

Mis à jour le 21/11/2026. Point de vue : un commerçant réel, un lundi matin, avec une file de clients.

## 1. Corrigé dans cette version

| Problème constaté | Correction |
|---|---|
| « Gestion » ou « Admin » renvoyait vers la caisse sans explication | Page claire : « réservé au propriétaire, vous êtes connecté en tant que Sam (vendeur) » + bouton pour changer de compte |
| Le vendeur devait retrouver le client à la main | Dès que le client tape son numéro sur la tablette, sa fiche s'ouvre **automatiquement** en caisse (signal sonore discret), clavier du montant prêt |
| Beaucoup de petits commerces n'ont **pas d'ordinateur** au comptoir | **Mode comptoir** : sur la tablette, « Espace vendeur » → code vendeur → montant → Valider. Récompenses et offres SMS aussi. Rien d'autre à acheter |
| Les vendeurs n'ont pas tous un e-mail | **Équipe** gérée par le propriétaire : prénom + code vendeur suffit ; e-mail facultatif pour la caisse sur ordinateur ; désactivation immédiate d'un vendeur qui part |
| Déconnexion de la caisse toutes les 12 h | Session de 30 jours, prolongée à l'usage (12 h pour l'admin) |
| Tablette « générique », trop d'emojis (« ça fait IA ») | 4 styles (Moderne, Chaleureux, Élégant, Pop), polices choisies, titre d'accueil, photo de fond, logo, couleur ; icônes dessinées à la place des emojis |
| Un client ne pouvait pas changer d'avis sur les SMS | « Mes préférences » sur la tablette : il active ou coupe les offres lui-même (tracé) |
| Clients qui avaient une carte papier ou un autre programme | « Reprendre une ancienne carte » en caisse : les points sont reportés, avec la trace de l'origine |

## 2. Bloquants avant le premier client payant

| # | Sujet | Pourquoi ça bloque | Qui | Effort |
|---|---|---|---|---|
| 1 | **Hébergement UE + nom de domaine + HTTPS** | Aujourd'hui le serveur tourne sur un Mac | Vous (compte, domaine) + moi (installation) | 1 à 2 j |
| 2 | **Sauvegardes chiffrées + test de restauration + alerte si le site tombe + tâches planifiées** (`jobs:run` chaque nuit, `jobs:automations` chaque heure) | Perdre les points des clients d'un commerçant = fin de la relation | Moi | 0,5 j |
| 3 | **SMS réels (Brevo)** : codes d'inscription, campagnes, nom d'expéditeur, réponses STOP reçues automatiquement | Sans SMS, pas d'inscription | Vous (compte) + moi | 1 j |
| 4 | **Mot de passe oublié par e-mail** | Sinon chaque oubli = un appel pour vous | Moi (via Brevo e-mail) | 0,5 j |
| 5 | **Abonnement Stripe** : essai d'un mois, prélèvement SEPA, factures, suspension si impayé | Encaisser | Vous (compte, société) + moi | 2 j |
| 6 | **Juridique** : CGV, contrat de sous-traitance (DPA), politique de confidentialité, règles du SMS marketing en Belgique, légalité de la roue | Obligatoire, et c'est ce qui rassure un commerçant | Avocat | — |
| 7 | **Société, TVA, RC professionnelle** | Facturer | Vous | — |
| 8 | **Kit tablette** : modèle conseillé, support antivol, alimentation permanente, mode kiosque (Accès guidé / épinglage), fiche d'installation imprimable | Une tablette qui s'éteint ou sort de l'app = programme mort | Vous + moi (fiche) | 0,5 j |
| 9 | **Support** : qui répond, par quel canal, appairage d'une tablette à distance | Les commerçants âgés appelleront | Vous | — |

## 3. Important dans les trois premiers mois

1. **Néerlandais (et anglais) sur la tablette.** À Bruxelles et en Flandre, c'est indispensable côté client. Le texte est déjà centralisé, la traduction est un chantier propre (2 à 3 j).
2. **Tablette sans internet** : aujourd'hui elle invite à donner son numéro au vendeur. À terme : mettre en file d'attente l'identification et l'achat, et les envoyer au retour du réseau.
3. **Mises à jour sans intervention** : la tablette doit se recharger seule quand une nouvelle version est en ligne (vérification de version la nuit).
4. **Suivi des erreurs** (outil hébergé en UE) : savoir qu'un commerçant a un problème avant qu'il appelle.
5. **Import de clients existants** (fichier d'un autre logiciel) : faisable, mais le consentement aux SMS ne se transfère pas. Chaque client devra le redonner. À valider avec l'avocat.
6. **Envoi programmé** des offres, et **IA** pour la rédaction (clé Anthropic).
7. **Test sur une vraie flotte** : iPad (Safari), tablette Samsung (Chrome), vieux Android. Taille du texte pour les clients âgés.
8. **Droits des vendeurs** : aujourd'hui un vendeur peut corriger des points (avec motif et alerte). À rendre réglable par le propriétaire.

## 4. Décisions commerciales à prendre

- **SMS inclus dans l'abonnement ?** Proposition : 100 SMS par mois inclus en Pro, puis packs. Un SMS coûte environ 5 à 10 centimes.
- **Tablette** : vente, location (~10 €/mois) ou le commerçant utilise la sienne ? La location simplifie le support (même modèle partout).
- **Positionnement face à Fidelity Box, Joyn et Piggy** : la simplicité (appli « à la Revolut »), les SMS dont le résultat est mesuré, le mode comptoir sans ordinateur, l'ancrage local (cagnotte de quartier à venir).
- **Pilote** : 2 à 3 commerces gratuits pendant 1 à 2 mois. Mesurer le taux d'inscription, le nombre de passages par client et le nombre d'offres envoyées. Récolter des citations pour la vente.

## 4 bis. Sécurité des dépendances (21/11/2026)

- Next.js passé de 15.1.6 à 15.5.29 : faille critique corrigée.
- Restent : PostCSS (interne à Next, ne traite que nos propres fichiers : risque faible) et Zod 3
  (épuisement mémoire sur des listes géantes : toutes nos listes ont une taille maximale). Passage à Zod 4 à planifier.
- À l'hébergement : mises à jour de sécurité automatiques des dépendances (Dependabot) et `npm audit` dans l'intégration continue.

## 5. Risques et parades

| Risque | Parade |
|---|---|
| Le vendeur oublie d'encoder l'achat | Fiche ouverte automatiquement, son, mode comptoir sur la tablette ; plus tard : lien avec la caisse enregistreuse |
| Fraude d'un vendeur (points à un proche) | Plafond quotidien, corrections avec motif, alertes, journal par vendeur, désactivation immédiate |
| Clients agacés par trop de SMS | Limite par client et par mois, plage horaire, STOP, préférences sur la tablette |
| Fuite de données | Numéros chiffrés, isolation par commerçant en base, aucun export de numéros, journal d'audit ; procédure de notification sous 72 h à rédiger |
| Dépendance à un seul développeur | Code documenté (CLAUDE.md, PROGRESS.md), 127 tests automatiques + 4 parcours navigateur |
