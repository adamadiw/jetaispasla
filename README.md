# J'étais pas là

Site de partage de notes de cours pour les étudiants du cégep et de l'université. On publie des photos de ses notes ; le texte est lu automatiquement (OCR) et devient cherchable par tout le monde, depuis n'importe quel appareil.

- **Stack** : HTML, CSS et JavaScript vanilla, sans npm ni étape de compilation.
- **Données** : Supabase (Postgres + Storage), sécurisé par RLS.
- **OCR** : Tesseract.js dans le navigateur (français + anglais). Aucun service payant.
- **Recherche** : MiniSearch dans le navigateur (tolère les fautes, les accents et les débuts de mots).
- **Hébergement** : Vercel (site statique).

Spécifications : [`PRD_V2.md`](PRD_V2.md) · Décisions et justifications : [`PRD_REVIEW.md`](PRD_REVIEW.md)

## Démarrage local

Le site doit être servi en HTTP (pas en `file://`).

```bash
python -m http.server 8080
```

Puis ouvrir <http://localhost:8080>.

## Configuration Supabase

Le projet est déjà configuré dans `config.js`. Pour repartir d'un nouveau projet Supabase :

1. **Créer le schéma** : SQL Editor → coller et exécuter [`supabase/schema.sql`](supabase/schema.sql). Le script est idempotent : il crée les tables `notes` et `signalements`, les index, les politiques RLS, le bucket `notes-fichiers` (public, 10 Mo, types autorisés) et ses politiques Storage.
2. **Activer les connexions anonymes** : Authentication → Sign In / Providers → *Allow anonymous sign-ins*.
3. **Augmenter la limite de connexions anonymes** : Authentication → Rate Limits. La limite par défaut (30/heure par adresse IP) est trop basse quand toute une salle partage le même réseau.
4. **Renseigner `config.js`** : Settings → API Keys → copier l'URL du projet et la clé **publishable** (`sb_publishable_…`).

> Ne jamais mettre de clé secrète (`sb_secret_…` ou `service_role`) dans le code. La clé publishable est faite pour être publique : la sécurité repose sur les politiques RLS.

### Ce que les politiques garantissent

| Action | Qui |
|---|---|
| Lire les notes et voir les fichiers | Tout le monde |
| Publier une note | Tout utilisateur connecté (anonyme), en son propre nom |
| Supprimer une note et ses fichiers | Son auteur uniquement |
| Modifier une note | Personne |
| Signaler une note | Tout utilisateur connecté ; les signalements se lisent dans le tableau de bord (table `signalements`) |

## Déploiement

Le dépôt GitHub est relié à Vercel : chaque `git push` sur `main` redéploie le site. Aucune commande de build : Vercel sert les fichiers statiques tels quels.

## Structure

```
index.html          Page unique (catalogue, publication, détail)
style.css           Styles (thème « cahier Canada »)
config.js           URL Supabase + clé publishable
js/util.js          Utilitaires (normalisation, création d'éléments sûre, messages d'erreur)
js/api.js           Supabase : session anonyme, notes, fichiers, signalements
js/images.js        Redimensionnement des photos avant OCR et envoi
js/ocr.js           OCR Tesseract.js (chargé à la demande)
js/recherche.js     Index de recherche MiniSearch
js/app.js           Interface et navigation
supabase/schema.sql Schéma, RLS et Storage
samples/            Images de test (texte imprimé, écriture manuscrite simulée)
```

## Limites connues

- **Écriture manuscrite** : Tesseract lit bien le texte imprimé, mais l'écriture manuscrite réelle donne des résultats variables. Le texte reste modifiable avant publication, et le formulaire suggère Live Text (iPhone) ou Google Lens (Android) pour copier le texte manuscrit.
- **Recherche côté navigateur** : toutes les notes (jusqu'à 500) sont chargées puis indexées dans le navigateur. Au-delà d'environ 1 000 à 2 000 notes, il faudra passer à une recherche côté serveur (Postgres `pg_trgm` + `unaccent`).
- **Identité anonyme** : elle est liée au navigateur. Effacer les données du navigateur fait perdre la possibilité de supprimer ses propres notes.
- **HEIC** : les photos HEIC ne sont lisibles (aperçu et OCR) que dans Safari ; ailleurs, elles sont envoyées telles quelles, sans OCR.
