// Localisation d'un résultat de recherche : quelle page contient les mots
// cherchés, et où sont ces mots sur l'image. Logique pure, sans DOM.
// Même tolérance que la recherche : accents, casse, début de mot, petites fautes
// (pour retrouver « Socrate » quand l'OCR brut a lu « Socrafe »).
(function () {
  'use strict';
  const JPL = (window.JPL = window.JPL || {});

  const SEPARATEUR = /[^\p{L}\p{N}]+/u;

  function borner(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return 0;
    return Math.min(1, Math.max(0, x));
  }

  function termes(requete) {
    const vus = new Set();
    return JPL.normaliser(requete)
      .split(SEPARATEUR)
      .filter((t) => t.length >= 2 && !JPL.MOTS_VIDES.has(t) && !vus.has(t) && vus.add(t));
  }

  // Distance d'édition, arrêtée dès qu'elle dépasse `max`.
  function distance(a, b, max) {
    let precedente = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const courante = [i];
      let minLigne = i;
      for (let j = 1; j <= b.length; j++) {
        const cout = a[i - 1] === b[j - 1] ? 0 : 1;
        courante[j] = Math.min(precedente[j] + 1, courante[j - 1] + 1, precedente[j - 1] + cout);
        if (courante[j] < minLigne) minLigne = courante[j];
      }
      if (minLigne > max) return max + 1;
      precedente = courante;
    }
    return precedente[b.length];
  }

  // `terme` est déjà normalisé (sortie de termes()).
  function correspond(mot, terme) {
    const m = JPL.normaliser(mot).replace(/[^\p{L}\p{N}]/gu, '');
    if (!m || !terme) return false;
    if (m === terme) return true;
    if (terme.length >= 3 && m.startsWith(terme)) return true;
    if (terme.length >= 4) {
      const max = Math.round(0.2 * terme.length);
      if (Math.abs(m.length - terme.length) > max) return false;
      return distance(m, terme, max) <= max;
    }
    return false;
  }

  function meilleurePage(pages, listeTermes) {
    if (!Array.isArray(pages) || !listeTermes || !listeTermes.length) return null;
    let meilleure = null;
    for (const p of pages) {
      const mots = new Set(String((p && p.texte) || '').split(SEPARATEUR).filter(Boolean));
      let score = 0;
      for (const t of listeTermes) {
        for (const mot of mots) {
          if (correspond(mot, t)) { score++; break; }
        }
      }
      if (score === 0) continue;
      const fichier = Number(p.fichier) || 0;
      const page = Number(p.page) || 0;
      if (!meilleure || score > meilleure.score
        || (score === meilleure.score && (fichier < meilleure.fichier || (fichier === meilleure.fichier && page < meilleure.page)))) {
        meilleure = { fichier, page, score };
      }
    }
    return meilleure;
  }

  function boitesCorrespondantes(mots, listeTermes) {
    if (!Array.isArray(mots) || !listeTermes || !listeTermes.length) return [];
    const boites = [];
    for (const m of mots) {
      if (!Array.isArray(m) || m.length < 5 || typeof m[4] !== 'string') continue;
      if (listeTermes.some((t) => correspond(m[4], t))) {
        boites.push([borner(m[0]), borner(m[1]), borner(m[2]), borner(m[3])]);
      }
    }
    return boites;
  }

  JPL.localisation = { termes, correspond, meilleurePage, boitesCorrespondantes, borner };
})();
