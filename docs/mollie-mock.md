# Paiement local sans compte Mollie

Le mode mock reproduit le parcours de paiement sans contacter Mollie, sans clé API et sans carte
de test. Il est destiné aux développements locaux et à la démonstration de soutenance.

## Configuration

Dans le `.env` du backend :

```dotenv
MOLLIE_API_KEY=
MOLLIE_MOCK=true
MOLLIE_MOCK_BASE_URL=http://192.168.1.20:3333
MOLLIE_REDIRECT_URL=upperglam://payment-return
```

`MOLLIE_MOCK_BASE_URL` doit être l’adresse par laquelle le téléphone peut atteindre le backend :

- avec un backend local, utiliser l’adresse IPv4 LAN du PC et le port Adonis, jamais `localhost` ;
- avec le backend public, utiliser par exemple `https://api.upperglam.fr`.

L’application mobile doit appeler le même backend avec `EXPO_PUBLIC_API_BASE_URL`.

Redémarrer le backend après toute modification du `.env`.

## Déroulement du test

1. Créer une réservation et choisir le paiement par carte.
2. Le navigateur ouvre le checkout Upper Glam marqué `MODE SIMULATION`.
3. Choisir `Valider le paiement`, `Simuler un refus`, `Annuler` ou `Expiration`.
4. La page rouvre l’application avec `upperglam://payment-return`.
5. L’application confirme le résultat auprès du backend.

Le scénario payé crée la réservation. Les trois autres scénarios laissent le paiement en échec et
ne créent pas de réservation.

Le mode mock simule aussi un remboursement réussi lors de l’annulation d’une réservation éligible.

## Préparation de l’application Android

Le schéma de retour `upperglam://` nécessite un build natif qui contient la configuration actuelle :

```powershell
npm run android:apk
```

Il n’est pas nécessaire de reconstruire l’APK à chaque changement du backend.

## Revenir au vrai Mollie

Configurer une clé de test Mollie et désactiver explicitement le mock :

```dotenv
MOLLIE_MOCK=false
MOLLIE_API_KEY=test_REMPLACER_PAR_LA_CLE
MOLLIE_WEBHOOK_URL=https://api.upperglam.fr/payments/webhooks/mollie
```

Le faux checkout devient alors inaccessible et le backend utilise l’API Mollie. Voir
[`mollie-test-mode.md`](mollie-test-mode.md) pour le parcours réel en environnement de test.
