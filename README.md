# J'étais pas là

Site de partage de notes de cours pour les étudiants du cégep et de l'université. On publie des photos de ses notes ou des documents (PDF, Word, Markdown, texte) ; le texte est lu automatiquement et devient cherchable par tout le monde, depuis n'importe quel appareil.

Site en ligne : <https://jetaispasla.vercel.app>

- **Stack** : HTML, CSS et JavaScript vanilla, sans npm ni étape de compilation.
- **Données** : Supabase (Postgres + Storage), sécurisé par RLS.
- **OCR** : Tesseract.js dans le navigateur (français + anglais). Aucun service payant.
- **Documents** : pdf.js (PDF ; les PDF scannés passent par l'OCR), mammoth.js (.docx), lecture directe (.md, .txt). Notion et Google Docs : exporter en PDF, DOCX ou Markdown.
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

1. **Créer le schéma** : SQL Editor → coller et exécuter [`supabase/schema.sql`](supabase/schema.sql). Le script est idempotent : il crée les tables `notes`, `notes_pages` et `signalements`, les index, les politiques RLS, le bucket `notes-fichiers` (public, 10 Mo, types autorisés) et ses politiques Storage.
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
| Enregistrer le texte et la position des mots par page (`notes_pages`) | L'auteur de la note, à la publication ; lecture pour tous ; suppression automatique avec la note |
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
js/extraction.js    Texte des documents, page par page : PDF (pdf.js, OCR si scanné), DOCX (mammoth), MD, TXT
js/localisation.js Quelle page contient les mots cherchés, et où (tolère accents et fautes OCR)
js/rendu.js        Affichage sûr des documents Word et Markdown (DOMPurify), surlignage
js/visionneuse.js  Visionneuse des originaux : photos, PDF, Word, Markdown, texte ; plein écran
js/app.js           Interface et navigation
vendor/             supabase-js 2.119.0 servi depuis le site (voir ci-dessous)
supabase/schema.sql Schéma, RLS et Storage
samples/            Fichiers de test : photos (imprimé, manuscrit simulé), PDF numérique,
                    PDF scanné, DOCX, Markdown, texte
tests/              Tests unitaires (navigateur), sécurité (API) et de bout en bout (Playwright)
docs/superpowers/   Spécification et plan de la visionneuse
```

## Page d'une note

L'original est affiché en premier dans une visionneuse (photos en grand, pages PDF, Word et Markdown mis en forme, texte), avec plein écran et « Ouvrir l'original ». Le texte extrait par OCR reste indispensable à la recherche, mais il est replié sous « Texte extrait (pour copier-coller) ».

Quand une note est ouverte depuis une recherche, la visionneuse s'ouvre sur la photo ou la page qui contient le mot et l'encadre (« Trouvé dans la photo 2 », « Trouvé page 3 de cours.pdf »). Le texte et la position des mots de chaque page sont enregistrés à la publication dans la table `notes_pages`, lue seulement sur la page d'une note : la page de recherche reste aussi légère. Les notes publiées avant cette fonction s'affichent normalement, sans cette localisation.

## Tests

- **Unitaires** (localisation, rendu sûr, boîtes OCR) : serveur local démarré, puis `powershell -File tests/lancer-unitaires.ps1` (Edge ou Chrome sans interface), ou ouvrir `http://127.0.0.1:8080/tests/unitaires.html`.
- **Sécurité de `notes_pages`** (RLS via l'API REST) : `powershell -File tests/securite-pages.ps1`.
- **Bout en bout** : `tests/e2e/*.js` sont des fonctions Playwright `async (page) => …` (visionneuse, localisation) ; elles utilisent des notes de test existantes, à adapter si elles sont supprimées.

## Tester rapidement

1. Publier une note avec `samples/manuscrit-simule.png` : le texte apparaît dans la zone modifiable après quelques secondes.
2. Dans une fenêtre de navigation privée (autre utilisateur), chercher `socrat`, `sokrate` ou `maieutique` : la note est trouvée et le mot est surligné.
3. Publier les fichiers `samples/*.pdf`, `.docx`, `.md`, `.txt` puis chercher `telophase`, `lesage`, `inertie`.

## Pourquoi supabase-js est dans `vendor/`

Certaines extensions de confidentialité (ex. **LocalCDN** pour Firefox) interceptent les requêtes vers jsDelivr et servent leur propre copie de supabase-js, la **2.39.3**, quelle que soit la version demandée. Cette version ne contient pas `signInAnonymously` : la publication devenait impossible (« client.auth.signInAnonymously is not a function »). Servir le fichier depuis le site lui-même évite toute substitution. Pour mettre à jour : télécharger `dist/umd/supabase.js` de la nouvelle version dans `vendor/`, puis mettre à jour le nom du fichier et le hash `integrity` dans `index.html`.

## Limites connues

- **Écriture manuscrite** : Tesseract lit bien le texte imprimé, mais l'écriture manuscrite réelle donne des résultats variables. Le texte reste modifiable avant publication, et le formulaire suggère Live Text (iPhone) ou Google Lens (Android) pour copier le texte manuscrit.
- **Recherche côté navigateur** : toutes les notes (jusqu'à 500) sont chargées puis indexées dans le navigateur. Au-delà d'environ 1 000 à 2 000 notes, il faudra passer à une recherche côté serveur (Postgres `pg_trgm` + `unaccent`).
- **Identité anonyme** : elle est liée au navigateur. Effacer les données du navigateur fait perdre la possibilité de supprimer ses propres notes.
- **HEIC** : les photos HEIC ne sont lisibles (aperçu et OCR) que dans Safari ; ailleurs, elles sont envoyées telles quelles, sans OCR.
- **PDF** : texte des 200 premières pages ; pour un PDF scanné, OCR des 5 premières pages seulement (pour garder un temps d'attente raisonnable).
- **PDF dans la visionneuse** : le PDF est téléchargé en entier avant d'afficher la première page (Supabase accepte les requêtes partielles mais n'expose pas l'en-tête `Accept-Ranges` au navigateur, donc pdf.js ne peut pas les utiliser). Plafond : 10 Mo par fichier.
- **Première lecture** : la première photo analysée télécharge le dictionnaire français/anglais de Tesseract (quelques Mo, une seule fois par navigateur).
