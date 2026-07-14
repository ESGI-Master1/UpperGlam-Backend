# Procedure incident Upper Glam

## Sources d'observabilite

- Logs backend structures : rechercher les champs `event`, `traceId`, `spanId`, `userId`.
- Alertes backend : rechercher les evenements `alert.api.*`, `alert.payment.*`, `alert.admin.*`.
- PostHog Logs production : verifier que `POSTHOG_PROJECT_TOKEN` est configure et que les logs arrivent avec `service.name=upperglam-backend`.
- Audit admin : consulter `/admin/audit-events` ou l'historique affiche dans le back-office.

## Alertes PostHog a creer

- API 5xx : filtre `event = alert.api.critical`.
- Paiement : filtre `event starts with alert.payment`.
- Admin : filtre `event starts with alert.admin`.

Canal recommande : email ou canal d'equipe deja utilise. Aucun nouveau service externe n'est ajoute dans le repo pour l'instant.

## Triage rapide

1. Identifier l'alerte et noter `traceId`, `event`, `alertArea`, `alertSeverity`.
2. Rechercher tous les logs du meme `traceId`.
3. Pour paiement, comparer `draftId`, `paymentId`, `bookingId` et l'etat Mollie.
4. Pour admin, ouvrir l'historique d'audit du dossier concerne.
5. Corriger ou rollbacker, puis noter l'incident dans le suivi projet.

## Uptime monitoring

Le monitoring uptime API et marketing necessite un service externe dedie a choisir plus tard. En attendant, les erreurs applicatives sont detectables via les alertes logs.

## Retention

- Les logs applicatifs sont envoyes vers PostHog Logs en production.
- La retention effective doit etre configuree dans le projet PostHog selon la politique du projet.
- Les tokens de reset et drafts expires sont nettoyes par la politique backend minimale.
