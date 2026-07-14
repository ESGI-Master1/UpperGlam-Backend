# UpperGlam-Backend

## Configuration production

Variables obligatoires ou sensibles a verifier avant de deployer :

- `APP_KEY` : cle applicative Adonis, secrete et propre a l'environnement.
- `NODE_ENV=production` et `LOG_LEVEL=info` ou plus restrictif.
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_DATABASE` : acces PostgreSQL production.
- `ACCESS_TOKEN_EXPIRES_IN` : duree de vie des tokens API.
- `RESEND_API_KEY`, `MAIL_FROM`, `FRONTEND_RESET_PASSWORD_URL` : envoi des emails de reset.
- `MINIO_ENDPOINT`, `MINIO_PORT`, `MINIO_USE_SSL`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET_USER_IMAGES`, `MINIO_REGION` : stockage medias.
- `MOLLIE_API_KEY`, `MOLLIE_REDIRECT_URL`, `MOLLIE_WEBHOOK_URL` : paiement et webhook PSP.
- `BOOKING_REFUND_CUTOFF_HOURS` : delai minimum avant remboursement automatique.
- `BOOKING_MODIFICATION_CUTOFF_HOURS` : delai minimum avant modification d'un rendez-vous.
- `CORS_ALLOWED_ORIGINS` : liste separee par virgules des origines autorisees. En production, aucune origine n'est autorisee si cette variable est vide.
- `OTEL_ENABLED`, `OTEL_SERVICE_NAME`, `OTEL_EXPORTER_OTLP_ENDPOINT` : OpenTelemetry.
- `POSTHOG_PROJECT_TOKEN`, `POSTHOG_LOGS_ENDPOINT` : export des logs applicatifs vers PostHog en production.

Les secrets ne doivent pas etre commits. Garder `.env.example` comme reference locale uniquement.
