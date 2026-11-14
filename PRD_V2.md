# PRD et instructions d'implémentation — J'étais pas là (V2)

> Version 2 — 2026-11-14. Remplace `PRD_V1.md`. Justification de chaque changement : voir `PRD_REVIEW.md`.

## Rôle de Claude Code

Tu es responsable du développement technique du MVP de **J'étais pas là**, un site web de partage de notes étudiantes pour un hackathon. **Implémente les fonctionnalités** : ne te limite pas à rédiger des recommandations. Ne prépare **aucune présentation, aucun pitch, aucune diapositive et aucun slogan**.

Le projet part **de zéro** : il n'existe aucun prototype. Si une décision technique manque, choisis l'option la plus simple et fiable pour un hackathon, documente-la brièvement et signale-la à l'équipe, qui a le dernier mot.

## Problème (à valider par l'équipe)

- **Pour qui** : étudiants du cégep et de l'université qui ont manqué un cours (maladie, travail, conflit d'horaire).
- **Douleur** : les notes circulent en photos éparpillées dans des conversations privées ; impossible de retrouver « le cours où on a vu Socrate » sans connaître la bonne personne.
- **Signal de réussite** : un étudiant retrouve, depuis son propre appareil et en quelques secondes, une note publiée par quelqu'un d'autre en cherchant un mot qui apparaît **dans** la note.

## Objectif produit

Permettre aux étudiants de :
1. Publier des notes de cours — **photos** ou **documents numériques** (.md, .txt, .pdf, .docx) — avec leurs métadonnées.
2. Retrouver les notes publiées par **d'autres utilisateurs**, depuis un autre navigateur ou appareil.
3. Rechercher des notions figurant **dans le contenu** (texte OCR des photos ou texte extrait des documents), en plus des titres, matières et descriptions, avec une recherche **tolérante aux fautes et aux accents**.
4. Consulter les fichiers originaux d'une note.

Scénario critique : un étudiant publie une photo manuscrite contenant « Socrate » (texte OCR vérifié/corrigé avant publication) ; un autre étudiant tape « socrate » (ou « socr », ou « socrat ») sur un autre appareil et retrouve la note.

## Décisions non négociables

- **Supabase** pour la base de données partagée et le stockage des fichiers.
- **OCR obligatoire** pour les images, **dans le navigateur** (Tesseract.js, langues `fra+eng`). Le texte est enregistré et interrogeable. Aucun service OCR payant.
- **HTML, CSS et JavaScript vanilla**, bibliothèques chargées par CDN. Pas de framework ni de chaîne de compilation.
- **Clé publishable Supabase (`sb_publishable_…`)** uniquement côté navigateur ; jamais de clé secrète/`service_role`.
- **Authentification anonyme Supabase** comme identité ; RLS explicite partout.
- **Hébergement statique sur Vercel** (URL publique pour les tests multi-appareils).
- Pas de présentation, pitch, slides, slogan ni fonctionnalités hors périmètre. Prioriser un parcours complet et fiable.

## Fonctionnalités requises

### P0 — Stockage partagé avec Supabase

- Client `supabase-js` via CDN ; URL du projet et clé publishable dans `config.js` (committé, sans secret).
- Au chargement : `signInAnonymously()` si aucune session n'existe.
- Table `notes` :
  `id uuid pk`, `owner_id uuid default auth.uid()`, `titre`, `matiere`, `cours`, `etablissement`, `type_document`, `description`, `texte_contenu text`, `fichiers jsonb` (`[{chemin, type, nom}]`), `created_at timestamptz default now()`.
- Bucket Storage `notes-fichiers` : lecture publique, limite 10 Mo par fichier, types MIME autorisés = images (jpeg, png, webp, heic) + pdf, docx, markdown, texte. Chemins `{auth.uid()}/{uuid}.{ext}`.
- RLS `notes` : lecture pour tous ; insertion si `owner_id = auth.uid()` ; suppression si `owner_id = auth.uid()` ; pas de mise à jour.
- RLS Storage : insertion et suppression seulement dans son propre dossier (`(storage.foldername(name))[1] = auth.uid()::text`).
- Publication : téléverser les fichiers → insérer la note → l'afficher dans le catalogue partagé.
- Suppression : uniquement pour l'auteur (bouton visible seulement sur ses propres notes) ; supprime aussi les fichiers.
- États de chargement et messages d'erreur compréhensibles.
- Fichier de migration `supabase/schema.sql` (tables, index, politiques RLS et Storage, bucket).

### P0 — OCR des images (dans le navigateur)

- Tesseract.js (CDN), worker `fra+eng` créé une fois et réutilisé.
- Redimensionner chaque image côté navigateur (~2000 px, JPEG) **avant** l'OCR et le téléversement.
- Afficher la progression (« Analyse des images… 2/4 »).
- Le texte extrait remplit une **zone de texte modifiable** que l'utilisateur peut corriger ou compléter avant de publier.
- Astuce affichée sous la zone : « Écriture manuscrite ? Copiez le texte avec Live Text (iPhone) ou Google Lens (Android) et collez-le ici. »
- Si l'OCR échoue : avertissement, la publication reste possible (texte vide ou partiel).
- Tester avec une image de texte imprimé et une image manuscrite ; ne pas annoncer une précision non mesurée.

### P0 — Recherche commune (MiniSearch)

- Charger les notes depuis Supabase (les plus récentes d'abord) et les indexer dans le navigateur avec **MiniSearch** (CDN).
- Champs indexés : `titre`, `matiere`, `cours`, `etablissement`, `description`, `texte_contenu`.
- `processTerm` : minuscules + suppression des accents (`normalize('NFD')`).
- Options : `fuzzy: 0.2`, `prefix: true`, boost `titre` ×3 et `cours` ×2 ; recherche à la frappe.
- Filtres matière et type de document via l'option `filter`.
- Les résultats proviennent des données partagées (visibles depuis un second appareil).
- Ne jamais relancer l'OCR lors d'une recherche.

### P1 — Notes numériques

À réaliser **après** que le parcours photo fonctionne de bout en bout.
- `.md` / `.txt` : lecture via `FileReader`.
- `.pdf` : extraction du texte avec pdf.js (CDN).
- `.docx` : extraction du texte brut avec mammoth.js (CDN).
- Le texte extrait remplit la même zone modifiable et est enregistré dans `texte_contenu`.
- Astuce : « Notion / Google Docs : exportez en PDF, DOCX ou Markdown puis téléversez le fichier. »
- Affichage en détail : texte en `textContent` (pas de rendu HTML du Markdown) + lien de téléchargement du fichier original.

### P1 — Interface et fiabilité

- Créer un CSS responsive (mobile et ordinateur).
- Aperçu de la première image sur chaque carte (icône de type pour les documents).
- Consultation de tous les fichiers d'une note en détail.
- Validation des fichiers : types autorisés, 10 Mo max, 10 fichiers max par note.
- Bouton de publication désactivé pendant l'envoi (pas de doublons).
- États vides et erreurs utiles.
- Contenu utilisateur inséré uniquement via `textContent`.
- Deux images d'exemple (imprimée, manuscrite) dans `samples/` pour les tests.

### P2 — Signalement

- Bouton « Signaler » sur le détail d'une note → table `signalements` (`id`, `note_id`, `raison`, `created_at`, `owner_id`).
- RLS : insertion seule pour les utilisateurs ; aucune lecture côté client (consultation via le tableau de bord).

## Contraintes de sécurité et de contenu

- RLS activé et explicite sur chaque table ; ne jamais désactiver la sécurité comme raccourci.
- Aucune politique de mise à jour ou de suppression ouverte à tous.
- Ne jamais committer de secret.
- Rappel discret dans le formulaire : ne publier que ses propres notes ou des documents partagés avec autorisation, sans données personnelles sensibles.
- Après migration : vérifier les avis de sécurité Supabase (advisors) et corriger les alertes.

## Actions manuelles (tableau de bord Supabase)

1. Authentication → Sign In / Providers : **activer les connexions anonymes**.
2. Authentication → Rate limits : **augmenter la limite de connexions anonymes** avant la démo (tous les participants partagent une IP ; défaut 30/h).
3. Settings → API Keys : copier l'URL du projet et la **clé publishable** dans `config.js`.

## Mode de travail

1. Créer `supabase/schema.sql` et l'appliquer au projet Supabase.
2. Créer `index.html`, `style.css`, `config.js`, `app.js` : session anonyme, catalogue, publication.
3. Implémenter OCR + zone de texte modifiable.
4. Implémenter la recherche MiniSearch et les filtres.
5. Tester le parcours de bout en bout sur deux navigateurs/profils ; corriger.
6. Déployer sur Vercel ; retester depuis un téléphone.
7. P1 notes numériques, puis P1 interface, puis P2 signalement.
8. README : configuration Supabase, actions manuelles, démarrage local, déploiement.
9. Compte rendu technique concis : fichiers, fonctionnalités, tests effectués, limites restantes. Ne jamais prétendre avoir testé ce qui ne l'a pas été.

## Critères d'acceptation

- [ ] Le site fonctionne en HTML/CSS/JS sans npm, et est accessible via une URL Vercel.
- [ ] Une session anonyme est créée automatiquement au premier chargement.
- [ ] Une note avec photos est publiée dans Supabase (fichiers dans le bucket, ligne dans `notes`).
- [ ] La note est visible depuis un autre navigateur ou appareil.
- [ ] Le texte d'une photo est extrait par OCR, affiché dans une zone modifiable, puis enregistré.
- [ ] Une recherche sur un mot du texte OCR retrouve la note, y compris avec une faute de frappe d'une lettre, sans accent, ou par début de mot.
- [ ] Les filtres matière/type fonctionnent avec les données partagées.
- [ ] Les images s'ouvrent correctement en détail.
- [ ] Une erreur OCR n'empêche pas la publication.
- [ ] Un autre utilisateur ne peut pas supprimer une note qui ne lui appartient pas (vérifié avec deux navigateurs).
- [ ] Aucune clé secrète dans le code ; les advisors Supabase ne signalent aucune faille RLS.
- [ ] (P1) Un fichier .pdf, .docx, .md ou .txt est publié et un mot de son contenu le retrouve.
- [ ] Le README permet de reproduire la configuration.

## Hors périmètre

Présentations, pitch, slides, slogan, messagerie, likes, abonnements, profils élaborés, comptes courriel/mot de passe, recommandation algorithmique, migration vers un framework, OCR payant, import par lien Notion/Google Docs, monétisation, architecture de production complexe.

## Backlog (seulement si tout le reste fonctionne parfaitement)

- Support `.pptx` (présentations des enseignants).
- Recherche côté serveur (Postgres `pg_trgm` + `unaccent`) si le catalogue dépasse ~1–2k notes.
