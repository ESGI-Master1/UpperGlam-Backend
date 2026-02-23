---
apply: always
---

# 🔒 Upper Glam — Strict Backend API Development Guidelines (IA Ultra Cadrée)

## ⚠️ CONTEXTE PROJET (OBLIGATOIRE)

Upper Glam est une **plateforme** de mise en relation instantanée entre :
- **Clients** (particuliers) cherchant une prestation beauté rapide, fiable et personnalisée.
- **Prestataires** (professionnel(le)s indépendants) souhaitant gérer profil, prestations, disponibilités et réservations.

Le backend est un **serveur API principal** en **Node.js + TypeScript + AdonisJS**, avec une **base PostgreSQL**.

Objectifs techniques clés :
- Parcours **mobile-first**, API-first
- **Architecture hexagonale / clean code** : séparation stricte domaine / application / infrastructure
- **Scalabilité** via traitements asynchrones (workers / files de messages)
- Intégration progressive de services tiers (recherche, géo, média, paiement, logs, tracking)

Le repo **UpperGlam-Backend** contient **uniquement l’API** et ses briques techniques.

---

# 🧱 STACK & PRINCIPES NON-NÉGOCIABLES

## Stack (Fixe)

- **Node.js**
- **TypeScript strict**
- **AdonisJS**
- **PostgreSQL**
- Files/Workers : **Redis + BullMQ** (référence)
- Observabilité erreurs : **Sentry** (référence)
- Paiement : **Mollie** (référence)
- Recherche : **Meilisearch** (référence)
- Géo : **OSRM** (référence)
- Média : **FFmpeg / Sharp** (référence)
- Tracking produit : **PostHog** (envisagé)

✅ La mise en place peut être **progressive** (MVP → enrichissement), mais **la structure** doit être respectée dès le premier commit sérieux.

---

# 🏗️ ARCHITECTURE (HEXAGONALE) — RÈGLES STRICTES

## Objectif
Isoler le **domaine** de tout détail technique pour :
- limiter le couplage,
- faciliter les tests,
- permettre l’évolution des adaptateurs (DB, paiement, moteurs, etc.).

## Folder Structure (OBLIGATOIRE)

> AdonisJS impose certains dossiers. On respecte Adonis, **mais on impose notre découpage interne**.

```
/app
  /domain
    /entities
    /valueObjects
    /services
    /errors
    /ports          # interfaces (repositories, gateways, queues, etc.)
  /application
    /useCases
    /dto
    /mappers
  /infrastructure
    /http
      /controllers
      /requests     # validators / schemas
      /presenters
      /routes       # si besoin d’isoler par module
    /db
      /models       # Lucid models
      /repositories # implémentations des ports
      /migrations
    /queue
      /jobs
      /workers
    /integrations
      /mollie
      /meilisearch
      /osrm
      /media
      /sentry
/config
/start
/tests
```

❌ Aucune autre structure n’est acceptée.

## Règles de dépendances (sens unique)
- `domain` **ne dépend de rien** (aucun Adonis, aucun Lucid, aucun SDK).
- `application` dépend de `domain` uniquement.
- `infrastructure` peut dépendre de `application` + `domain`.
- `http/controllers` **appelle uniquement** des `useCases` (jamais la DB directement).

❌ Interdit :
- importer `@ioc:*`, `HttpContext`, `Database`, `Model`, `Queue`, `Mollie SDK`, etc. dans `domain/` ou `application/`.

---

# 📦 DEPENDENCIES — LISTE BLANCHE / LISTE NOIRE

## Autorisées (si nécessaire)
- AdonisJS (core + modules)
- PostgreSQL driver / Lucid ORM
- BullMQ + ioredis (ou équivalent Redis)
- Sentry SDK
- Mollie SDK
- Meilisearch client
- Clients OSRM (HTTP)
- Outils tests : Jest (prévu), supertest (si utile)

## Interdites (par défaut)
- ORMs alternatifs (Prisma, TypeORM, Sequelize)
- Frameworks non-Adonis (NestJS, Express “from scratch”)
- Bibliothèques “magiques” de validation non maîtrisées
- Heavy DI containers externes
- Ajout de dépendances sans justification en PR

Règle :
> **Toute nouvelle dépendance** doit être justifiée par un ticket + un mini RFC dans `/docs/decisions/NNN-*.md`.

---

# 🧠 TYPESCRIPT — RÈGLES ABSOLUES

- `strict: true`
- ❌ pas de `any`
- ✅ usage systématique de :
  - types dédiés (DTO, ValueObjects),
  - unions discriminées,
  - `never` dans les exhaustivités,
  - `unknown` + parsing/validation.

Tout payload entrant (HTTP, queue, webhook) doit être **validé** avant d’entrer dans un use case.

---

# 🔐 SÉCURITÉ & CONFORMITÉ (RGPD / DONNÉES)

Le produit collecte des données utilisateur (identité, téléphone, localisation, etc.).
Donc :
- Logs : ❌ jamais de données sensibles en clair.
- Identifiants / secrets : ❌ jamais committés.
- Validation : ✅ obligatoire sur toutes les entrées.
- Auth : tokens/sessions selon Adonis, mais **aucune route sensible** sans garde.

Règles minimales :
- Rate limiting sur routes publiques (inscription, login, recherche publique).
- Protection webhook Mollie : signature obligatoire.
- Upload média : contrôle type/taille + scan/validation “métier” (pas juste mimetype).

---

# 🧩 MODÈLES MÉTIER & PÉRIMÈTRE MVP (BACKEND)

Le T1 fixe les priorités MVP :
- Préparation infra backend
- Pré-inscription différenciée (client / professionnel)
- Recherche simple par tags
- Prise de rendez-vous
- Paiement associé
- Ouverture progressive (premiers clients → mars, public → juin)

Règle :
> Le backend doit être **pensé MVP-first**, mais structuré pour accueillir ensuite : ranking avancé, géo, média, services tiers.

---

# 🌐 API RULES (HTTP)

## Convention d’API
- REST JSON (par défaut)
- Réponses normalisées : `{ data, meta?, error? }`
- Erreurs : codes HTTP cohérents + message safe + code interne (ex: `UG_AUTH_001`)

## Controllers (ultra fins)
Un controller :
1) valide/parse la requête,
2) map vers un DTO,
3) appelle un use case,
4) transforme la sortie via presenter.

❌ Interdit : SQL/ORM direct, appels Mollie direct, logique métier, logique de ranking, etc. dans controller.

---

# 🗃️ DATA ACCESS (PostgreSQL)

- L’accès DB est **un adaptateur sortant** (repository).
- Le domaine ne connaît pas Lucid.
- Les migrations :
  - nommage explicite,
  - rollback fonctionnel,
  - contraintes DB (FK, unique, not null) dès que possible.

Règle :
> “Si c’est une règle d’intégrité, elle vit aussi en DB.”

---

# 📨 ASYNC / WORKERS (BullMQ)

Les tâches lourdes doivent être asynchrones, notamment :
- optimisation média (FFmpeg/Sharp),
- indexation Meilisearch,
- calculs géo (cache de distances/temps si pertinent),
- envoi emails / notifications,
- traitement webhooks Mollie (idempotence).

Règles :
- Jobs **idempotents** (rejouables).
- Retries contrôlés, dead-letter / failed jobs gérés.
- Pas de job qui touche directement à l’HTTP response (pas de “attendre la queue”).

---

# 🔌 INTÉGRATIONS TIERS — PORTS & ADAPTERS UNIQUEMENT

Tout service externe = **port** dans `domain/ports` + impl dans `infrastructure/integrations/*`.

Exemples :
- `PaymentGateway` (Mollie)
- `SearchIndex` (Meilisearch)
- `GeoRouting` (OSRM)
- `MediaProcessor` (FFmpeg/Sharp)
- `ErrorReporter` (Sentry)

❌ Interdit : importer le SDK Mollie dans un use case.

---

# 🧪 TESTS & QUALITÉ

Prévu dans le T1 : tests unitaires Jest + CI GitHub Actions.

## Règles
- Le **domaine** doit être testable sans DB.
- Minimum requis :
  - unit tests sur use cases critiques (booking, paiement, inscription),
  - tests d’intégration sur routes principales (happy path + erreurs),
  - tests webhook Stripe (signature + idempotence).

## CI (obligatoire dès que possible)
Pipeline minimal :
- lint
- typecheck
- tests
- build

---

# 📈 OBSERVABILITÉ (SENTRY) — RÈGLES

- Sentry activé sur backend.
- Chaque erreur remontée doit contenir :
  - `requestId` (corrélation),
  - route + method,
  - userId (si dispo) **sans PII**,
  - tags (module: `auth`, `booking`, `search`, etc.).

---

# 🧭 CONVENTIONS DE DEV (GIT / PR)

- Branches : `feat/*`, `fix/*`, `chore/*`, `docs/*`
- PR obligatoire (pas de push direct sur main)
- Chaque PR :
  - ticket lié (GitHub Projects),
  - description claire,
  - checklist (tests, typecheck, migrations si besoin),
  - pas de refacto “gratuit” hors scope.

---

# 🚫 PROHIBITIONS ABSOLUES

❌ Mettre de la logique métier dans :
- controllers,
- models Lucid,
- migrations,
- jobs “fourre-tout”.

❌ Coupler le domaine à :
- Adonis Container / IoC
- Lucid Models
- Stripe/Meilisearch SDK
- Redis/BullMQ

❌ Ignorer les risques identifiés :
- surcharge serveur si traitements lourds centralisés,
- latence sur recherche/médias,
- failles via services externes.

---

# 🎯 OBJECTIF FINAL (BACKEND)

Le backend doit être :
- **Lisible**
- **Testable**
- **Évolutif**
- **Robuste**
- **Sécurisé**
- Prêt à intégrer progressivement recherche avancée, géo, média, paiement, tracking **sans refonte globale**. 
