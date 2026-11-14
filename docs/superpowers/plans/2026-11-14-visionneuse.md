# Visionneuse de documents et localisation — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La page d'une note affiche les originaux (photos, PDF, DOCX, MD, TXT) dans une visionneuse intégrée ; le texte extrait passe en section repliée ; une recherche ouvre la bonne page avec le mot désigné.

**Architecture:** Nouvelle table `notes_pages` (texte et boîtes de mots par page), écrite après la note à la publication et lue seulement sur la page de détail. Trois nouveaux modules : `localisation.js` (logique pure de correspondance), `rendu.js` (HTML sûr : DOMPurify + marked + mammoth), `visionneuse.js` (affichage). `ocr.js` et `extraction.js` renvoient désormais du texte **par page**.

**Tech Stack:** JS vanilla (scripts classiques, namespace `window.JPL`), Supabase JS 2.119 (vendor), Tesseract.js 7 (`blocks: true`), pdf.js 6.5.438 (ESM), mammoth 1.13.0, DOMPurify 3.4.18, marked 18.2.0.

**Spec:** `docs/superpowers/specs/2026-11-14-visionneuse-design.md`

## Global Constraints

- Pas de npm ni de build ; bibliothèques CDN versions figées, `integrity` SRI sur tout `<script>` chargé (DOMPurify, marked, mammoth, Tesseract) ; pdf.js reste en `import()` sans SRI.
- Contenu utilisateur inséré via `textContent`, ou via HTML **passé par DOMPurify** (DOCX, Markdown) uniquement.
- Liens dans le HTML rendu : `target="_blank" rel="noopener noreferrer"` ; schémas autorisés `http:`, `https:`, `mailto:`.
- Coordonnées de boîtes : nombres bornés à `[0, 1]` avant tout usage en style.
- Requête du catalogue (`api.chargerNotes`) **inchangée** : aucune donnée par page.
- Notes sans lignes `notes_pages` : visionneuse fonctionnelle, sans localisation.
- Libellés en français, tutoiement, ton du site (« Ouvrir l'original », « Texte extrait (pour copier-coller) », « Copier le texte », « Trouvé dans la photo 2 », « Trouvé page 3 de cours.pdf »).
- Un commit + push par tâche (préférence de l'utilisateur).

## Review Focus

1. **Requête sans correspondance dans les pages** (auteur a corrigé le texte, ou mot seulement dans le titre) → ouvrir fichier 1 / page 1, pas de bandeau, pas d'erreur. Test : Task 2 `meilleurePage` renvoie `null` ; Task 6 e2e « recherche par titre ».
2. **Notes publiées avant ce changement** (aucune ligne `notes_pages`) → visionneuse normale. Test : Task 5 e2e sur la note existante « Cours 4 — dialogue et questions ».
3. **Image non affichable** (HEIC hors Safari, fichier abîmé) → message « Aperçu impossible dans ce navigateur » + « Ouvrir l'original ». Test : Task 5 e2e avec la note « Test échec OCR ».
4. **Redimensionnement / rotation de l'écran** → les cadres restent alignés sur les mots (positionnement en % dans un conteneur qui épouse l'image). Test : Task 6 e2e, redimensionner 1280→390 px et comparer la position relative du cadre.
5. **Document Word/Markdown malveillant** (`<script>`, `onerror`, lien `javascript:`) → rien ne s'exécute, lien neutralisé. Test : Task 4 unitaire.

---

### Task 1: Table `notes_pages` et accès API

**Files:**
- Modify: `supabase/schema.sql` (nouvelle section 5)
- Modify: `js/api.js`
- Migration Supabase via MCP `apply_migration` nom `notes_pages`

**Interfaces:**
- Produces:
  - `JPL.api.publierPages(noteId: string, lignes: Array<{fichier:number, page:number, texte:string, mots:Array}>) -> Promise<void>` (no-op si `lignes` vide ; lève l'erreur Supabase)
  - `JPL.api.chargerPages(noteId: string) -> Promise<Array<{fichier, page, texte, mots}>>` triées par `fichier, page`

- [ ] **Step 1: Écrire le test de sécurité (PowerShell, REST)** — script `tests/securite-pages.ps1` qui, avec deux utilisateurs anonymes A et B : A insère une note puis une ligne `notes_pages` → 201 ; B insère une ligne pour la note de A → refus (401/403) ; anonyme non connecté lit `notes_pages` → 200 ; B supprime/modifie la ligne de A → 0 ligne / refus ; A supprime sa note → ses lignes `notes_pages` disparaissent (cascade). Le script supprime sa note à la fin.
- [ ] **Step 2: Lancer** `powershell -File tests/securite-pages.ps1` → échoue (table inexistante, 404).
- [ ] **Step 3: SQL** — table conforme au spec : `note_id uuid not null references public.notes(id) on delete cascade`, `fichier smallint not null check (fichier between 0 and 9)`, `page smallint not null check (page between 0 and 199)`, `texte text not null default '' check (char_length(texte) <= 200000)`, `mots jsonb not null default '[]' check (jsonb_typeof(mots)='array' and octet_length(mots::text) <= 500000)`, PK `(note_id, fichier, page)`. RLS ; `revoke all … from anon, authenticated` ; `grant select to anon, authenticated` ; `grant insert to authenticated` ; politiques `notes_pages_select_tous` (using true) et `notes_pages_insert_proprio` (`exists (select 1 from public.notes n where n.id = note_id and n.owner_id = (select auth.uid()))`). Ajouter au fichier puis appliquer via MCP.
- [ ] **Step 4: `publierPages` / `chargerPages`** dans `js/api.js` (insert en un seul appel ; select `fichier,page,texte,mots` ordonné).
- [ ] **Step 5: Relancer le test** → toutes les lignes OK. Puis `get_advisors security` → aucun nouvel avertissement hors `auth_allow_anonymous_sign_ins` (déjà connu).
- [ ] **Step 6: Commit** `Données : table notes_pages (texte et mots par page)`.

### Task 2: Module `localisation.js` (logique pure) et page de tests

**Files:**
- Create: `js/localisation.js`, `tests/unitaires.html`, `tests/unitaires.js`

**Interfaces:**
- Consumes: `JPL.normaliser(texte) -> string` (util.js)
- Produces:
  - `JPL.localisation.termes(requete: string) -> string[]` — normalisés, sans mots vides (même liste que `recherche.js` : l'exporter de `recherche.js` en `JPL.recherche.MOTS_VIDES` ou la déplacer dans util.js en `JPL.MOTS_VIDES`), longueur ≥ 2
  - `JPL.localisation.correspond(mot: string, terme: string) -> boolean` — normalise `mot` ; vrai si égalité, si `mot` commence par `terme` (terme ≥ 3 car.), ou distance de Levenshtein ≤ `Math.round(0.2 * terme.length)` pour terme ≥ 4 car.
  - `JPL.localisation.meilleurePage(pages: Array<{fichier,page,texte}>, termes: string[]) -> {fichier:number, page:number, score:number} | null` — score = nombre de termes distincts trouvés dans les mots de la page (via `correspond`) ; égalité → plus petit `(fichier, page)` ; aucun terme trouvé → `null`
  - `JPL.localisation.boitesCorrespondantes(mots: Array<[x,y,l,h,string]>, termes) -> Array<[x,y,l,h]>` — coordonnées bornées `[0,1]` ; entrées malformées ignorées
  - `JPL.localisation.borner(n) -> number` — `Number(n)`, NaN → 0, borné `[0,1]`

- [ ] **Step 1: Tests** dans `tests/unitaires.js` (mini-harnais : `test(nom, fn)`, `egal(a, b)` ; résultat écrit dans `#resultats` et `document.title = 'OK n/n'` ou `'ÉCHEC k/n'`) :
  ```js
  test('termes', () => egal(L.termes("La Maïeutique de Socrate"), ['maieutique', 'socrate']));
  test('faute OCR', () => egal(L.correspond('Socrafe', 'socrate'), true));
  test('préfixe', () => egal(L.correspond('Socrate', 'socr'), true));
  test('pas de faux positif court', () => egal(L.correspond('sa', 'se'), false));
  test('meilleure page', () => egal(L.meilleurePage([
    { fichier: 0, page: 0, texte: 'Newton inertie' },
    { fichier: 1, page: 2, texte: 'Socrate et la maieutique' },
    { fichier: 1, page: 3, texte: 'Socrate' }], ['socrate', 'maieutique']), { fichier: 1, page: 2, score: 2 }));
  test('aucune page', () => egal(L.meilleurePage([{ fichier: 0, page: 0, texte: 'Newton' }], ['socrate']), null));
  test('boîtes', () => egal(L.boitesCorrespondantes([[0.1, 0.2, 0.3, 0.05, 'Socrafe'], [0.5, 0.5, 0.1, 0.1, 'et']], ['socrate']), [[0.1, 0.2, 0.3, 0.05]]));
  test('boîtes bornées', () => egal(L.boitesCorrespondantes([[-1, 2, 'x', 0.1, 'socrate'], ['bad']], ['socrate']), [[0, 1, 0, 0.1]]));
  ```
- [ ] **Step 2: Lancer** — ouvrir `http://127.0.0.1:8080/tests/unitaires.html` (Playwright) → titre `ÉCHEC` (module absent).
- [ ] **Step 3: Implémenter `js/localisation.js`.**
- [ ] **Step 4: Relancer** → `OK 8/8`.
- [ ] **Step 5: Commit** `Localisation : correspondance tolérante page/mots + page de tests`. Ajouter `tests/` à `.vercelignore`.

### Task 3: Texte par page à la publication (OCR avec boîtes, PDF par page)

**Files:**
- Modify: `js/ocr.js`, `js/extraction.js`, `js/app.js` (fonctions `lireTexte`, `publier`)

**Interfaces:**
- Consumes: `JPL.api.publierPages` (Task 1)
- Produces (contrat commun des lecteurs, remplace l'actuel `Promise<string>`):
  - `JPL.ocr.lireTexte(item, surProgression) -> Promise<{texte:string, pages:Array<{page:number, texte:string, mots:Array<[x,y,l,h,string]>}>}>`
  - `JPL.extraction.lireTexte(item, surProgression) -> Promise<{texte, pages}>` — image : 1 page `page:0` avec `mots` ; PDF numérique : 1 entrée par page (`page` = index 0-based), `mots: []` ; PDF scanné : pages OCR avec `mots` ; DOCX/MD/TXT : 1 page, `mots: []`
  - `JPL.ocr.boitesNormalisees(blocks, largeur, hauteur) -> Array<[x,y,l,h,string]>` — parcourt `blocks[].paragraphs[].lines[].words[]`, `bbox {x0,y0,x1,y1}` → `[x0/L, y0/H, (x1-x0)/L, (y1-y0)/H, text]`, arrondi à 4 décimales, mots vides ignorés
  - Dans `app.js` : chaque `item` garde `item.pages` ; à la publication, après `api.publierNote`, construire `lignes` (`fichier` = index de l'item dans `etat.fichiers`) et appeler `api.publierPages(note.id, lignes)` dans un `try/catch` qui fait seulement `console.warn` (la note reste publiée)

- [ ] **Step 1: Test unitaire** ajouté à `tests/unitaires.js` :
  ```js
  test('boîtes normalisées', () => egal(JPL.ocr.boitesNormalisees([{ paragraphs: [{ lines: [{ words: [
    { text: 'Socrate', bbox: { x0: 100, y0: 50, x1: 300, y1: 90 } }, { text: ' ', bbox: { x0: 0, y0: 0, x1: 1, y1: 1 } }] }] }] }], 1000, 500),
    [[0.1, 0.1, 0.2, 0.08, 'Socrate']]));
  ```
- [ ] **Step 2: Lancer** → échec (`boitesNormalisees` absent).
- [ ] **Step 3: Implémenter** — `worker.recognize(blob, {}, { text: true, blocks: true })` ; dimensions = celles du blob envoyé (`createImageBitmap` ou taille du canvas déjà connue dans `images.js` : exposer `largeur`/`hauteur` dans le résultat de `preparerImage`). Adapter `extraction.js` et `app.js` au nouveau contrat.
- [ ] **Step 4: Relancer** les unitaires → tout OK ; puis e2e Playwright : publier `samples/manuscrit-simule.png` + `samples/biologie-mitose.pdf` ; via `execute_sql`, vérifier 2 lignes `notes_pages` pour la note : `(0,0)` avec `jsonb_array_length(mots) > 20` et une boîte du mot `Socrate` dont x,y ∈ [0,1] ; `(1,0)` avec texte contenant `télophase` et `mots = []`. Supprimer la note de test via l'interface.
- [ ] **Step 5: Commit** `Publication : texte et position des mots par page`.

### Task 4: Rendu sûr des documents (`rendu.js`)

**Files:**
- Create: `js/rendu.js`
- Modify: `tests/unitaires.js`, `index.html`

**Interfaces:**
- Produces:
  - `JPL.rendu.htmlSur(html: string) -> Promise<DocumentFragment>` — charge DOMPurify à la demande (SRI), `ALLOWED_URI_REGEXP` http/https/mailto, hook `afterSanitizeAttributes` qui force `target`/`rel` sur `<a>`, interdit `style`, `form`, `input`, `iframe`
  - `JPL.rendu.markdown(texte: string) -> Promise<DocumentFragment>` — marked (SRI, à la demande) puis `htmlSur`
  - `JPL.rendu.docx(arrayBuffer) -> Promise<DocumentFragment>` — `mammoth.convertToHtml` (images en data URI, défaut mammoth) puis `htmlSur` ; autoriser `data:image/*` uniquement pour `img src`
  - `JPL.rendu.surligner(racine: Element, termes: string[]) -> Element|null` — entoure de `<mark>` les mots des nœuds texte qui `correspond`ent (Task 2) ; renvoie le premier `<mark>`

- [ ] **Step 1: Tests** :
  ```js
  test('XSS script', async () => egal((await R.htmlSur('<p>ok</p><script>window.pwn=1</script>')).querySelector('script'), null));
  test('XSS onerror', async () => egal((await R.htmlSur('<img src=x onerror="window.pwn=1">')).querySelector('img').hasAttribute('onerror'), false));
  test('lien javascript', async () => egal((await R.htmlSur('<a href="javascript:alert(1)">x</a>')).querySelector('a').hasAttribute('href'), false));
  test('lien externe', async () => egal((await R.htmlSur('<a href="https://ex.org">x</a>')).querySelector('a').rel, 'noopener noreferrer'));
  test('markdown', async () => egal((await R.markdown('# Titre\n\n- un')).querySelector('h1').textContent, 'Titre'));
  test('surligner', () => { const d = document.createElement('div'); d.textContent = 'Le procès de Socrafe'; egal(R.surligner(d, ['socrate']).textContent, 'Socrafe'); });
  test('pas exécuté', () => egal(window.pwn, undefined));
  ```
  Le harnais doit accepter des tests `async`.
- [ ] **Step 2: Lancer** → échec.
- [ ] **Step 3: Implémenter `js/rendu.js`** ; calculer les hash SRI de `dompurify@3.4.18/dist/purify.min.js` et `marked@18.2.0/lib/marked.umd.js` (vérifier que ces chemins existent ; sinon le chemin UMD équivalent) ; mammoth : réutiliser le chargeur d'`extraction.js` (l'exposer en `JPL.extraction.chargerMammoth`).
- [ ] **Step 4: Relancer** → tout OK.
- [ ] **Step 5: Commit** `Rendu sûr des documents Word et Markdown (DOMPurify)`.

### Task 5: Visionneuse et nouvelle page de détail

**Files:**
- Create: `js/visionneuse.js`
- Modify: `js/app.js` (`afficherDetail`), `js/extraction.js` (exposer `chargerPdfjs`), `index.html` (dialog plein écran remplacé), `style.css`

**Interfaces:**
- Consumes: `JPL.rendu.*` (Task 4), `JPL.api.urlPublique`, `JPL.extraction.chargerPdfjs() -> Promise<pdfjs>`
- Produces:
  - `JPL.visionneuse.creer(conteneur: Element, note, options?: {fichier?:number, page?:number, termes?:string[], pages?:Array}) -> { aller(fichier:number, page:number): Promise<void>, detruire(): void }`

Comportement (spec « Visionneuse ») : onglets si > 1 fichier (`role="tablist"`, nom du fichier) ; zone d'affichage pleine largeur ; image `max-height: 80vh` ; PDF : `getDocument({ url, disableAutoFetch: true, rangeChunkSize: 262144 })`, seule la page courante est dessinée (canvas à la largeur du conteneur × `devicePixelRatio`, max 2), « Page n/N » + ‹ › + flèches clavier ; DOCX/MD → `rendu.*` dans un conteneur `.document-rendu` défilant (max-height 80vh) ; TXT → `textContent` pré-formaté ; barre d'outils : « Plein écran » (dialog, zoom Ajusté/100 %/200 %) et « Ouvrir l'original » (`target=_blank`, `download` pour DOCX) ; image non décodable → « Aperçu impossible dans ce navigateur. » + bouton Ouvrir l'original. Page de détail : métadonnées → visionneuse → `<details class="texte-extrait">` fermé, résumé « Texte extrait (pour copier-coller) », bouton « Copier le texte » (`navigator.clipboard.writeText`, toast « Texte copié. ») → actions. La galerie de miniatures actuelle est supprimée.

- [ ] **Step 1: Test e2e** (Playwright, contexte neuf) écrit avant : sur la note existante « Cours 4 — dialogue et questions » (sans `notes_pages`) → `.visionneuse img` visible avec `naturalWidth > 0`, `details.texte-extrait` présent et **fermé**, bouton « Ouvrir l'original » `href` = URL publique ; note « Test documents numériques » → 5 onglets ; onglet PDF → canvas dessiné et « Page 1/1 » ; onglet Word → `.document-rendu h1, .document-rendu p` contient « Révolution tranquille » ; onglet MD → `h1` « MAT-103 — Dérivées » ; note « Test échec OCR » → texte « Aperçu impossible dans ce navigateur. » ; aucune `pageerror`.
- [ ] **Step 2: Lancer** → échec.
- [ ] **Step 3: Implémenter** `visionneuse.js`, brancher dans `afficherDetail`, styles (thème cahier : cadre `--ligne`, onglet actif bordure `--marge`).
- [ ] **Step 4: Relancer** → OK ; capture mobile 390 px et bureau 1280 px relues ; vérifier dans l'onglet réseau qu'un PDF de test n'est pas rechargé en entier à chaque page (ou noter le repli si Supabase ne gère pas `Range`).
- [ ] **Step 5: Commit** `Visionneuse : originaux affichés, texte extrait replié`.

### Task 6: Ouvrir sur le résultat et désigner le mot

**Files:**
- Modify: `js/app.js` (route, `carteNote`, `afficherDetail`), `js/visionneuse.js` (calque de surlignage), `style.css`

**Interfaces:**
- Consumes: `JPL.api.chargerPages` (T1), `JPL.localisation.*` (T2), `JPL.rendu.surligner` (T4), `visionneuse.creer(..., {termes, pages})` (T5)
- Produces: route `#/note/<id>?q=<requête encodée>` ; `routeActuelle()` renvoie `{ vue:'note', id, requete }`

Comportement : les cartes du catalogue pointent vers `#/note/<id>?q=…` quand une requête est active. Sur la page de détail : `chargerPages(id)` ; `termes = localisation.termes(requete)` ; `cible = meilleurePage(pages, termes)` ; si `cible` → visionneuse ouverte sur `cible.fichier/page` + bandeau `role="status"` « Trouvé dans la photo N » (image ; N = rang parmi les images, 1-based) ou « Trouvé page P de <nom> » (PDF) ou « Trouvé dans <nom> » (autres) ; sinon fichier 0 / page 0 sans bandeau. Surlignage : image et PDF scanné → `<div class="cadre-mot">` en `left/top/width/height` en % (via `boitesCorrespondantes`) dans un calque superposé à l'image (même boîte que l'image) ; PDF numérique → cadres calculés depuis `getTextContent()` (`viewport.convertToViewportRectangle` sur la boîte de l'item, largeur proportionnelle à la position du terme dans `item.str`) ; DOCX/MD/TXT → `rendu.surligner` puis `scrollIntoView({block:'center'})`. Échec de `chargerPages` → visionneuse normale (pas d'erreur visible).

- [ ] **Step 1: Test e2e** : publier (contexte A) `samples/manuscrit-simule.png` puis `samples/biologie-mitose.pdf` dans une même note « Test localisation (à supprimer) », titre sans « Socrate » ni « mitose » ; contexte B : chercher `socrafe` → la carte pointe vers `?q=socrafe` ; ouvrir → bandeau « Trouvé dans la photo 1 », au moins un `.cadre-mot` dont le centre tombe dans l'image ; redimensionner 1280→390 → le cadre garde ses % (`style.left` identique) ; chercher `télophase` → bandeau « Trouvé page 1 de biologie-mitose.pdf », onglet PDF actif, `.cadre-mot` présent ; chercher par mot du titre seulement → pas de bandeau, onglet 1 ; `#/note/<id>?q=%3Cscript%3E` → aucune exécution, aucun bandeau. Contexte A supprime la note.
- [ ] **Step 2: Lancer** → échec.
- [ ] **Step 3: Implémenter.**
- [ ] **Step 4: Relancer** → OK ; relancer `tests/unitaires.html` → tout OK.
- [ ] **Step 5: Commit** `Recherche : ouverture sur la bonne page et mot désigné`.

### Task 7: Documentation et vérification en production

**Files:**
- Modify: `README.md` (structure : `js/localisation.js`, `js/rendu.js`, `js/visionneuse.js`, `tests/` ; section « Tests » : `tests/unitaires.html`, `tests/securite-pages.ps1` ; schéma : `notes_pages`)

- [ ] **Step 1:** Mettre à jour le README.
- [ ] **Step 2:** Commit + push `Docs : visionneuse, tests, notes_pages` ; vérifier le déploiement Vercel du commit (le déclencher via MCP s'il n'apparaît pas en ~1 min).
- [ ] **Step 3:** Sur `https://jetaispasla.vercel.app` : relancer l'e2e de la Task 6 (contexte neuf) et une simulation LocalCDN (Task précédente du correctif) → aucune erreur.
