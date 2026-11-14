# Visionneuse de documents et localisation des résultats — design

Date : 2026-11-14 · Statut : **approuvé** par l'utilisateur · Relu par un relecteur indépendant (2 questions, résolues)

## Intention

Sur la page d'une note, l'étudiant doit lire **l'original** (photo, PDF, Word, Markdown, texte) et non le texte extrait. L'OCR est imparfait : présenté comme contenu principal, il rend des notes lisibles illisibles. Le texte extrait reste **obligatoire** (il alimente la recherche) mais devient secondaire : une section repliée « Texte extrait (pour copier-coller) ».

Quand une note est trouvée grâce à un mot de son contenu, la visionneuse s'ouvre **sur la bonne photo / page** et **désigne le mot** à l'endroit où il apparaît.

## Objectifs

1. Visionneuse intégrée à la page de détail, identique sur téléphone et ordinateur, pour : images (JPEG/PNG/WebP), PDF (numérique et scanné), DOCX, Markdown, TXT.
2. Navigation : onglets par fichier (si plusieurs), pages précédente/suivante pour les PDF, plein écran avec zoom, bouton « Ouvrir l'original » (nouvel onglet ; téléchargement pour DOCX).
3. Texte extrait déplacé dans un `<details>` replié, avec un bouton « Copier le texte ».
4. Depuis une recherche : ouverture sur le fichier/page contenant le mot, mot surligné (image, PDF, DOCX, MD, TXT), avec un bandeau « Trouvé dans la photo 2 » / « Trouvé page 3 de cours.pdf » **sur la page de la note** (pas sur les cartes du catalogue — décision de l'utilisateur, pour garder la page de recherche aussi légère qu'aujourd'hui).

## Non-objectifs

- Annotation, édition des documents, téléchargement groupé.
- Miniatures de PDF/DOCX dans les cartes du catalogue (backlog).
- Mention « Trouvé dans… » sur les cartes du catalogue.
- Sélection/copie du texte directement dans la page PDF rendue (« Ouvrir l'original » donne le lecteur PDF natif).
- Recalculer la localisation pour les notes publiées avant ce changement.

## Anti-objectifs (échec même si « ça marche »)

- Le texte OCR redevient le contenu principal visible par défaut.
- Un document Word/Markdown malveillant exécute du script ou du HTML non filtré (XSS).
- La page de détail télécharge tous les PDF/pages d'un coup (lent sur données mobiles).
- Les notes déjà publiées cassent.

## Contraintes

- HTML/CSS/JS vanilla, sans build ; bibliothèques par CDN (versions figées, SRI quand c'est un `<script>`), ou dans `vendor/` si une extension de type LocalCDN les intercepte (vérifié : aucune règle LocalCDN pour DOMPurify, marked, mammoth, pdf.js, Tesseract).
- Supabase : pas de mise à jour des notes (aucune politique UPDATE) ; tout se calcule à la publication ou à l'affichage.
- La page de recherche ne doit pas devenir plus lourde : aucune donnée par page dans la requête du catalogue.

## Approches considérées

| Approche | Compromis | Décision |
|---|---|---|
| **1. Visionneuse intégrée** : pdf.js dessine les pages, mammoth/marked + DOMPurify affichent Word/Markdown, images en grand | Plus de code, mais identique sur tous les appareils | **Choisie par l'utilisateur** |
| 2. S'appuyer sur le navigateur (`<iframe>` PDF, Word en téléchargement) | Peu de code ; PDF non affiché sur Android, 1re page seulement sur iPhone ; Word illisible | Rejetée |
| 3. Convertir en images à la publication | Affichage uniforme ; stockage doublé, texte non sélectionnable, DOCX non convertible fiablement dans le navigateur | Rejetée |

Pour DOCX : **mammoth** (HTML sémantique qui se reformate sur téléphone, déjà dans le projet) plutôt que docx-preview (mise en page fidèle mais pages A4 fixes à zoomer sur mobile). *Choix de l'implémenteur, validable.*

## Ce qui est décidé

### Données (rétrocompatible, catalogue inchangé)
Nouvelle table **`notes_pages`**, chargée **uniquement sur la page d'une note** :

| Colonne | Type | Rôle |
|---|---|---|
| `note_id` | uuid → `notes.id` `on delete cascade` | note parente |
| `fichier` | smallint | index dans `notes.fichiers` |
| `page` | smallint | n° de page (0 pour image/DOCX/MD/TXT) |
| `texte` | text (≤ 200 000 car.) | texte brut extrait de cette page |
| `mots` | jsonb (tableau, ≤ 500 Ko) | `[[x, y, l, h, "mot"], …]`, coordonnées **normalisées 0–1** (images et PDF scannés seulement) |

Clé primaire `(note_id, fichier, page)`. RLS : lecture pour tous ; insertion seulement si la note parente appartient à l'utilisateur (`exists (select 1 from notes where id = note_id and owner_id = auth.uid())`) ; pas de mise à jour ni suppression directe (la suppression suit celle de la note par cascade).

- Image : 1 ligne ; `mots` = boîtes OCR Tesseract (`blocks: true`) par rapport à l'image publiée (redimensionnée).
- PDF numérique : 1 ligne par page, `texte` seulement (surlignage calculé à l'affichage depuis `getTextContent`).
- PDF scanné : pages OCRisées (5 max) avec `mots`.
- DOCX / MD / TXT : 1 ligne, `texte` seulement.
- Publication : insertion de la note, **puis** des lignes `notes_pages`. Si cette seconde insertion échoue, la note reste publiée et cherchable (seule la localisation manque) — avertissement en console.
- Notes anciennes : aucune ligne → visionneuse normale, sans localisation.
- `notes.fichiers` et `texte_contenu` inchangés ; `api.chargerNotes` (catalogue) inchangé.

### Téléchargement des PDF
pdf.js ouvre le PDF par URL avec chargement partiel (`disableAutoFetch`, requêtes `Range`) pour ne télécharger que les pages affichées ; si le stockage ne gère pas les requêtes partielles, pdf.js retombe sur un téléchargement complet. Seul le fichier de l'onglet actif est chargé. *Choix de l'implémenteur, à vérifier en test.*

### Localisation d'un résultat
- La recherche passe la requête à la page de détail : `#/note/<id>?q=<requête>`.
- On cherche, parmi les pages de tous les fichiers, celle qui contient le mieux les termes (même normalisation accents/casse et même tolérance aux fautes que MiniSearch, pour retrouver « Socrate » même si l'OCR brut a lu « Socrafe »). Sans correspondance : fichier 1, page 1.
- Surlignage : images et PDF scannés → rectangles sur les `mots` correspondants ; PDF numérique → rectangles calculés depuis les positions du texte pdf.js ; DOCX/MD/TXT → `<mark>` dans le rendu, défilement jusqu'au premier.

### Visionneuse
- Rendu à la demande : seule la page affichée d'un PDF est dessinée (pages voisines préchargées au plus).
- Plein écran : `<dialog>` avec zoom (ajusté / 100 % / 200 %) et défilement.
- Sécurité : HTML de mammoth et marked passé par **DOMPurify** ; liens forcés en `target="_blank" rel="noopener noreferrer"`. Coordonnées des boîtes converties en nombres et bornées 0–1 avant usage en style.
- HEIC hors Safari : message « aperçu impossible dans ce navigateur » + « Ouvrir l'original ».

## Laissé à l'implémenteur

- Disposition exacte (onglets, barre d'outils), styles, libellés précis dans le ton du site.
- Algorithme de score de la page la plus pertinente.
- Préchargement des pages voisines, gestion du redimensionnement.
- Découpage en modules JS (`js/visionneuse.js`, etc.).
