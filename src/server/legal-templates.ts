/**
 * Modèles de textes juridiques, pré-remplis au nom du commerçant à l'affichage.
 * ⚠️ BROUILLONS : à faire relire par un avocat spécialisé avant la première vente.
 * Variables : {{merchant_name}}, {{merchant_address}}, {{merchant_vat}}, {{product_name}}, {{retention_months}}
 */
export const LEGAL_TEMPLATES_VERSION = "2026-11-13";

export const LEGAL_TEMPLATES = {
  TERMS: `# Conditions du programme de fidélité de {{merchant_name}}

1. Le programme de fidélité est proposé gratuitement par {{merchant_name}} ({{merchant_address}}, TVA {{merchant_vat}}). Il est réservé aux personnes de 16 ans et plus.
2. Vous gagnez des points lors de vos achats, selon le barème affiché en magasin. Les points n'ont aucune valeur monétaire et ne peuvent être ni échangés contre de l'argent ni cédés.
3. Les points peuvent être échangés contre les récompenses proposées en magasin, dans la limite des stocks.
4. Les points expirent après une période sans visite indiquée en magasin.
5. Vous pouvez quitter le programme à tout moment en le demandant en magasin ; vos données sont alors supprimées.
6. Le commerçant peut modifier ou arrêter le programme en vous prévenant au préalable en magasin.`,

  PRIVACY_POLICY: `# Protection de vos données — programme de fidélité de {{merchant_name}}

**Responsable du traitement** : {{merchant_name}}, {{merchant_address}} (TVA {{merchant_vat}}).
**Sous-traitant** : {{product_name}}, qui héberge les données dans l'Union européenne pour le compte du commerçant.

**Données collectées** : votre numéro de GSM (obligatoire), votre prénom (facultatif), votre code PIN (stocké sous forme illisible), l'historique de vos points, de vos récompenses et de vos choix de consentement. Aucune date de naissance, adresse ou carte d'identité n'est demandée.

**Pourquoi** :
- gérer votre compte fidélité et vos points (base légale : l'exécution du contrat que constitue votre adhésion) ;
- vous envoyer des offres par SMS ou e-mail, uniquement si vous l'avez accepté (base légale : votre consentement, retirable à tout moment).

**Durée de conservation** : vos données sont supprimées automatiquement après {{retention_months}} mois sans visite, ou dès que vous le demandez.

**Destinataires** : uniquement {{merchant_name}} et ses sous-traitants techniques (hébergement, envoi de SMS). Vos données ne sont jamais vendues ni transmises à des fins publicitaires.

**Vos droits** : accès, copie (portabilité), rectification, suppression, retrait du consentement marketing. Adressez-vous au personnel du magasin. Vous pouvez aussi introduire une plainte auprès de l'Autorité de protection des données (www.autoriteprotectiondonnees.be).`,

  MARKETING_SMS: `J'accepte de recevoir par SMS les offres et informations de {{merchant_name}}. Je peux retirer mon accord à tout moment en magasin.`,

  MARKETING_EMAIL: `J'accepte de recevoir par e-mail les offres et informations de {{merchant_name}}. Je peux retirer mon accord à tout moment en magasin.`,
} as const;
