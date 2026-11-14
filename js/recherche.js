// Recherche plein texte dans le navigateur avec MiniSearch :
// tolérante aux fautes (texte OCR imparfait), aux accents et aux débuts de mots.
(function () {
  'use strict';
  const JPL = (window.JPL = window.JPL || {});
  if (!window.MiniSearch) {
    console.warn('MiniSearch indisponible : recherche simple utilisée.');
    return;
  }

  const MOTS_VIDES = JPL.MOTS_VIDES;

  const CHAMPS = ['titre', 'matiere', 'cours', 'etablissement', 'description', 'texte_contenu'];

  function traiterTerme(terme) {
    const t = JPL.normaliser(terme);
    return MOTS_VIDES.has(t) ? null : t;
  }

  const options = {
    idField: 'id',
    fields: CHAMPS,
    storeFields: ['matiere', 'type_document'],
    processTerm: traiterTerme,
    searchOptions: {
      boost: { titre: 3, cours: 2, matiere: 1.5 },
      // Préfixe dès 3 lettres (« socr » -> Socrate), fautes tolérées dès 4 lettres
      // (« socrat », « sokrate », « Socrafe » lu par l'OCR).
      prefix: (terme) => terme.length >= 3,
      fuzzy: (terme) => (terme.length >= 4 ? 0.2 : false),
      combineWith: 'AND',
    },
  };

  let index = null;
  let notesParId = new Map();

  function indexer(notes) {
    index = new window.MiniSearch(options);
    notesParId = new Map(notes.map((n) => [n.id, n]));
    index.addAll(notes);
  }

  function ajouter(note) {
    if (!index) return indexer([note]);
    notesParId.set(note.id, note);
    index.add(note);
  }

  function retirer(note) {
    if (!index || !notesParId.has(note.id)) return;
    index.discard(note.id);
    notesParId.delete(note.id);
  }

  // Retourne [{ note, termes }] ; termes = mots trouvés dans la note (pour le surlignage).
  function chercher({ requete, matiere, type }) {
    const filtre = (r) => (!matiere || r.matiere === matiere) && (!type || r.type_document === type);

    if (!requete.trim()) {
      // Pas de requête : toutes les notes filtrées, les plus récentes d'abord.
      return Array.from(notesParId.values())
        .filter((n) => filtre(n))
        .map((note) => ({ note, termes: [] }));
    }

    // Tous les mots d'abord ; si rien ne correspond, au moins un des mots.
    let resultats = index.search(requete, { filter: filtre });
    if (!resultats.length) resultats = index.search(requete, { filter: filtre, combineWith: 'OR' });

    return resultats
      .map((r) => ({ note: notesParId.get(r.id), termes: r.terms }))
      .filter((r) => r.note);
  }

  // Suggestion de mot proche quand rien n'est trouvé.
  function suggerer(requete) {
    if (!index || !requete.trim()) return null;
    const [premiere] = index.autoSuggest(requete, { fuzzy: 0.3 });
    return premiere ? premiere.suggestion : null;
  }

  JPL.recherche = {
    pret: () => index !== null,
    indexer,
    ajouter,
    retirer,
    chercher,
    suggerer,
  };
})();
