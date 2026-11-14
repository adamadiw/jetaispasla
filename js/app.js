// Interface : navigation, catalogue, publication, détail.
(function () {
  'use strict';
  const JPL = window.JPL;
  const { el, api, TYPES, MATIERES } = JPL;

  const MAX_FICHIERS = 10;
  const MAX_OCTETS = 10 * 1024 * 1024;

  // Types acceptés. Les documents numériques sont ajoutés par js/extraction.js s'il est chargé.
  const FORMATS = [
    { famille: 'image', extensions: ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'], mime: /^image\/(jpeg|png|webp|heic|heif)$/ },
  ];
  if (JPL.extraction) FORMATS.push(...JPL.extraction.FORMATS);

  const etat = {
    notes: [],
    notesChargees: false,
    erreurChargement: null,
    fichiers: [],          // [{ id, fichier, famille, apercu, preparation: Promise }]
    publicationEnCours: false,
  };

  const $ = (sel) => document.querySelector(sel);

  // ------------------------------------------------------------------
  // Navigation par hash : #/ , #/publier , #/note/<id>
  // ------------------------------------------------------------------
  function routeActuelle() {
    const hash = location.hash.replace(/^#/, '') || '/';
    if (hash === '/publier') return { vue: 'publier' };
    const m = hash.match(/^\/note\/([0-9a-f-]{36})$/i);
    if (m) return { vue: 'note', id: m[1] };
    return { vue: 'catalogue' };
  }

  function afficherRoute() {
    const route = routeActuelle();
    for (const vue of document.querySelectorAll('.vue')) vue.hidden = vue.id !== `vue-${route.vue}`;
    for (const lien of document.querySelectorAll('[data-nav]')) {
      if (lien.dataset.nav === route.vue) lien.setAttribute('aria-current', 'page');
      else lien.removeAttribute('aria-current');
    }
    if (route.vue === 'note') afficherDetail(route.id);
    if (route.vue === 'catalogue') {
      document.title = "J'étais pas là — les notes du cours que tu as manqué";
      afficherCatalogue();
    }
    if (route.vue === 'publier') document.title = "Publier une note — J'étais pas là";
    window.scrollTo(0, 0);
  }

  // ------------------------------------------------------------------
  // Catalogue et recherche
  // ------------------------------------------------------------------
  function remplirSelect(select, options) {
    for (const [valeur, libelle] of options) select.append(el('option', { value: valeur, text: libelle }));
  }

  function criteres() {
    return {
      requete: $('#champ-recherche').value.trim(),
      matiere: $('#filtre-matiere').value,
      type: $('#filtre-type').value,
    };
  }

  // Recherche simple (remplacée par MiniSearch si js/recherche.js est chargé).
  function rechercheSimple(notes, { requete, matiere, type }) {
    const termes = JPL.normaliser(requete).split(/\s+/).filter(Boolean);
    return notes
      .filter((n) => (!matiere || n.matiere === matiere) && (!type || n.type_document === type))
      .filter((n) => {
        if (!termes.length) return true;
        const texte = JPL.normaliser([n.titre, n.matiere, n.cours, n.etablissement, n.description, n.texte_contenu].join(' '));
        return termes.every((t) => texte.includes(t));
      })
      .map((note) => ({ note, termes }));
  }

  function rechercher(c) {
    if (JPL.recherche && JPL.recherche.pret()) return JPL.recherche.chercher(c);
    return rechercheSimple(etat.notes, c);
  }

  // Extrait du contenu autour du premier terme trouvé, avec surlignage.
  function construireExtrait(note, termes) {
    const source = note.texte_contenu || note.description || '';
    if (!source) return null;
    const LONGUEUR = 160;
    // Normalisation caractère par caractère pour garder la correspondance des positions.
    const normalise = Array.from(source, (c) => JPL.normaliser(c).charAt(0) || c).join('');
    const termesUtiles = (termes || []).filter((t) => t.length >= 2);
    let position = -1;
    for (const t of termesUtiles) {
      const p = normalise.indexOf(t);
      if (p !== -1 && (position === -1 || p < position)) position = p;
    }
    if (termesUtiles.length && position === -1) return null;
    const debut = Math.max(0, position === -1 ? 0 : position - 50);
    const fin = Math.min(source.length, debut + LONGUEUR);
    const morceau = source.slice(debut, fin).replace(/\s+/g, ' ');
    const morceauNormalise = normalise.slice(debut, fin).replace(/\s+/g, ' ');

    const p = el('p', { class: 'extrait' });
    if (debut > 0) p.append('…');
    if (!termesUtiles.length) {
      p.append(morceau);
    } else {
      // Repère les plages à surligner dans le morceau.
      const plages = [];
      for (const t of termesUtiles) {
        let i = morceauNormalise.indexOf(t);
        while (i !== -1) {
          plages.push([i, i + t.length]);
          i = morceauNormalise.indexOf(t, i + t.length);
        }
      }
      plages.sort((a, b) => a[0] - b[0]);
      let curseur = 0;
      for (const [a, b] of plages) {
        if (a < curseur) continue;
        p.append(morceau.slice(curseur, a), el('mark', { text: morceau.slice(a, b) }));
        curseur = b;
      }
      p.append(morceau.slice(curseur));
    }
    if (fin < source.length) p.append('…');
    return p;
  }

  function premiereImage(note) {
    return (note.fichiers || []).find((f) => f.type.startsWith('image/') && !/hei[cf]/.test(f.type));
  }

  function libelleFormat(type) {
    if (type === 'application/pdf') return 'PDF';
    if (type.includes('wordprocessingml')) return 'Word';
    if (type === 'text/markdown') return 'Markdown';
    if (type === 'text/plain') return 'Texte';
    return 'Photo';
  }

  function carteNote({ note, termes }) {
    const image = premiereImage(note);
    const visuel = image
      ? el('img', { src: api.urlPublique(image.chemin), alt: '', loading: 'lazy', decoding: 'async' })
      : el('span', { class: 'fiche-format', text: libelleFormat(note.fichiers[0].type) });
    const nb = note.fichiers.length;
    return el('li', null,
      el('a', { class: 'fiche', href: `#/note/${note.id}` },
        el('div', { class: 'fiche-visuel' }, visuel,
          nb > 1 ? el('span', { class: 'fiche-compte', text: `${nb} fichiers` }) : null),
        el('div', { class: 'fiche-corps' },
          el('h2', { class: 'fiche-titre', text: note.titre }),
          el('p', { class: 'fiche-cours' },
            el('span', { text: note.matiere }),
            note.cours ? el('span', { text: note.cours }) : null),
          construireExtrait(note, termes),
          el('p', { class: 'fiche-pied' },
            el('span', { text: TYPES[note.type_document] || 'Autre' }),
            el('time', { datetime: note.created_at, text: JPL.formaterDate(note.created_at) })))));
  }

  function afficherCatalogue() {
    const liste = $('#liste-notes');
    const statut = $('#etat-catalogue');
    const vide = $('#vide-catalogue');
    liste.replaceChildren();
    vide.hidden = true;

    if (etat.erreurChargement) {
      statut.textContent = `Impossible de charger les notes. ${JPL.messageErreur(etat.erreurChargement)}`;
      statut.classList.add('etat-erreur');
      return;
    }
    statut.classList.remove('etat-erreur');
    if (!etat.notesChargees) {
      statut.textContent = 'Chargement des notes…';
      return;
    }

    const c = criteres();
    const resultats = rechercher(c);
    const filtreActif = c.requete || c.matiere || c.type;

    if (!etat.notes.length) {
      statut.textContent = '';
      $('#vide-message').textContent = "Aucune note pour l'instant. Sois la première personne à en publier une.";
      vide.hidden = false;
      return;
    }
    if (!resultats.length) {
      statut.textContent = '';
      const message = $('#vide-message');
      message.textContent = c.requete
        ? `Aucune note ne contient « ${c.requete} ». Essaie un autre mot, retire un filtre, ou publie tes propres notes sur ce sujet.`
        : 'Aucune note ne correspond à ces filtres.';
      const suggestion = c.requete && JPL.recherche && JPL.recherche.pret() ? JPL.recherche.suggerer(c.requete) : null;
      if (suggestion && JPL.normaliser(suggestion) !== JPL.normaliser(c.requete)) {
        message.append(' ', el('button', {
          type: 'button', class: 'lien-bouton',
          onclick: () => { $('#champ-recherche').value = suggestion; afficherCatalogue(); },
        }, `Chercher « ${suggestion} »`));
      }
      vide.hidden = false;
      return;
    }
    statut.textContent = filtreActif
      ? `${resultats.length} note${resultats.length > 1 ? 's' : ''} trouvée${resultats.length > 1 ? 's' : ''}`
      : `${etat.notes.length} note${etat.notes.length > 1 ? 's' : ''} partagée${etat.notes.length > 1 ? 's' : ''}, les plus récentes d'abord`;
    liste.append(...resultats.map(carteNote));
  }

  async function chargerNotes() {
    try {
      etat.notes = await api.chargerNotes();
      etat.erreurChargement = null;
      etat.notesChargees = true;
      if (JPL.recherche) JPL.recherche.indexer(etat.notes);
    } catch (err) {
      console.error(err);
      etat.erreurChargement = err;
    }
    const route = routeActuelle();
    if (route.vue === 'catalogue') afficherCatalogue();
    if (route.vue === 'note') afficherDetail(route.id);
  }

  // ------------------------------------------------------------------
  // Détail d'une note
  // ------------------------------------------------------------------
  function afficherDetail(id) {
    const conteneur = $('#detail-note');
    conteneur.replaceChildren();
    if (!etat.notesChargees) {
      conteneur.append(el('p', { class: 'etat', text: etat.erreurChargement ? JPL.messageErreur(etat.erreurChargement) : 'Chargement de la note…' }));
      return;
    }
    const note = etat.notes.find((n) => n.id === id);
    if (!note) {
      conteneur.append(el('p', { class: 'etat', text: "Cette note n'existe pas ou a été supprimée." }));
      return;
    }
    document.title = `${note.titre} — J'étais pas là`;
    const estAMoi = note.owner_id === api.utilisateurId();

    const meta = el('dl', { class: 'detail-meta' },
      el('div', null, el('dt', { text: 'Matière' }), el('dd', { text: note.matiere })),
      note.cours ? el('div', null, el('dt', { text: 'Cours' }), el('dd', { text: note.cours })) : null,
      note.etablissement ? el('div', null, el('dt', { text: 'Établissement' }), el('dd', { text: note.etablissement })) : null,
      el('div', null, el('dt', { text: 'Type' }), el('dd', { text: TYPES[note.type_document] || 'Autre' })),
      el('div', null, el('dt', { text: 'Publiée' }), el('dd', null, el('time', { datetime: note.created_at, text: JPL.formaterDate(note.created_at) }))));

    const galerie = el('ul', { class: 'galerie' }, note.fichiers.map((f, i) => {
      const url = api.urlPublique(f.chemin);
      const estImage = f.type.startsWith('image/') && !/hei[cf]/.test(f.type);
      if (estImage) {
        return el('li', null, el('button', {
          type: 'button', class: 'galerie-image',
          'aria-label': `Agrandir l'image ${i + 1} sur ${note.fichiers.length}`,
          onclick: () => ouvrirImage(url, `Page ${i + 1} de ${note.titre}`),
        }, el('img', { src: url, alt: `Page ${i + 1} de ${note.titre}`, loading: 'lazy' })));
      }
      return el('li', null, el('a', { class: 'galerie-document', href: url, target: '_blank', rel: 'noopener', download: f.nom },
        el('span', { class: 'fiche-format', text: libelleFormat(f.type) }),
        el('span', { class: 'galerie-nom', text: f.nom })));
    }));

    const actions = el('div', { class: 'detail-actions' },
      estAMoi ? el('button', { type: 'button', class: 'bouton bouton-marge', onclick: () => supprimer(note) }, 'Supprimer ma note') : null,
      !estAMoi ? el('button', { type: 'button', class: 'bouton bouton-discret', onclick: () => ouvrirSignalement(note) }, 'Signaler') : null);

    // Note : Element.append() écrirait « null » en texte, d'où le filtre.
    conteneur.append(...[
      el('h1', { class: 'titre-page', text: note.titre }),
      meta,
      note.description ? el('p', { class: 'detail-description', text: note.description }) : null,
      galerie,
      el('section', { class: 'detail-texte', 'aria-labelledby': 'titre-texte' },
        el('h2', { id: 'titre-texte', text: 'Texte de la note' }),
        note.texte_contenu
          ? el('div', { class: 'texte-cahier', text: note.texte_contenu })
          : el('p', { class: 'etat', text: "Aucun texte n'a été extrait de cette note." })),
      actions,
    ].filter(Boolean));
  }

  function ouvrirImage(url, alt) {
    const img = $('#image-agrandie');
    img.src = url;
    img.alt = alt;
    $('#dialog-image').showModal();
  }

  async function supprimer(note) {
    if (!confirm(`Supprimer « ${note.titre} » ? Les fichiers seront aussi supprimés. Cette action est définitive.`)) return;
    try {
      await api.supprimerNote(note);
      etat.notes = etat.notes.filter((n) => n.id !== note.id);
      if (JPL.recherche) JPL.recherche.retirer(note);
      JPL.toast('Note supprimée.');
      location.hash = '#/';
    } catch (err) {
      console.error(err);
      JPL.toast(`Suppression impossible. ${JPL.messageErreur(err)}`, 'erreur');
    }
  }

  function ouvrirSignalement(note) {
    const dialog = $('#dialog-signaler');
    const champ = $('#champ-raison');
    champ.value = '';
    dialog.onclose = async () => {
      const raison = champ.value.trim();
      if (dialog.returnValue !== 'envoyer' || !raison) return;
      try {
        const resultat = await api.signalerNote(note.id, raison);
        JPL.toast(resultat === 'deja' ? 'Tu as déjà signalé cette note.' : 'Signalement envoyé. Merci.');
      } catch (err) {
        console.error(err);
        JPL.toast(`Signalement impossible. ${JPL.messageErreur(err)}`, 'erreur');
      }
    };
    dialog.showModal();
  }

  // ------------------------------------------------------------------
  // Publication
  // ------------------------------------------------------------------
  function formatDe(fichier) {
    const ext = (fichier.name.split('.').pop() || '').toLowerCase();
    return FORMATS.find((f) => f.extensions.includes(ext) || (fichier.type && f.mime.test(fichier.type))) || null;
  }

  function ajouterFichiers(liste) {
    const refuses = [];
    for (const fichier of liste) {
      if (etat.fichiers.length >= MAX_FICHIERS) { refuses.push(`${fichier.name} : maximum ${MAX_FICHIERS} fichiers par note`); continue; }
      const format = formatDe(fichier);
      if (!format) { refuses.push(`${fichier.name} : format non accepté`); continue; }
      if (fichier.size > MAX_OCTETS) { refuses.push(`${fichier.name} : dépasse 10 Mo`); continue; }
      if (fichier.size === 0) { refuses.push(`${fichier.name} : fichier vide`); continue; }
      const item = { id: crypto.randomUUID(), fichier, famille: format.famille, elementEtat: null };
      item.preparation = preparerFichier(item);
      etat.fichiers.push(item);
    }
    if (refuses.length) JPL.toast(`Fichier${refuses.length > 1 ? 's' : ''} ignoré${refuses.length > 1 ? 's' : ''} : ${refuses.join(' ; ')}.`, 'erreur');
    afficherFichiers();
  }

  // Prépare le fichier pour l'envoi et lance la lecture du texte (OCR ou extraction).
  async function preparerFichier(item) {
    const f = item.fichier;
    let pret;
    if (item.famille === 'image') {
      pret = await JPL.images.preparerImage(f);
    } else {
      pret = JPL.extraction.preparerDocument(f, item.famille);
    }
    pret.nom = f.name;
    item.pret = pret;
    lireTexte(item);
    return pret;
  }

  // Lecture du texte : branchée par js/ocr.js et js/extraction.js.
  async function lireTexte(item) {
    const lecteur = item.famille === 'image' ? JPL.ocr : JPL.extraction;
    if (!lecteur) return;
    item.lecture = (async () => {
      majEtatFichier(item, item.famille === 'image' ? 'Lecture du texte en attente…' : 'Lecture du texte…');
      try {
        if (item.famille === 'image' && item.pret.lisible === false) {
          majEtatFichier(item, "Texte non lu : ce navigateur ne peut pas ouvrir cette image (fichier abîmé ou format HEIC). Saisis le texte toi-même.", 'avertissement');
          return;
        }
        const texte = (await lecteur.lireTexte(item, (msg) => majEtatFichier(item, msg))).trim();
        if (!etat.fichiers.includes(item)) return; // retiré entre-temps
        if (texte) {
          ajouterTexte(texte);
          majEtatFichier(item, `Texte lu (${texte.split(/\s+/).length} mots)`, 'ok');
        } else {
          majEtatFichier(item, 'Aucun texte détecté. Tu peux le saisir toi-même.', 'avertissement');
        }
      } catch (err) {
        console.error(err);
        majEtatFichier(item, 'Lecture du texte impossible. Tu peux le saisir toi-même.', 'avertissement');
      } finally {
        majAnalyseGlobale();
      }
    })();
    majAnalyseGlobale();
  }

  function ajouterTexte(texte) {
    const zone = $('#champ-texte');
    zone.value = zone.value.trim() ? `${zone.value.trimEnd()}\n\n${texte}` : texte;
  }

  function majEtatFichier(item, message, ton) {
    item.message = message;
    item.ton = ton || '';
    if (item.elementEtat) {
      item.elementEtat.textContent = message;
      item.elementEtat.dataset.ton = item.ton;
    }
  }

  function majAnalyseGlobale() {
    const zone = $('#etat-analyse');
    const enCours = etat.fichiers.filter((i) => i.lecture && !i.lectureTerminee);
    // Marque les lectures terminées.
    for (const item of etat.fichiers) {
      if (item.lecture && !item.suivi) {
        item.suivi = true;
        item.lecture.finally(() => { item.lectureTerminee = true; majAnalyseGlobale(); });
      }
    }
    if (enCours.length) {
      zone.hidden = false;
      zone.textContent = `Analyse des fichiers… ${etat.fichiers.length - enCours.length}/${etat.fichiers.length}`;
    } else {
      zone.hidden = true;
    }
  }

  function afficherFichiers() {
    const liste = $('#liste-fichiers');
    liste.replaceChildren(...etat.fichiers.map((item) => {
      if (!item.apercu && item.famille === 'image') item.apercu = URL.createObjectURL(item.fichier);
      const etatEl = el('span', { class: 'fichier-etat', text: item.message || '', dataset: { ton: item.ton || '' } });
      item.elementEtat = etatEl;
      return el('li', { class: 'fichier' },
        item.famille === 'image'
          ? el('img', { src: item.apercu, alt: '', class: 'fichier-apercu' })
          : el('span', { class: 'fichier-apercu fiche-format', text: libelleFormat(item.fichier.type || '') }),
        el('span', { class: 'fichier-infos' },
          el('span', { class: 'fichier-nom', text: item.fichier.name }),
          el('span', { class: 'fichier-taille', text: JPL.formaterTaille(item.fichier.size) }),
          etatEl),
        el('button', {
          type: 'button', class: 'bouton bouton-discret bouton-petit',
          'aria-label': `Retirer ${item.fichier.name}`,
          onclick: () => retirerFichier(item),
        }, 'Retirer'));
    }));
  }

  function retirerFichier(item) {
    etat.fichiers = etat.fichiers.filter((i) => i !== item);
    if (item.apercu) URL.revokeObjectURL(item.apercu);
    afficherFichiers();
    majAnalyseGlobale();
  }

  function reinitialiserFormulaire() {
    $('#form-publier').reset();
    for (const item of etat.fichiers) if (item.apercu) URL.revokeObjectURL(item.apercu);
    etat.fichiers = [];
    afficherFichiers();
    majAnalyseGlobale();
    $('#erreur-publier').hidden = true;
  }

  function afficherErreurPublier(message, champ) {
    const zone = $('#erreur-publier');
    zone.textContent = message;
    zone.hidden = false;
    if (champ) champ.focus();
  }

  async function publier(evt) {
    evt.preventDefault();
    if (etat.publicationEnCours) return; // évite les doublons
    const form = evt.currentTarget;
    $('#erreur-publier').hidden = true;

    if (!etat.fichiers.length) return afficherErreurPublier('Ajoute au moins un fichier.', $('#champ-fichiers'));
    for (const nom of ['titre', 'matiere', 'type_document']) {
      if (!form.elements[nom].value.trim()) {
        const libelle = { titre: 'un titre', matiere: 'une matière', type_document: 'un type de document' }[nom];
        return afficherErreurPublier(`Indique ${libelle}.`, form.elements[nom]);
      }
    }

    const bouton = $('#bouton-publier');
    etat.publicationEnCours = true;
    bouton.disabled = true;
    try {
      // Attendre la fin des lectures en cours pour ne pas perdre de texte.
      const lectures = etat.fichiers.map((i) => i.lecture).filter(Boolean);
      if (lectures.length) {
        bouton.textContent = 'Lecture du texte en cours…';
        await Promise.allSettled(lectures);
      }
      bouton.textContent = 'Préparation des fichiers…';
      const prets = await Promise.all(etat.fichiers.map((i) => i.preparation));

      await api.assurerSession();
      const meta = {
        titre: form.elements.titre.value.trim(),
        matiere: form.elements.matiere.value,
        type_document: form.elements.type_document.value,
        cours: form.elements.cours.value.trim(),
        etablissement: form.elements.etablissement.value.trim(),
        description: form.elements.description.value.trim(),
        texte_contenu: $('#champ-texte').value.trim(),
      };
      const note = await api.publierNote(prets, meta, (i, total) => {
        bouton.textContent = i < total ? `Envoi des fichiers ${i + 1}/${total}…` : 'Enregistrement…';
      });
      etat.notes.unshift(note);
      if (JPL.recherche) JPL.recherche.ajouter(note);
      reinitialiserFormulaire();
      JPL.toast('Note publiée.');
      location.hash = `#/note/${note.id}`;
    } catch (err) {
      console.error(err);
      afficherErreurPublier(`La note n'a pas été publiée. ${JPL.messageErreur(err)}`);
    } finally {
      etat.publicationEnCours = false;
      bouton.disabled = false;
      bouton.textContent = 'Publier la note';
    }
  }

  // ------------------------------------------------------------------
  // Démarrage
  // ------------------------------------------------------------------
  function initialiser() {
    const entreesTypes = Object.entries(TYPES);
    const entreesMatieres = MATIERES.map((m) => [m, m]);
    remplirSelect($('#filtre-matiere'), entreesMatieres);
    remplirSelect($('#filtre-type'), entreesTypes);
    remplirSelect(document.querySelector('[name="matiere"]'), entreesMatieres);
    remplirSelect(document.querySelector('[name="type_document"]'), entreesTypes);

    const accepte = FORMATS.flatMap((f) => f.extensions.map((e) => `.${e}`)).join(',');
    $('#champ-fichiers').setAttribute('accept', accepte);
    if (JPL.extraction) {
      $('#aide-fichiers').textContent = "Photos de tes notes, ou documents PDF, Word (.docx), Markdown et texte. Notion ou Google Docs : exporte en PDF, DOCX ou Markdown. Jusqu'à 10 fichiers, 10 Mo chacun.";
    }

    const relancer = JPL.debounce(afficherCatalogue, 120);
    $('#champ-recherche').addEventListener('input', relancer);
    $('#filtre-matiere').addEventListener('change', afficherCatalogue);
    $('#filtre-type').addEventListener('change', afficherCatalogue);

    $('#champ-fichiers').addEventListener('change', (e) => {
      ajouterFichiers(Array.from(e.target.files));
      e.target.value = '';
    });
    const depot = document.querySelector('.depot');
    depot.addEventListener('dragover', (e) => { e.preventDefault(); depot.classList.add('survol'); });
    depot.addEventListener('dragleave', () => depot.classList.remove('survol'));
    depot.addEventListener('drop', (e) => {
      e.preventDefault();
      depot.classList.remove('survol');
      ajouterFichiers(Array.from(e.dataTransfer.files));
    });
    $('#form-publier').addEventListener('submit', publier);
    $('#dialog-image').addEventListener('click', (e) => { if (e.target.id === 'dialog-image') e.target.close(); });

    window.addEventListener('hashchange', afficherRoute);
    afficherRoute();

    // La session anonyme est créée en arrière-plan ; la lecture du catalogue n'en dépend pas.
    api.assurerSession()
      .then(() => { if (routeActuelle().vue === 'note') afficherDetail(routeActuelle().id); })
      .catch((err) => {
        console.error(err);
        JPL.toast(`Publication indisponible. ${JPL.messageErreur(err)}`, 'erreur');
      });
    chargerNotes();
  }

  initialiser();
})();
