# Mollie - préparation du mode test

Le mobile peut rester installé localement. En revanche, le backend et son webhook doivent être
joignables par Mollie sur une URL HTTPS publique.

## 1. Créer et configurer le compte

1. Créer un compte : <https://my.mollie.com/dashboard/signup?lang=fr>
2. Créer un profil de site pour `https://upperglam.fr`.
3. Dans le Dashboard, ouvrir `Developers` puis `API access tokens`.
4. Copier la clé de test qui commence par `test_`.
5. Activer le paiement par carte sur le profil. En mode test, la méthode est utilisable
   immédiatement.

Ne jamais placer la clé Mollie dans l'application mobile. Elle appartient uniquement au backend.

## 2. Configurer le backend

Dans `.env` :

```dotenv
MOLLIE_API_KEY=test_REMPLACER_PAR_LA_CLE_DU_DASHBOARD
MOLLIE_REDIRECT_URL=upperglam://payment-return
MOLLIE_WEBHOOK_URL=https://api.upperglam.fr/payments/webhooks/mollie
```

Si le backend public `api.upperglam.fr` n'est pas utilisé, exposer le port local `3333` avec un
tunnel HTTPS, puis remplacer `MOLLIE_WEBHOOK_URL` par :

```dotenv
MOLLIE_WEBHOOK_URL=https://DOMAINE_DU_TUNNEL/payments/webhooks/mollie
```

Le mobile doit alors utiliser cette même API publique ou une adresse LAN qui pointe vers le backend
ayant créé le paiement. Le serveur recevant le webhook doit posséder la même clé Mollie de test.

## 3. Appliquer la migration

La migration `1773000000025_add_card_payment_method.ts` ajoute `card` à l'énumération PostgreSQL :

```powershell
node ace migration:run
```

Redémarrer ensuite le backend pour recharger les variables d'environnement.

## 4. Reconstruire l'application

Le schéma `upperglam://` a été ajouté à `app.json`. Un nouveau build natif est nécessaire :

```powershell
npm run android:apk
```

Le checkout Mollie renvoie désormais vers `upperglam://payment-return`. L'application retente
automatiquement la confirmation pendant quelques secondes si le webhook n'est pas encore arrivé.

## 5. Cartes de test Mollie

Ces cartes sont réservées au mode test :

| Marque | Numéro | Expiration | CVV |
|---|---|---|---|
| Visa | `4543 4740 0224 9996` | n'importe quelle date future | n'importe quelle valeur |
| Mastercard | `2223 0000 1047 9399` | n'importe quelle date future | n'importe quelle valeur |
| American Express | `3782 822463 10005` | n'importe quelle date future | n'importe quelle valeur |

Sur le checkout de test, choisir le résultat `Paid` pour valider le parcours, puis tester également
`Failed`, `Canceled` et `Expired`.

Référence officielle : <https://docs.mollie.com/reference/testing>

## 6. Checklist de validation

- La création de l'intention renvoie un identifiant `tr_...` et une URL de checkout.
- Le navigateur ouvre le checkout Mollie de test.
- Le retour `upperglam://payment-return` rouvre l'application.
- Le webhook répond `200 OK`.
- Une réservation payée apparaît dans `Mes rendez-vous`.
- Un paiement refusé ne crée aucune réservation et libère le créneau.
- Un second appel avec la même clé d'idempotence ne crée pas un second paiement.
- Une annulation éligible crée un remboursement Mollie de test.
