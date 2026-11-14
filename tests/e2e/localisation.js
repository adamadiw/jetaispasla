// Test de bout en bout : une recherche ouvre la bonne page et désigne le mot.
// Note de test « Test T3 pages (à supprimer) » : fichier 0 = photo manuscrite
// simulée (Socrate…), fichier 1 = biologie-mitose.pdf ; titre sans ces mots.
async (page) => {
  const BASE = 'http://127.0.0.1:8080/';
  const ID = '10812299-9a49-4313-89ed-4ab4ee84477d';
  const ANCIENNE = '80802e27-e5f2-4871-93d1-991d573e7d93'; // sans notes_pages
  const DOCS = '77e00d58-d572-4e0b-b034-3f01e80dd39a';     // sans notes_pages, contient un .docx
  const ctx = await page.context().browser().newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  const erreurs = [];
  p.on('pageerror', (e) => erreurs.push(e.message));
  const verifs = [];
  const verifier = (nom, ok, detail) => verifs.push({ nom, ok: !!ok, detail });
  const bandeau = () => p.evaluate(() => { const b = document.querySelector('.vision-bandeau'); return b && !b.hidden ? b.textContent : null; });
  const ongletActif = () => p.evaluate(() => [...document.querySelectorAll('.vision-onglet')].findIndex((o) => o.getAttribute('aria-selected') === 'true'));
  const attendreCadres = () => p.waitForSelector('.vision-calque .cadre-mot', { timeout: 20000 }).catch(() => {});
  const cadreDansMedia = () => p.evaluate(() => {
    const c = document.querySelector('.vision-calque .cadre-mot');
    const m = document.querySelector('.vision-cadre img, .vision-cadre canvas');
    if (!c || !m) return false;
    const a = c.getBoundingClientRect(); const b = m.getBoundingClientRect();
    const cx = a.left + a.width / 2; const cy = a.top + a.height / 2;
    return a.width > 0 && cx >= b.left && cx <= b.right && cy >= b.top && cy <= b.bottom;
  });

  try {
    // 1. Recherche avec faute OCR -> lien avec ?q=
    await p.goto(BASE);
    await p.waitForFunction(() => !/Chargement/.test(document.querySelector('#etat-catalogue').textContent));
    await p.fill('#champ-recherche', 'socrafe');
    await p.waitForTimeout(300);
    const href = await p.locator(`a.fiche[href^="#/note/${ID}"]`).getAttribute('href').catch(() => null);
    verifier('carte : lien avec ?q=socrafe', href === `#/note/${ID}?q=socrafe`, href);

    // 2. Ouverture : photo 1, bandeau, cadre sur le mot
    await p.locator(`a.fiche[href^="#/note/${ID}"]`).click({ timeout: 5000 }).catch(() => {});
    await attendreCadres();
    verifier('bandeau photo 1', (await bandeau()) === 'Trouvé dans la photo 1', await bandeau());
    verifier('cadre(s) sur la photo', await p.locator('.vision-calque .cadre-mot').count() >= 1);
    verifier('cadre dans l’image', await cadreDansMedia());

    // 3. Redimensionnement : positions en %, toujours alignées
    const avant = await p.locator('.vision-calque .cadre-mot').first().getAttribute('style').catch(() => '');
    await p.setViewportSize({ width: 390, height: 844 });
    await p.waitForTimeout(600);
    const apres = await p.locator('.vision-calque .cadre-mot').first().getAttribute('style').catch(() => '');
    verifier('positions en % inchangées', avant && avant === apres && avant.includes('%'), { avant, apres });
    verifier('cadre toujours dans l’image (mobile)', await cadreDansMedia());
    await p.setViewportSize({ width: 1280, height: 900 });

    // 4. Mot du PDF numérique
    await p.goto(`${BASE}#/note/${ID}?q=${encodeURIComponent('télophase')}`);
    await attendreCadres();
    verifier('bandeau page PDF', (await bandeau()) === 'Trouvé page 1 de biologie-mitose.pdf', await bandeau());
    verifier('onglet PDF actif', (await ongletActif()) === 1);
    verifier('cadre sur le PDF', await p.locator('.vision-calque .cadre-mot').count() >= 1);
    verifier('cadre dans la page PDF', await cadreDansMedia());

    // 5. Mot présent seulement dans le titre -> pas de bandeau, fichier 1
    await p.goto(`${BASE}#/note/${ID}?q=pages`);
    await p.waitForSelector('.vision-cadre', { timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(800);
    verifier('titre seul : pas de bandeau', (await bandeau()) === null, await bandeau());
    verifier('titre seul : premier fichier', (await ongletActif()) === 0);

    // 6. Requête hostile dans l'URL
    await p.goto(`${BASE}#/note/${ID}?q=%3Cimg%20src%3Dx%20onerror%3Dwindow.pwn%3D1%3E`);
    await p.waitForTimeout(1500);
    verifier('requête hostile : rien exécuté', await p.evaluate(() => window.pwn === undefined));

    // 7. Note ancienne (sans pages) avec ?q=
    await p.goto(`${BASE}#/note/${ANCIENNE}?q=socrate`);
    await p.waitForSelector('.vision-cadre img', { timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(800);
    verifier('note ancienne : affichée sans bandeau', (await p.locator('.vision-cadre img').count()) === 1 && (await bandeau()) === null);

    // 8. Document Word : mot surligné dans le rendu
    await p.goto(`${BASE}#/note/${DOCS}?q=lesage`);
    await p.waitForSelector('.vision-onglet', { timeout: 15000 }).catch(() => {});
    await p.locator('.vision-onglet').nth(2).click({ timeout: 5000 }).catch(() => {});
    await p.waitForSelector('.document-rendu mark', { timeout: 15000 }).catch(() => {});
    verifier('Word : mot surligné', (await p.locator('.document-rendu mark').first().textContent().catch(() => '')) === 'Lesage');
  } finally {
    await ctx.close();
  }
  verifier('aucune erreur JS', erreurs.length === 0, erreurs);
  const echecs = verifs.filter((v) => !v.ok);
  return { resultat: echecs.length ? `ÉCHEC ${echecs.length}/${verifs.length}` : `OK ${verifs.length}/${verifs.length}`, echecs, toutes: verifs.map((v) => `${v.ok ? 'OK' : 'ÉCHEC'} ${v.nom}`) };
}
