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
| `GEMINI_API_KEY` | non | Génération IA des questions de défi, via l'API Google. À créer dans la même console que `YOUTUBE_API_KEY`, après avoir activé *Generative Language API* |
| `LOVABLE_API_KEY` | non | Ancienne passerelle IA de Lovable. Utilisée en priorité si elle est présente ; inutile sur un projet détaché de Lovable |
| `GEMINI_MODEL` | non | Modèle Gemini à utiliser. Défaut : `gemini-3.6-flash`. Google retire ses modèles au fil des versions ; un refus nommant un remplaçant est suivi automatiquement, cette variable sert à figer un choix |
| `AI_API_KEY` | non | Repli si Gemini est indisponible dans votre pays : n'importe quel service compatible OpenAI (OpenRouter, Groq, Mistral…). S'accompagne de `AI_BASE_URL` et `AI_MODEL` |
| `AI_BASE_URL` | non | Racine de l'API compatible OpenAI. Défaut : `https://openrouter.ai/api/v1` |
| `AI_MODEL` | non | Modèle à utiliser. Défaut : `google/gemini-2.0-flash-exp:free` |
| `YOUTUBE_API_KEY` | non | Import de playlists en cours (`courses.functions.ts`). Sans elle, seuls les cours de démarrage sont disponibles |
| `VAPID_PUBLIC_KEY` | non | Notifications poussées. Sans elle, le bouton d'activation répond que le serveur n'est pas configuré |
| `VAPID_PRIVATE_KEY` | non | **Secret.** Signe les envois. À générer avec `npx web-push generate-vapid-keys` |
| `VAPID_SUBJECT` | non | Adresse de contact exigée par la spécification, sous la forme `mailto:…`. Défaut : `mailto:contact@stemflow.app` |
| `VITE_SITE_URL` | non | Racine absolue du site (`https://mon-projet.vercel.app`), utilisée pour l'aperçu `og:image` partagé sur les réseaux. Sans elle, le chemin reste relatif et certains robots ne le résolvent pas |

> [!IMPORTANT]
> Ces variables sont **obligatoires**. Le dépôt contient bien un `.env` avec les
> valeurs publiques, mais il ne suffit pas : Vite lit ce fichier au moment du
> build, et le build Vercel ne le reçoit pas. Sans ces variables déclarées dans
> Vercel, l'application démarre puis affiche
> « Missing Supabase environment variable(s): SUPABASE_URL,
> SUPABASE_PUBLISHABLE_KEY ».
>
> Les deux séries de noms sont nécessaires, et ne servent pas à la même chose :
>
> - `VITE_…` est **injecté à la compilation**. Vite reprend les variables
>   préfixées depuis l'environnement du build et les inscrit dans le bundle
>   client comme dans le rendu serveur (`client.ts` les lit via
>   `import.meta.env`).
> - `SUPABASE_URL` et `SUPABASE_PUBLISHABLE_KEY` sans préfixe sont lus **à
>   l'exécution**, côté serveur uniquement, par `auth-middleware.ts` — le
>   middleware que traverse *chaque* server function. Ces deux noms n'ont
>   aucun repli sur `import.meta.env` : sans eux, l'import de playlist et la
>   génération de questions échouent même si les `VITE_…` sont renseignées.
> - `SUPABASE_SERVICE_ROLE_KEY` est lu à l'exécution par `client.server.ts`,
>   qui a besoin en plus de `SUPABASE_URL` sans préfixe.

Après ajout ou modification d'une variable, il faut **redéployer** : elles sont
lues à la compilation, pas à chaud. *Deployments* → dernier déploiement →
*Redeploy*.

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

Les migrations (`supabase/migrations/`) créent l'ensemble du schéma — tables,
politiques RLS, fonctions et triggers — et insèrent les données de départ
(salons, badges, contenus et quiz).

La dernière, `20260817060000_avatars_storage.sql`, crée le compartiment de
stockage `avatars` (2 Mo, images uniquement) et ses politiques : lecture
publique, écriture cloisonnée par utilisateur. Sans elle, le bouton photo du
profil répond « Bucket not found ». Elle touche au schéma `storage`, que
`supabase db push` gère comme les autres ; à défaut, collez-la dans
*SQL Editor*.

## 4. URL de redirection Supabase

Après le premier déploiement, dans le tableau de bord Supabase
(**Authentication → URL Configuration**), ajoutez l'URL Vercel :

- *Site URL* : `https://<votre-projet>.vercel.app`
- *Redirect URLs* : `https://<votre-projet>.vercel.app/**`

Sans cela, la connexion et l'inscription échoueront en production.

## 5. Connexion Google

Le bouton « Continuer avec Google » utilise l'OAuth natif de Supabase
(`supabase.auth.signInWithOAuth`). Il passait auparavant par le broker OAuth de
Lovable, dont l'URL d'initiation (`/~oauth/initiate`) est un **chemin relatif** :
elle n'est servie que par l'hébergement Lovable, et renvoyait donc le HTML de
l'application sur tout autre domaine — d'où l'échec silencieux sur Vercel.

Le code seul ne suffit pas ; il faut aussi configurer le fournisseur :

1. **Google Cloud Console** → *APIs & Services* → *Credentials* → créez un
   *OAuth client ID* de type **Web application**.
2. Dans *Authorized redirect URIs*, mettez l'URL de callback **de Supabase**
   (pas celle de Vercel) :
   `https://<votre-ref>.supabase.co/auth/v1/callback`
3. **Écran de consentement OAuth** (*OAuth consent screen*) : c'est l'étape la
   plus souvent oubliée. Renseignez le nom de l'application et l'adresse de
   support. Tant que l'écran reste en mode **Testing**, seuls les comptes
   inscrits dans *Test users* peuvent se connecter — tous les autres reçoivent
   `access_denied`. Ajoutez-vous comme utilisateur de test, ou passez l'écran
   en **In production** (*Publish app*) pour ouvrir la connexion à tous.
4. **Supabase** → *Authentication* → *Sign In / Providers* → **Google** :
   activez-le et collez le *Client ID* et le *Client Secret* de l'étape 1.
5. Vérifiez que l'étape 4 de la section précédente (Redirect URLs) inclut bien
   votre domaine Vercel — l'application renvoie l'utilisateur sur `/auth` après
   Google.

Aucune route de callback n'est à créer dans l'application : l'option
`detectSessionInUrl` du client Supabase vaut `true` par défaut, donc la session
est établie automatiquement au retour sur `/auth`.

Messages d'erreur et cause correspondante :

| Message | Cause |
| --- | --- |
| « Le fournisseur Google n'est pas activé dans Supabase. » | étape 4 non faite |
| `redirect_uri_mismatch` (page Google) | l'URI de l'étape 2 ne correspond pas exactement — ce doit être l'URL Supabase, pas celle de Vercel |
| `access_denied` (page Google) | écran de consentement en mode *Testing* et compte absent des *Test users* (étape 3) |
| Retour sur `/auth` sans être connecté | domaine Vercel absent des *Redirect URLs* Supabase (étape 5) |

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
