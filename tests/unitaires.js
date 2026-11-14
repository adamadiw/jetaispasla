// Mini-harnais de tests dans le navigateur, sans dépendance.
// Résultat : liste dans #resultats, et document.title = 'OK n/n' ou 'ÉCHEC k/n'.
(function () {
  'use strict';
  const tests = [];
  const test = (nom, fn) => tests.push({ nom, fn });

  function egal(obtenu, attendu) {
    const a = JSON.stringify(obtenu);
    const b = JSON.stringify(attendu);
    if (a !== b) throw new Error(`attendu ${b}\nobtenu  ${a}`);
  }

  // Accès paresseux : un module absent fait échouer le test, pas toute la page.
  const L = new Proxy({}, { get: (_, k) => window.JPL.localisation[k] });

  // ------------------------------------------------------------ localisation
  test('termes', () => egal(L.termes('La Maïeutique de Socrate'), ['maieutique', 'socrate']));
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

  // ------------------------------------------------------------ ocr
  test('boîtes normalisées', () => egal(window.JPL.ocr.boitesNormalisees([{ paragraphs: [{ lines: [{ words: [
    { text: 'Socrate', bbox: { x0: 100, y0: 50, x1: 300, y1: 90 } }, { text: ' ', bbox: { x0: 0, y0: 0, x1: 1, y1: 1 } }] }] }] }], 1000, 500),
  [[0.1, 0.1, 0.2, 0.08, 'Socrate']]));
  test('boîtes : entrée vide ou absente', () => egal(window.JPL.ocr.boitesNormalisees(null, 1000, 500), []));

  // ------------------------------------------------------------ rendu sûr
  const R = new Proxy({}, { get: (_, k) => window.JPL.rendu[k] });
  test('XSS script', async () => egal((await R.htmlSur('<p>ok</p><script>window.pwn=1</script>')).querySelector('script'), null));
  test('XSS onerror', async () => egal((await R.htmlSur('<img src=x onerror="window.pwn=1">')).querySelector('img').hasAttribute('onerror'), false));
  test('lien javascript', async () => egal((await R.htmlSur('<a href="javascript:alert(1)">x</a>')).querySelector('a').hasAttribute('href'), false));
  test('lien externe', async () => egal((await R.htmlSur('<a href="https://ex.org">x</a>')).querySelector('a').rel, 'noopener noreferrer'));
  test('lien externe : nouvel onglet', async () => egal((await R.htmlSur('<a href="https://ex.org">x</a>')).querySelector('a').target, '_blank'));
  test('pas de style ni iframe', async () => {
    const f = await R.htmlSur('<p style="position:fixed">a</p><iframe src="https://ex.org"></iframe><form><input></form>');
    egal([f.querySelector('p').hasAttribute('style'), !!f.querySelector('iframe'), !!f.querySelector('form'), !!f.querySelector('input')], [false, false, false, false]);
  });
  test('image data: conservée', async () => egal((await R.htmlSur('<img src="data:image/png;base64,iVBORw0KGgo=">')).querySelector('img').getAttribute('src').startsWith('data:image/png'), true));
  test('markdown', async () => egal((await R.markdown('# Titre\n\n- un')).querySelector('h1').textContent, 'Titre'));
  test('markdown : HTML brut neutralisé', async () => egal((await R.markdown('<img src=x onerror="window.pwn=1">')).querySelector('img').hasAttribute('onerror'), false));
  test('docx', async () => {
    const octets = await (await fetch('../samples/histoire-revolution-tranquille.docx')).arrayBuffer();
    egal((await R.docx(octets)).textContent.includes('Révolution tranquille'), true);
  });
  test('surligner', () => { const d = document.createElement('div'); d.textContent = 'Le procès de Socrafe'; egal(R.surligner(d, ['socrate']).textContent, 'Socrafe'); });
  test('surligner : rien trouvé', () => { const d = document.createElement('div'); d.textContent = 'Newton'; egal(R.surligner(d, ['socrate']), null); });
  // Revue : un auteur ne doit pas pouvoir imiter l'interface du site ni pister les lecteurs.
  test('revue : id et class retirés', async () => {
    const p = (await R.htmlSur('<p id="toast" class="toast plein-ecran">x</p>')).querySelector('p');
    egal([p.hasAttribute('id'), p.hasAttribute('class')], [false, false]);
  });
  test('revue : <dialog> retiré', async () => egal((await R.htmlSur('<dialog open><a href="https://ex.org">Connexion</a></dialog>')).querySelector('dialog'), null));
  test('revue : image distante bloquée', async () => egal((await R.htmlSur('<img src="https://pisteur.example/x.png">')).querySelector('img') === null
    || !(await R.htmlSur('<img src="https://pisteur.example/x.png">')).querySelector('img').hasAttribute('src'), true));
  test('revue sécurité : aucune ressource distante (vidéo, audio, picture)', async () => {
    const f = await R.htmlSur('<video poster="https://p.example/a.png" src="https://p.example/v.mp4"></video>'
      + '<audio src="https://p.example/a.mp3"></audio><picture><source srcset="https://p.example/b.png"><img src="data:image/png;base64,iVBORw0KGgo="></picture>'
      + '<p background="https://p.example/c.png">x</p>');
    const distantes = [...f.querySelectorAll('*')].filter((n) => ['src', 'srcset', 'poster', 'background']
      .some((a) => n.hasAttribute(a) && !/^data:image\//i.test(n.getAttribute(a))));
    egal(distantes.map((n) => n.tagName), []);
  });
  test('revue : caractère nul retiré', () => egal(window.JPL.sansNul('a\u0000b'), 'ab'));
  test('revue : caractère nul retiré des mots', () => egal(window.JPL.sansNul([[0.1, 0.2, 0.3, 0.4, 'x\u0000y']]), [[0.1, 0.2, 0.3, 0.4, 'xy']]));

  test('pas exécuté', async () => { await new Promise((r) => setTimeout(r, 50)); egal(window.pwn, undefined); });

  // ------------------------------------------------------------ exécution
  window.addEventListener('load', async () => {
    const liste = document.getElementById('resultats');
    let echecs = 0;
    for (const t of tests) {
      const li = document.createElement('li');
      try {
        await t.fn();
        li.className = 'ok';
        li.textContent = `OK — ${t.nom}`;
      } catch (err) {
        echecs++;
        li.className = 'echec';
        li.textContent = `ÉCHEC — ${t.nom}`;
        const pre = document.createElement('pre');
        pre.textContent = err && err.message ? err.message : String(err);
        li.append(pre);
      }
      liste.append(li);
    }
    document.title = echecs ? `ÉCHEC ${echecs}/${tests.length}` : `OK ${tests.length}/${tests.length}`;
  });

  window.TESTS = { test, egal };
})();
