// Tests des correctifs issus de la revue de code (Playwright : async (page) => résultat).
async (page) => {
  const BASE = globalThis.JPL_BASE || 'http://127.0.0.1:8080/';
  const DOCS = '77e00d58-d572-4e0b-b034-3f01e80dd39a'; // pdf, pdf scanné, docx, md, txt
  const SAMPLES = 'C:\\Users\\megap\\Documents\\JtaisPasLa-Hackathon\\samples\\';
  const verifs = [];
  const verifier = (nom, ok, detail) => verifs.push({ nom, ok: !!ok, detail });
  const erreurs = [];

  // 1. Retirer un fichier pendant l'envoi ne doit pas décaler les pages enregistrées.
  {
    const ctx = await page.context().browser().newContext();
    await ctx.route('**/storage/v1/object/notes-fichiers/**', async (route) => {
      if (route.request().method() === 'POST') await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => erreurs.push(e.message));
    p.on('dialog', (d) => d.accept());
    await p.goto(`${BASE}#/publier`);
    await p.locator('#champ-fichiers').setInputFiles([`${SAMPLES}maths-derivees.md`, `${SAMPLES}physique-newton.txt`]);
    await p.waitForFunction(() => [...document.querySelectorAll('.fichier-etat')].every((e) => /Texte lu/.test(e.textContent)));
    await p.fill('[name=titre]', 'Test revue index (à supprimer)');
    await p.selectOption('[name=matiere]', 'Autre');
    await p.selectOption('[name=type_document]', 'autre');
    await p.click('#bouton-publier');
    await p.waitForTimeout(400); // envoi en cours
    await p.locator('.fichier button', { hasText: 'Retirer' }).first().click({ timeout: 3000 }).catch(() => {});
    await p.waitForURL(/#\/note\//, { timeout: 30000 }).catch(() => {});
    const id = (p.url().match(/note\/([0-9a-f-]{36})/) || [])[1];
    if (id) {
      const r = await p.evaluate(async (id) => {
        const note = (await JPL.api.chargerNotes()).find((n) => n.id === id);
        const pages = await JPL.api.chargerPages(id);
        return { fichiers: note.fichiers.map((f) => f.nom), pages: pages.map((l) => ({ fichier: l.fichier, debut: l.texte.slice(0, 12) })) };
      }, id);
      const p0 = r.pages.find((l) => l.fichier === 0);
      verifier('index : page 0 = texte du fichier 0', r.fichiers[0] === 'maths-derivees.md' && p0 && p0.debut.startsWith('# MAT-103'), r);
      await p.goto(`${BASE}#/note/${id}`);
      await p.locator('button', { hasText: 'Supprimer ma note' }).click({ timeout: 10000 }).catch(() => {});
      await p.waitForURL((u) => !u.toString().includes('/note/'), { timeout: 10000 }).catch(() => {});
    } else {
      verifier('index : note publiée', false, p.url());
    }
    await ctx.close();
  }

  // 2 et 3. Visionneuse : rendus concurrents et changement de fichier.
  {
    const ctx = await page.context().browser().newContext({ viewport: { width: 1280, height: 900 } });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => erreurs.push(e.message));
    await p.goto(`${BASE}#/note/${DOCS}`);
    await p.waitForFunction(() => document.querySelector('.vision-scene canvas')?.dataset.dessine === '1', null, { timeout: 20000 }).catch(() => {});

    // 3. Passer du PDF au Word : l'ancien PDF ne doit pas rester affiché sous le nouvel onglet.
    const pdfResteAffiche = await p.evaluate(() => {
      document.querySelectorAll('.vision-onglet')[2].click();
      return !!document.querySelector('.vision-scene canvas');
    });
    verifier('changement de fichier : ancien PDF retiré tout de suite', !pdfResteAffiche);

    // 2. Plein écran pendant un nouveau rendu de la page : les deux doivent aboutir.
    const concurrence = await p.evaluate(async () => {
      const note = (await JPL.api.chargerNotes()).find((n) => n.id === '77e00d58-d572-4e0b-b034-3f01e80dd39a');
      const zone = document.createElement('div');
      zone.style.width = '800px';
      document.body.append(zone);
      const v = JPL.visionneuse.creer(zone, note);
      await v.pret;
      const bouton = [...zone.querySelectorAll('button')].find((b) => b.textContent === 'Plein écran');
      bouton.click();
      v.aller(0, 0); // nouveau rendu de la page en même temps
      await new Promise((r) => setTimeout(r, 4000));
      const c = zone.querySelector('.vision-scene canvas');
      const res = {
        pleinEcran: !!document.querySelector('dialog.plein-ecran[open] canvas[data-dessine="1"]'),
        vueNormale: !!(c && c.dataset.dessine === '1'),
      };
      document.querySelector('dialog.plein-ecran')?.close();
      v.detruire(); zone.remove();
      return res;
    });
    verifier('rendus concurrents : plein écran ouvert', concurrence.pleinEcran, concurrence);
    verifier('rendus concurrents : vue normale dessinée', concurrence.vueNormale, concurrence);
    await ctx.close();
  }

  verifier('aucune erreur JS', erreurs.length === 0, erreurs);
  const echecs = verifs.filter((v) => !v.ok);
  return { resultat: echecs.length ? `ÉCHEC ${echecs.length}/${verifs.length}` : `OK ${verifs.length}/${verifs.length}`, echecs, toutes: verifs.map((v) => `${v.ok ? 'OK' : 'ÉCHEC'} ${v.nom}`) };
}
