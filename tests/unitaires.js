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
