// OCR dans le navigateur avec Tesseract.js (français + anglais).
// La bibliothèque n'est téléchargée qu'au premier fichier image ajouté.
(function () {
  'use strict';
  const JPL = (window.JPL = window.JPL || {});

  const SCRIPT_TESSERACT = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js';
  const SRI_TESSERACT = 'sha384-2BQ3U3OdKOb0Uczxqr41I9UvZkzr4V9Hv8uSzMMZAlmhsFClvdZX5wi5fDCzG+tM';
  const LANGUES = ['fra', 'eng'];
  const DELAI_MAX_MS = 120000; // une image qui bloque ne doit pas bloquer la publication

  let promesseWorker = null;
  let fileAttente = Promise.resolve();
  let rapporterProgression = null; // progression du travail en cours

  function chargerScript(src, integrite) {
    return new Promise((resolve, reject) => {
      if (window.Tesseract) return resolve();
      const s = document.createElement('script');
      s.src = src;
      s.integrity = integrite;
      s.crossOrigin = 'anonymous';
      s.onload = resolve;
      s.onerror = () => reject(new Error('Téléchargement du moteur de lecture impossible.'));
      document.head.append(s);
    });
  }

  function messageProgression(m) {
    const pourcent = Math.round((m.progress || 0) * 100);
    switch (m.status) {
      case 'recognizing text': return `Lecture du texte… ${pourcent} %`;
      case 'loading language traineddata':
        return `Téléchargement du dictionnaire français/anglais… ${pourcent} % (une seule fois)`;
      default: return 'Préparation de la lecture…';
    }
  }

  function obtenirWorker() {
    if (!promesseWorker) {
      promesseWorker = (async () => {
        await chargerScript(SCRIPT_TESSERACT, SRI_TESSERACT);
        return window.Tesseract.createWorker(LANGUES, 1, {
          logger: (m) => rapporterProgression && rapporterProgression(messageProgression(m)),
        });
      })();
      promesseWorker.catch(() => { promesseWorker = null; });
    }
    return promesseWorker;
  }

  async function reinitialiser() {
    const ancien = promesseWorker;
    promesseWorker = null;
    if (ancien) {
      try { (await ancien).terminate(); } catch (_) { /* déjà arrêté */ }
    }
  }

  // Nettoie la sortie brute : retire les lignes de bruit (traits, lignes du cahier…).
  function nettoyer(texte) {
    return texte
      .split('\n')
      .map((ligne) => ligne.replace(/[ \t]+/g, ' ').trim())
      .filter((ligne) => {
        const lettres = (ligne.match(/[\p{L}\p{N}]/gu) || []).length;
        return lettres >= 2 && lettres / ligne.length >= 0.5;
      })
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  async function reconnaitre(blob, surProgression) {
    rapporterProgression = surProgression;
    const worker = await obtenirWorker();
    let minuteur;
    const delai = new Promise((_, reject) => {
      minuteur = setTimeout(() => reject(new Error('La lecture du texte a pris trop de temps.')), DELAI_MAX_MS);
    });
    try {
      const { data } = await Promise.race([worker.recognize(blob), delai]);
      return nettoyer(data.text || '');
    } catch (err) {
      await reinitialiser(); // repart d'un worker propre pour l'image suivante
      throw err;
    } finally {
      clearTimeout(minuteur);
      rapporterProgression = null;
    }
  }

  // Interface attendue par app.js : lireTexte(item, surProgression) -> Promise<string>
  // Les images sont traitées une à la fois, dans l'ordre d'ajout.
  function lireTexte(item, surProgression) {
    const travail = fileAttente.then(() => {
      surProgression('Lecture du texte…');
      return reconnaitre(item.pret.blob, surProgression);
    });
    fileAttente = travail.catch(() => {});
    return travail;
  }

  JPL.ocr = { lireTexte, nettoyer };
})();
