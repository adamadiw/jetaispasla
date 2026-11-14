// Visionneuse intégrée : affiche les originaux d'une note (photos, PDF, Word,
// Markdown, texte), un fichier à la fois, une page PDF à la fois.
(function () {
  'use strict';
  const JPL = (window.JPL = window.JPL || {});
  const { el } = JPL;

  const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  function genre(fichier) {
    const t = fichier.type || '';
    if (t.startsWith('image/')) return 'image';
    if (t === 'application/pdf') return 'pdf';
    if (t === MIME_DOCX) return 'docx';
    if (t === 'text/markdown') return 'markdown';
    return 'texte';
  }

  function libelleOnglet(fichier, rangImage) {
    const g = genre(fichier);
    if (g === 'image') return `Photo ${rangImage}`;
    return fichier.nom || 'Document';
  }

  // ------------------------------------------------------------------
  function creer(conteneur, note, options) {
    const opts = options || {};
    const fichiers = note.fichiers || [];
    const etat = { fichier: 0, page: 0, nbPages: 1, jeton: 0 };
    const pdfs = new Map(); // fichier -> Promise<PDFDocumentProxy>
    const tachesPdf = {}; // une tâche de rendu par usage ('vue', 'plein') : elles ne s'annulent pas entre elles
    let fichierAffiche = -1; // fichier actuellement à l'écran
    let elementCourant = null; // ce qui est affiché (img, canvas ou document rendu)

    // Onglets (seulement s'il y a plusieurs fichiers)
    let rangImage = 0;
    const onglets = fichiers.map((f, i) => {
      if (genre(f) === 'image') rangImage++;
      return el('button', {
        type: 'button', role: 'tab', class: 'vision-onglet', id: `onglet-${i}`,
        'aria-selected': 'false', 'aria-controls': 'vision-scene', tabindex: '-1',
        onclick: () => aller(i, 0),
      }, libelleOnglet(f, rangImage));
    });
    const barreOnglets = fichiers.length > 1
      ? el('div', { class: 'vision-onglets', role: 'tablist', 'aria-label': 'Fichiers de la note' }, onglets)
      : null;

    const bandeau = el('p', { class: 'vision-bandeau', role: 'status', hidden: true });
    const scene = el('div', { class: 'vision-scene', id: 'vision-scene', role: 'tabpanel', tabindex: '0' });
    const pagination = el('span', { class: 'vision-pagination' });
    const precedent = el('button', { type: 'button', class: 'bouton bouton-discret bouton-petit', 'aria-label': 'Page précédente', onclick: () => aller(etat.fichier, etat.page - 1) }, '‹');
    const suivant = el('button', { type: 'button', class: 'bouton bouton-discret bouton-petit', 'aria-label': 'Page suivante', onclick: () => aller(etat.fichier, etat.page + 1) }, '›');
    const navPages = el('span', { class: 'vision-pages' }, precedent, pagination, suivant);
    const boutonPleinEcran = el('button', { type: 'button', class: 'bouton bouton-discret bouton-petit', onclick: () => pleinEcran() }, 'Plein écran');
    const lienOriginal = el('a', { class: 'bouton bouton-discret bouton-petit', target: '_blank', rel: 'noopener' }, "Ouvrir l'original");
    const outils = el('div', { class: 'vision-outils' }, navPages, el('span', { class: 'vision-actions' }, boutonPleinEcran, lienOriginal));

    const racine = el('section', { class: 'visionneuse', 'aria-label': 'Documents de la note' }, barreOnglets, bandeau, scene, outils);
    conteneur.replaceChildren(racine);

    // Flèches gauche/droite pour changer de page ou de fichier.
    racine.addEventListener('keydown', (e) => {
      if (e.target.closest('input, textarea')) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const pas = e.key === 'ArrowRight' ? 1 : -1;
        if (e.target.getAttribute('role') === 'tab') {
          const i = (etat.fichier + pas + fichiers.length) % fichiers.length;
          aller(i, 0).then(() => onglets[i].focus());
        } else if (etat.nbPages > 1) {
          aller(etat.fichier, etat.page + pas);
        }
        e.preventDefault();
      }
    });

    // Redessine la page PDF quand la largeur change (rotation, fenêtre).
    let largeurPrecedente = 0;
    const observateur = new ResizeObserver(JPL.debounce(() => {
      const l = scene.clientWidth;
      if (Math.abs(l - largeurPrecedente) > 40 && genre(fichiers[etat.fichier]) === 'pdf') afficher();
      largeurPrecedente = l;
    }, 200));
    observateur.observe(scene);

    // ----------------------------------------------------------------
    async function aller(fichier, page) {
      if (!fichiers.length) return;
      const f = Math.min(Math.max(0, Number(fichier) || 0), fichiers.length - 1);
      const changementFichier = f !== etat.fichier || !elementCourant;
      etat.fichier = f;
      etat.page = Math.max(0, Number(page) || 0);
      onglets.forEach((o, i) => {
        o.setAttribute('aria-selected', String(i === f));
        o.tabIndex = i === f ? 0 : -1;
      });
      scene.setAttribute('aria-labelledby', `onglet-${f}`);
      const fichierCourant = fichiers[f];
      const url = JPL.api.urlPublique(fichierCourant.chemin);
      lienOriginal.href = url;
      if (genre(fichierCourant) === 'docx') lienOriginal.setAttribute('download', fichierCourant.nom || 'document.docx');
      else lienOriginal.removeAttribute('download');
      if (changementFichier || genre(fichierCourant) === 'pdf') await afficher();
    }

    function message(texte) {
      elementCourant = null;
      scene.replaceChildren(el('p', { class: 'vision-message', text: texte }));
      boutonPleinEcran.disabled = true;
    }

    async function afficher() {
      const jeton = ++etat.jeton; // ignore les rendus devenus obsolètes
      const fichier = fichiers[etat.fichier];
      const url = JPL.api.urlPublique(fichier.chemin);
      const g = genre(fichier);
      etat.nbPages = 1;
      navPages.hidden = true;
      // Nouveau fichier : on retire tout de suite l'ancien (sinon il resterait visible sous le nouvel onglet).
      if (fichierAffiche !== etat.fichier) message('Chargement du document…');
      try {
        if (g === 'image') await afficherImage(url, fichier, jeton);
        else if (g === 'pdf') await afficherPdf(url, jeton);
        else await afficherDocument(url, g, jeton);
      } catch (err) {
        if (jeton !== etat.jeton) return;
        console.error(err);
        message("Impossible d'afficher ce fichier ici. Utilise « Ouvrir l'original ».");
      }
      if (jeton !== etat.jeton) return;
      fichierAffiche = elementCourant ? etat.fichier : -1;
      // Plein écran possible seulement quand quelque chose est affiché.
      boutonPleinEcran.disabled = !elementCourant;
      try {
        await designerMots(g, jeton);
      } catch (err) {
        console.warn('Mots non désignés :', err); // l'affichage reste utilisable
      }
    }

    // ----------------------------------------------------------------
    // Désigner les mots cherchés dans la vue affichée (si la note a été
    // ouverte depuis une recherche).
    const pourcent = (v) => `${(v * 100).toFixed(3)}%`;

    async function designerMots(g, jeton) {
      const termes = opts.termes || [];
      if (!termes.length || !elementCourant) return;
      if (g === 'image' || g === 'pdf') {
        const ligne = (opts.pages || []).find((l) => l.fichier === etat.fichier && l.page === (g === 'pdf' ? etat.page : 0));
        let boites = [];
        if (ligne && Array.isArray(ligne.mots) && ligne.mots.length) {
          boites = JPL.localisation.boitesCorrespondantes(ligne.mots, termes); // photo ou PDF scanné (OCR)
        } else if (g === 'pdf' && elementCourant.pdf) {
          boites = await boitesPdfNumerique(elementCourant, termes);
        }
        const calque = scene.querySelector('.vision-calque');
        if (jeton !== etat.jeton || !calque) return;
        calque.replaceChildren(...boites.map(([x, y, l, h]) => el('div', {
          class: 'cadre-mot',
          style: `left:${pourcent(x)};top:${pourcent(y)};width:${pourcent(l)};height:${pourcent(h)}`,
        })));
      } else {
        const premier = JPL.rendu.surligner(elementCourant, termes);
        if (premier) premier.scrollIntoView({ block: 'center' });
      }
    }

    // Position d'un mot dans une ligne de texte : proportion de la largeur mesurée
    // (plus juste qu'un simple compte de caractères, les lettres n'ayant pas la même largeur).
    const mesureur = document.createElement('canvas').getContext('2d');
    mesureur.font = '100px Arial, Helvetica, sans-serif';
    const proportion = (str, n) => (n <= 0 ? 0 : mesureur.measureText(str.slice(0, n)).width / (mesureur.measureText(str).width || 1));

    // PDF numérique : position des mots depuis le texte de la page (pdf.js).
    async function boitesPdfNumerique(canvas, termes) {
      const { page, viewport } = canvas.pdf;
      const contenu = await page.getTextContent();
      const boites = [];
      for (const item of contenu.items) {
        const str = item.str || '';
        if (!str.trim() || !item.transform || !item.width) continue;
        const motif = /[\p{L}\p{N}]+/gu;
        let m;
        while ((m = motif.exec(str))) {
          if (!termes.some((t) => JPL.localisation.correspond(m[0], t))) continue;
          const [, , c, d, e, f] = item.transform;
          const hauteur = item.height || Math.hypot(c, d);
          const debut = e + item.width * proportion(str, m.index);
          const fin = e + item.width * proportion(str, m.index + m[0].length);
          // pdf.js 6 n'a plus convertToViewportRectangle : on convertit les deux coins.
          const [x1, y1] = viewport.convertToViewportPoint(debut, f - hauteur * 0.25);
          const [x2, y2] = viewport.convertToViewportPoint(fin, f + hauteur * 0.95);
          boites.push([
            Math.min(x1, x2) / canvas.width, Math.min(y1, y2) / canvas.height,
            Math.abs(x2 - x1) / canvas.width, Math.abs(y2 - y1) / canvas.height,
          ].map(JPL.localisation.borner));
        }
      }
      return boites;
    }

    function afficherImage(url, fichier, jeton) {
      return new Promise((resolve) => {
        const img = el('img', { class: 'vision-image', alt: `${note.titre} (${fichier.nom || 'photo'})`, decoding: 'async' });
        img.onload = () => {
          if (jeton !== etat.jeton) return resolve();
          elementCourant = img;
          scene.replaceChildren(el('div', { class: 'vision-cadre' }, img, el('div', { class: 'vision-calque', 'aria-hidden': 'true' })));
          resolve();
        };
        img.onerror = () => {
          if (jeton === etat.jeton) message("Aperçu impossible dans ce navigateur. Utilise « Ouvrir l'original ».");
          resolve();
        };
        img.src = url;
      });
    }

    function documentPdf(url) {
      if (!pdfs.has(etat.fichier)) {
        const promesse = JPL.extraction.chargerPdfjs().then((pdfjs) =>
          // Chargement partiel : seules les pages affichées sont téléchargées
          // si le serveur accepte les requêtes Range (sinon téléchargement complet).
          pdfjs.getDocument({ url, disableAutoFetch: true, rangeChunkSize: 262144 }).promise);
        promesse.catch(() => pdfs.delete(etat.fichier));
        pdfs.set(etat.fichier, promesse);
      }
      return pdfs.get(etat.fichier);
    }

    async function dessinerPagePdf(doc, numero, largeurCss, densite, usage) {
      const page = await doc.getPage(numero + 1);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: (largeurCss / base.width) * densite });
      const canvas = el('canvas', { class: 'vision-pdf' });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (tachesPdf[usage]) tachesPdf[usage].cancel();
      const tache = page.render({ canvasContext: ctx, viewport });
      tachesPdf[usage] = tache;
      await tache.promise;
      if (tachesPdf[usage] === tache) tachesPdf[usage] = null;
      canvas.dataset.dessine = '1';
      return { canvas, page, viewport };
    }

    async function afficherPdf(url, jeton) {
      const doc = await documentPdf(url);
      if (jeton !== etat.jeton) return;
      etat.nbPages = doc.numPages;
      etat.page = Math.min(etat.page, doc.numPages - 1);
      pagination.textContent = `Page ${etat.page + 1}/${doc.numPages}`;
      precedent.disabled = etat.page === 0;
      suivant.disabled = etat.page >= doc.numPages - 1;
      precedent.hidden = suivant.hidden = doc.numPages <= 1;
      navPages.hidden = false;
      const largeur = Math.max(280, scene.clientWidth);
      let rendu;
      try {
        rendu = await dessinerPagePdf(doc, etat.page, largeur, Math.min(2, window.devicePixelRatio || 1), 'vue');
      } catch (err) {
        if (err && err.name === 'RenderingCancelledException') return;
        throw err;
      }
      if (jeton !== etat.jeton) return;
      elementCourant = rendu.canvas;
      elementCourant.pdf = { page: rendu.page, viewport: rendu.viewport };
      scene.replaceChildren(el('div', { class: 'vision-cadre' }, rendu.canvas, el('div', { class: 'vision-calque', 'aria-hidden': 'true' })));
    }

    async function afficherDocument(url, g, jeton) {
      const reponse = await fetch(url);
      if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
      let contenu;
      if (g === 'docx') {
        contenu = el('div', { class: 'document-rendu' });
        contenu.append(await JPL.rendu.docx(await reponse.arrayBuffer()));
      } else if (g === 'markdown') {
        contenu = el('div', { class: 'document-rendu' });
        contenu.append(await JPL.rendu.markdown(await reponse.text()));
      } else {
        contenu = el('div', { class: 'document-texte', text: await reponse.text() });
      }
      if (jeton !== etat.jeton) return;
      elementCourant = contenu;
      scene.replaceChildren(contenu);
    }

    // ----------------------------------------------------------------
    // Plein écran : la vue courante en grand, avec zoom.
    async function pleinEcran() {
      try {
        await ouvrirPleinEcran();
      } catch (err) {
        console.error(err);
        JPL.toast("Plein écran impossible pour ce fichier. Utilise « Ouvrir l'original ».", 'erreur');
      }
    }

    async function ouvrirPleinEcran() {
      if (!elementCourant) return;
      const g = genre(fichiers[etat.fichier]);
      const zone = el('div', { class: 'plein-ecran-zone' });
      const calque = scene.querySelector('.vision-calque');
      let contenu;
      if (g === 'image') {
        contenu = el('div', { class: 'vision-cadre' }, el('img', { src: elementCourant.src, alt: elementCourant.alt }),
          calque ? calque.cloneNode(true) : null);
      } else if (g === 'pdf') {
        const doc = await documentPdf(JPL.api.urlPublique(fichiers[etat.fichier].chemin));
        const { canvas } = await dessinerPagePdf(doc, etat.page, Math.max(800, scene.clientWidth), 2, 'plein');
        contenu = el('div', { class: 'vision-cadre' }, canvas, calque ? calque.cloneNode(true) : null);
      } else {
        contenu = elementCourant.cloneNode(true);
        contenu.classList.add('plein-ecran-document');
      }
      zone.append(contenu);

      const zoom = (mode) => {
        zone.dataset.zoom = mode;
        // 100 % = taille réelle de l'image (le canvas plein écran est dessiné en densité 2).
        const media = zone.querySelector('.vision-cadre img, .vision-cadre canvas');
        if (media) {
          const base = media.tagName === 'IMG' ? media.naturalWidth : media.width / 2;
          media.style.width = mode === 'ajuste' ? '' : `${base * (mode === '200' ? 2 : 1)}px`;
        }
        for (const b of boutonsZoom) b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
      };
      const boutonsZoom = [['ajuste', 'Ajusté'], ['100', '100 %'], ['200', '200 %']].map(([mode, libelle]) =>
        el('button', { type: 'button', class: 'bouton bouton-discret bouton-petit', dataset: { mode }, onclick: () => zoom(mode) }, libelle));
      const dialog = el('dialog', { class: 'plein-ecran', 'aria-label': `${note.titre}, plein écran` },
        el('div', { class: 'plein-ecran-outils' },
          el('span', { class: 'plein-ecran-zoom', role: 'group', 'aria-label': 'Zoom' }, boutonsZoom),
          el('button', { type: 'button', class: 'bouton bouton-encre bouton-petit', onclick: () => dialog.close() }, 'Fermer')),
        zone);
      dialog.addEventListener('close', () => dialog.remove());
      document.body.append(dialog);
      zoom('ajuste');
      dialog.showModal();
    }

    function afficherBandeau(texte) {
      bandeau.textContent = texte || '';
      bandeau.hidden = !texte;
    }

    function detruire() {
      observateur.disconnect();
      etat.jeton++;
      for (const p of pdfs.values()) p.then((d) => d.destroy()).catch(() => {});
      pdfs.clear();
    }

    const pret = aller(opts.fichier || 0, opts.page || 0);
    return { aller, detruire, afficherBandeau, pret, etat };
  }

  JPL.visionneuse = { creer, genre };
})();
