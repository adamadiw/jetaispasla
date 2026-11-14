// Test de bout en bout de la visionneuse (Playwright : fonction async (page) => résultat).
// Lancer via l'outil Playwright « run code » avec ce fichier ; serveur local sur :8080.
// Utilise des notes de test existantes (lecture seule).
async (page) => {
  const BASE = 'http://127.0.0.1:8080/';
  const NOTES = {
    imageSansPages: '80802e27-e5f2-4871-93d1-991d573e7d93', // « Cours 4 — dialogue et questions »
    documents: '77e00d58-d572-4e0b-b034-3f01e80dd39a',     // « Test documents numériques » (pdf, pdf scanné, docx, md, txt)
    imageAbimee: 'daf36d9f-c5a8-457c-b0d0-60288ec37f4e',   // « Test échec OCR » (png illisible)
  };
  const ctx = await page.context().browser().newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  const erreurs = [];
  p.on('pageerror', (e) => erreurs.push(e.message));
  const verifs = [];
  const verifier = (nom, ok, detail) => verifs.push({ nom, ok: !!ok, detail });
  const ouvrir = async (id) => {
    await p.goto(`${BASE}#/note/${id}`);
    await p.waitForSelector('.visionneuse', { timeout: 15000 }).catch(() => {});
  };

  try {
    // 1. Note image sans notes_pages
    await ouvrir(NOTES.imageSansPages);
    await p.waitForFunction(() => { const i = document.querySelector('.visionneuse img.vision-image'); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 15000 }).catch(() => {});
    verifier('image affichée', await p.evaluate(() => { const i = document.querySelector('.visionneuse img.vision-image'); return !!(i && i.naturalWidth > 0); }));
    verifier('texte extrait replié', await p.evaluate(() => { const d = document.querySelector('details.texte-extrait'); return !!d && !d.open; }));
    verifier('bouton copier présent', await p.locator('details.texte-extrait button', { hasText: 'Copier le texte' }).count() === 1);
    const href = await p.locator('a', { hasText: "Ouvrir l'original" }).first().getAttribute('href').catch(() => null);
    verifier('ouvrir l’original = URL publique', href && href.includes('/storage/v1/object/public/notes-fichiers/'), href);
    verifier('plus de galerie de miniatures', await p.locator('.galerie').count() === 0);

    // 2. Note à 5 documents
    await ouvrir(NOTES.documents);
    verifier('5 onglets', await p.locator('.visionneuse [role="tab"]').count() === 5);
    await p.locator('.visionneuse [role="tab"]').nth(0).click({ timeout: 5000 }).catch(() => {});
    await p.waitForFunction(() => { const c = document.querySelector('.visionneuse canvas.vision-pdf'); return c && c.width > 0 && c.dataset.dessine === '1'; }, null, { timeout: 20000 }).catch(() => {});
    verifier('PDF dessiné', await p.evaluate(() => { const c = document.querySelector('.visionneuse canvas.vision-pdf'); return !!(c && c.dataset.dessine === '1'); }));
    verifier('PDF : Page 1/1', (await p.locator('.visionneuse .vision-pagination').textContent().catch(() => '')).includes('Page 1/1'));
    await p.locator('.visionneuse [role="tab"]').nth(2).click({ timeout: 5000 }).catch(() => {});
    await p.waitForSelector('.visionneuse .document-rendu p', { timeout: 15000 }).catch(() => {});
    verifier('Word rendu', (await p.locator('.visionneuse .document-rendu').textContent().catch(() => '')).includes('Révolution tranquille'));
    await p.locator('.visionneuse [role="tab"]').nth(3).click({ timeout: 5000 }).catch(() => {});
    await p.waitForSelector('.visionneuse .document-rendu h1', { timeout: 15000 }).catch(() => {});
    verifier('Markdown rendu', (await p.locator('.visionneuse .document-rendu h1').textContent().catch(() => '')).includes('MAT-103'));
    await p.locator('.visionneuse [role="tab"]').nth(4).click({ timeout: 5000 }).catch(() => {});
    await p.waitForSelector('.visionneuse .document-texte', { timeout: 15000 }).catch(() => {});
    verifier('Texte affiché', (await p.locator('.visionneuse .document-texte').textContent().catch(() => '')).includes('Lois de Newton'));

    // 3. Image illisible
    await ouvrir(NOTES.imageAbimee);
    await p.waitForSelector('text=Aperçu impossible dans ce navigateur.', { timeout: 15000 }).catch(() => {});
    verifier('image illisible : message', await p.locator('text=Aperçu impossible dans ce navigateur.').count() >= 1);

    // 4. Plein écran
    await ouvrir(NOTES.imageSansPages);
    await p.locator('.visionneuse button', { hasText: 'Plein écran' }).click({ timeout: 5000 }).catch(() => {});
    verifier('plein écran ouvert', await p.evaluate(() => !!document.querySelector('dialog.plein-ecran[open]')));
    await p.keyboard.press('Escape');

    // 5. Mobile
    await p.setViewportSize({ width: 390, height: 844 });
    await ouvrir(NOTES.documents);
    await p.waitForTimeout(1500);
    verifier('mobile : pas de défilement horizontal', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await p.screenshot({ path: 'C:\\Users\\megap\\Documents\\JtaisPasLa-Hackathon\\.playwright-mcp\\vision-mobile.png', fullPage: true });
    await p.setViewportSize({ width: 1280, height: 900 });
    await ouvrir(NOTES.imageSansPages);
    await p.waitForTimeout(1000);
    await p.screenshot({ path: 'C:\\Users\\megap\\Documents\\JtaisPasLa-Hackathon\\.playwright-mcp\\vision-bureau.png', fullPage: true });
  } finally {
    await ctx.close();
  }
  verifier('aucune erreur JS', erreurs.length === 0, erreurs);
  const echecs = verifs.filter((v) => !v.ok);
  return { resultat: echecs.length ? `ÉCHEC ${echecs.length}/${verifs.length}` : `OK ${verifs.length}/${verifs.length}`, echecs, toutes: verifs.map((v) => `${v.ok ? 'OK' : 'ÉCHEC'} ${v.nom}`) };
}
