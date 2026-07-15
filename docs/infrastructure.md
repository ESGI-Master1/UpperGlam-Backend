# Infrastructure UpperGlam

Ce document est la procedure de reference pour reconstruire les environnements UpperGlam. Les secrets restent dans le gestionnaire de secrets de la plateforme et ne sont jamais commits.

## Prerequis

- Node.js 22 et npm 10+
- Docker Engine avec Docker Compose v2
- JDK 17, Android Studio et un SDK Android pour l'application mobile
- PM2 et Apache 2.4 uniquement sur le serveur de demo/production actuel

## Lancement local complet

1. Dans `UpperGlam-Backend`, copier `.env.example` vers `.env`, puis definir au minimum `APP_KEY`, `RESEND_API_KEY` et `MAIL_FROM`.
2. Lancer PostgreSQL et MinIO avec `docker compose up -d`, puis verifier `docker compose ps`.
3. Installer et initialiser l'API : `npm ci`, `node ace migration:run`, puis `npm run db:seed:dev` si des donnees de demo sont souhaitees.
4. Lancer l'API avec `npm run dev`. Le healthcheck est disponible sur `http://localhost:3333/`.
5. Dans `UpperGlam-Marketing`, copier `.env.example`, executer `npm ci`, puis `npm run dev`.
6. Dans `UpperGlam-Frontend`, copier `.env.example`, executer `npm ci`, `npm run android:check`, puis `npm run android`.

Sur un emulateur Android, `localhost` designe l'emulateur. Utiliser `http://10.0.2.2:3333` pour joindre une API lancee sur la machine hote. Un appareil physique doit utiliser l'adresse IP LAN de la machine.

## Variables par environnement

| Groupe          | Local                                        | Preview / demo                         | Production                                              |
| --------------- | -------------------------------------------- | -------------------------------------- | ------------------------------------------------------- |
| Backend runtime | `NODE_ENV=development`, `HOST=localhost`     | `NODE_ENV=production`, domaine de demo | `NODE_ENV=production`, `HOST=127.0.0.1` derriere Apache |
| PostgreSQL      | Compose local, identifiants de developpement | base et volume dedies                  | base dediee, identifiants forts et sauvegardes          |
| MinIO           | `localhost:9000`, HTTP                       | domaine ressources de demo en HTTPS    | `ressources.upperglam.fr:443`, HTTPS                    |
| CORS            | Vite et Expo locaux                          | uniquement domaines de demo            | uniquement domaines publics requis                      |
| Mollie          | cle `test_`, webhook public de test          | cle `test_` separee                    | cle `live_` injectee au deploiement                     |
| Email           | compte/sender de test                        | sender de demo                         | sender verifie de production                            |
| Observabilite   | desactivee ou console                        | projet PostHog de demo                 | token PostHog production et OTLP si utilise             |
| Mobile          | `EXPO_PUBLIC_APP_ENV=development`            | `preview`, API de demo                 | `production`, API publique                              |
| Marketing       | backend local                                | URLs de demo                           | URLs publiques et projet PostHog public                 |

Les fichiers `.env.example` des trois repos donnent la liste exhaustive. Toute variable `EXPO_PUBLIC_*` ou `VITE_PUBLIC_*` est embarquee dans le client et ne doit jamais contenir de secret.

## Seed de demonstration

Le seeder de developpement est destructif : il tronque les tables fonctionnelles avant de les remplir. Il est limite aux environnements `development` et `testing`.

```bash
npm run db:fresh:seed:dev
```

Le resultat est deterministe avec `DEMO_SEED=20260715`. Changer cette valeur produit un autre jeu coherent. Tous les comptes generes utilisent le mot de passe `UpperGlam123!`; ces comptes sont strictement interdits en production.

## Preview / staging

L'environnement de demo doit avoir ses propres DNS, base PostgreSQL, volume MinIO, tokens Mollie/PostHog et expediteur email. Le deploiement suit : installation verrouillee avec `npm ci`, migrations, build backend et marketing, redemarrage PM2, puis smoke tests API, funnel et mobile. Aucun seed destructif ne doit etre lance automatiquement.

Avant promotion en production : executer les trois `npm run workflow:check`, tester une pre-inscription, un paiement sandbox et la lecture d'un media, puis conserver l'identifiant du commit deploye.

## Sauvegarde PostgreSQL

- Executer chaque nuit un `pg_dump --format=custom` vers un stockage distinct du serveur.
- Chiffrer les sauvegardes, appliquer une retention indicative de 7 quotidiennes, 4 hebdomadaires et 6 mensuelles.
- Tester chaque mois une restauration dans une base isolee avec `pg_restore --clean --if-exists`.
- Sauvegarder avant toute migration risquee et documenter le point de restauration.

Exemple manuel depuis le Compose local :

```bash
docker compose exec -T postgres pg_dump -U root -d app --format=custom > upperglam.dump
docker compose exec -T postgres pg_restore -U root -d app_restore --clean --if-exists < upperglam.dump
```

## Stockage MinIO

Le bucket `MINIO_BUCKET_USER_IMAGES` est prive. L'API fournit des URLs signees temporaires et reste la seule autorite d'acces. Les donnees reposent dans le volume `minio_data` local ; en production, utiliser un disque persistant sauvegarde ou la replication vers un stockage objet distinct.

Activer le versioning du bucket en production, definir une politique de cycle de vie pour les objets orphelins et tester trimestriellement une restauration. Les identifiants MinIO sont propres a chaque environnement et sont renouveles apres tout incident.

## Apache et processus

Les vhosts de `apache2/` exposent `upperglam.fr`, `api.upperglam.fr` et `ressources.upperglam.fr`. Apache termine TLS et reverse-proxy les processus lies a `127.0.0.1`. `ecosystem.config.cjs` decrit les processus PM2 actuels.

Apres modification : `sudo apache2ctl configtest`, rechargement Apache, puis verification HTTPS des trois domaines. Ne jamais exposer directement PostgreSQL, la console MinIO 9001 ou les ports applicatifs sur Internet.
