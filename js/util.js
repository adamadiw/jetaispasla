// Utilitaires partagés. Tous les modules s'attachent à window.JPL.
(function () {
  'use strict';
  const JPL = (window.JPL = window.JPL || {});

  const MATIERES = [
    'Administration', 'Anglais', 'Biologie', 'Chimie', 'Droit', 'Économie',
    'Français', 'Géographie', 'Histoire', 'Informatique', 'Mathématiques',
    'Philosophie', 'Physique', 'Psychologie', 'Sociologie', 'Soins infirmiers', 'Autre',
  ];

  const TYPES = {
    notes_de_cours: 'Notes de cours',
    resume: 'Résumé',
    exercices: 'Exercices',
    preparation_examen: "Préparation d'examen",
    autre: 'Autre',
  };

  // Minuscules + suppression des accents : « Théorème » -> « theoreme ».
  function normaliser(texte) {
    return String(texte || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase();
  }

  // Création d'élément sûre : le texte passe toujours par textContent.
  function el(tag, props, ...enfants) {
    const node = document.createElement(tag);
    if (props) {
      for (const [cle, valeur] of Object.entries(props)) {
        if (valeur === undefined || valeur === null || valeur === false) continue;
        if (cle === 'class') node.className = valeur;
        else if (cle === 'text') node.textContent = valeur;
        else if (cle === 'dataset') Object.assign(node.dataset, valeur);
        else if (cle.startsWith('on') && typeof valeur === 'function') {
          node.addEventListener(cle.slice(2), valeur);
        } else if (valeur === true) node.setAttribute(cle, '');
        else node.setAttribute(cle, valeur);
      }
    }
    for (const enfant of enfants.flat()) {
      if (enfant === null || enfant === undefined || enfant === false) continue;
      node.append(enfant instanceof Node ? enfant : document.createTextNode(String(enfant)));
    }
    return node;
  }

  function formaterDate(iso) {
    const date = new Date(iso);
    const jours = Math.floor((Date.now() - date.getTime()) / 86400000);
    if (jours < 1) return "aujourd'hui";
    if (jours === 1) return 'hier';
    if (jours < 7) return `il y a ${jours} jours`;
    return date.toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function formaterTaille(octets) {
    if (octets < 1024 * 1024) return `${Math.max(1, Math.round(octets / 1024))} Ko`;
    return `${(octets / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`;
  }

  function debounce(fn, delai) {
    let minuteur;
    return (...args) => {
      clearTimeout(minuteur);
      minuteur = setTimeout(() => fn(...args), delai);
    };
  }

  let minuteurToast;
  function toast(message, type) {
    const zone = document.getElementById('toast');
    zone.textContent = message;
    zone.dataset.type = type || 'info';
    zone.hidden = false;
    clearTimeout(minuteurToast);
    minuteurToast = setTimeout(() => { zone.hidden = true; }, type === 'erreur' ? 7000 : 4000);
  }

  // Transforme une erreur Supabase/réseau en message compréhensible.
  function messageErreur(err) {
    const brut = (err && (err.message || err.error_description || err.msg)) || String(err);
    if (/anonymous_provider_disabled|Anonymous sign-ins are disabled/i.test(brut)) {
      return 'La connexion anonyme est désactivée dans Supabase. Activez-la dans Authentication → Sign In / Providers.';
    }
    if (/rate limit|too many/i.test(brut)) {
      return 'Trop de connexions depuis ce réseau. Réessayez dans quelques minutes.';
    }
    if (/Failed to fetch|NetworkError|network/i.test(brut)) {
      return 'Connexion impossible. Vérifiez votre accès Internet et réessayez.';
    }
    if (/mime type|invalid_mime_type/i.test(brut)) return "Ce type de fichier n'est pas accepté.";
    if (/maximum allowed size|Payload too large|too large/i.test(brut)) {
      return 'Un fichier dépasse la taille maximale de 10 Mo.';
    }
    if (/row-level security|permission denied/i.test(brut)) {
      return "Action refusée : vous ne pouvez modifier que vos propres notes.";
    }
    return brut;
  }

  JPL.MATIERES = MATIERES;
  JPL.TYPES = TYPES;
  JPL.normaliser = normaliser;
  JPL.el = el;
  JPL.formaterDate = formaterDate;
  JPL.formaterTaille = formaterTaille;
  JPL.debounce = debounce;
  JPL.toast = toast;
  JPL.messageErreur = messageErreur;
})();
