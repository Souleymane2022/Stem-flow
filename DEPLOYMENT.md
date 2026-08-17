# Déploiement sur Vercel

L'application est une application **TanStack Start** avec rendu côté serveur (SSR) et
des *server functions*. Elle a donc besoin d'un runtime serveur : un hébergement de
fichiers statiques ne suffit pas.

Le build est assuré par Nitro. Par défaut il cible Cloudflare ; quand la variable
`VERCEL` est présente (Vercel la définit automatiquement), `vite.config.ts` bascule
sur le preset `vercel` et produit `.vercel/output/` (Build Output API v3) :

- `static/` — les assets du client, servis par le CDN
- `functions/__server.func/` — une fonction serverless Node.js 22 qui gère le SSR

## 1. Importer le projet

Sur [vercel.com/new](https://vercel.com/new), importez `Souleymane2022/Stem-flow`
et sélectionnez la branche `main`.

Le fichier `vercel.json` fixe déjà la configuration :

| Réglage | Valeur | Pourquoi |
| --- | --- | --- |
| `framework` | `null` | Empêche Vercel de détecter « Vite » et d'attendre un dossier `dist/` |
| `installCommand` | `npm ci` | Force npm — voir la note sur `bun.lock` plus bas |
| `buildCommand` | `npm run build` | Produit `.vercel/output/` |

Ne changez pas l'*Output Directory* dans l'interface : Vercel détecte
automatiquement `.vercel/output`.

## 2. Variables d'environnement

Dans **Settings → Environment Variables**, pour les environnements *Production*,
*Preview* et *Development* :

| Variable | Obligatoire | Rôle |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | oui | URL du projet Supabase (client) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | oui | Clé publique Supabase (client) |
| `VITE_SUPABASE_PROJECT_ID` | oui | Référence du projet |
| `SUPABASE_URL` | oui | Même URL, lue pendant le SSR |
| `SUPABASE_PUBLISHABLE_KEY` | oui | Même clé publique, lue pendant le SSR |
| `SUPABASE_SERVICE_ROLE_KEY` | oui | **Secret.** Client serveur admin (`client.server.ts`), contourne les RLS |
| `LOVABLE_API_KEY` | non | Génération IA des questions de compétition. Sans elle, cette seule fonctionnalité échoue avec « Clé IA manquante » |

Le dépôt contient un `.env` avec les valeurs publiques (URL + clé `sb_publishable_`),
ce qui permet au build de passer même sans configuration. Déclarer malgré tout ces
variables dans Vercel reste préférable : cela vous permet de changer de projet
Supabase sans recommit.

`SUPABASE_SERVICE_ROLE_KEY` et `LOVABLE_API_KEY` ne sont **jamais** versionnées et
doivent obligatoirement être saisies dans Vercel. Ne les préfixez pas par `VITE_` :
elles seraient alors incluses dans le bundle client et donc publiques.

Voir `.env.example` pour la liste complète.

## 3. Base de données

Vercel héberge l'application, pas la base. Celle-ci reste sur Supabase.

Pour créer le schéma sur un nouveau projet Supabase :

```sh
supabase link --project-ref <votre-ref>
supabase db push
```

Les migrations (`supabase/migrations/`) créent 18 tables, 48 politiques RLS,
6 fonctions, 5 triggers, et insèrent les données de départ (salons, badges,
contenus et quiz).

## 4. URL de redirection Supabase

Après le premier déploiement, dans le tableau de bord Supabase
(**Authentication → URL Configuration**), ajoutez l'URL Vercel :

- *Site URL* : `https://<votre-projet>.vercel.app`
- *Redirect URLs* : `https://<votre-projet>.vercel.app/**`

Sans cela, la connexion et l'inscription échoueront en production.

## Note sur `bun.lock`

Le fichier `bun.lock` hérité de Lovable référence un registre npm privé
(`europe-west1-npm.pkg.dev/lovable-core-prod`) inaccessible en dehors de leur
sandbox. Une installation via bun sur Vercel échouerait donc en 403. C'est pourquoi
`vercel.json` impose `npm ci`, qui s'appuie sur `package-lock.json` et le registre
public npm.

## Build local

```sh
npm ci
npm run dev                 # développement
VERCEL=1 npm run build      # reproduit exactement le build Vercel
npm run build               # build par défaut, cible Cloudflare
```
