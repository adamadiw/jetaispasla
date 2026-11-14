// Rendu sûr des documents Word et Markdown, et surlignage de mots.
// Tout HTML issu d'un fichier publié passe par DOMPurify avant d'entrer dans la page.
(function () {
  'use strict';
  const JPL = (window.JPL = window.JPL || {});

  const DOMPURIFY = 'https://cdn.jsdelivr.net/npm/dompurify@3.4.18/dist/purify.min.js';
  const SRI_DOMPURIFY = 'sha384-lkArbWjiZKuE+bzKbj1vOEF7DKYBDNvgwZMCt5OH8bdRB92zpzyNska9Q/XKPHQD';
  const MARKED = 'https://cdn.jsdelivr.net/npm/marked@18.2.0/lib/marked.umd.js';
  const SRI_MARKED = 'sha384-DDYDxilZ1LlqPSbaRHlrwh12h+3fUewuQj7HjscrZIWt5bGyQ+n0DHtIoZE3i3zU';

  const CONFIG_PURIFY = {
    RETURN_DOM_FRAGMENT: true,
    // Liens : web et courriel seulement (pas de javascript:, data:, etc.).
    // Les images intégrées en data:image restent permises (règle DOMPurify par balise).
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:)/i,
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select', 'iframe', 'object', 'embed', 'svg', 'math'],
    FORBID_ATTR: ['style'],
  };

  const promesses = {};
  function chargerScript(src, integrite, nomGlobal) {
    if (window[nomGlobal]) return Promise.resolve(window[nomGlobal]);
    if (!promesses[src]) {
      promesses[src] = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.integrity = integrite;
        s.crossOrigin = 'anonymous';
        s.onload = () => resolve(window[nomGlobal]);
        s.onerror = () => reject(new Error('Téléchargement du module d’affichage impossible.'));
        document.head.append(s);
      });
      promesses[src].catch(() => { delete promesses[src]; });
    }
    return promesses[src];
  }

  let purificateur = null;
  async function obtenirPurificateur() {
    if (purificateur) return purificateur;
    const DOMPurify = await chargerScript(DOMPURIFY, SRI_DOMPURIFY, 'DOMPurify');
    DOMPurify.addHook('afterSanitizeAttributes', (noeud) => {
      if (noeud.tagName === 'A' && noeud.hasAttribute('href')) {
        noeud.setAttribute('target', '_blank');
        noeud.setAttribute('rel', 'noopener noreferrer');
      }
    });
    purificateur = DOMPurify;
    return purificateur;
  }

  async function htmlSur(html) {
    const DOMPurify = await obtenirPurificateur();
    return DOMPurify.sanitize(String(html || ''), CONFIG_PURIFY);
  }

  async function markdown(texte) {
    const marked = await chargerScript(MARKED, SRI_MARKED, 'marked');
    return htmlSur(marked.parse(String(texte || ''), { async: false, gfm: true }));
  }

  async function docx(arrayBuffer) {
    const mammoth = await JPL.extraction.chargerMammoth();
    const { value } = await mammoth.convertToHtml({ arrayBuffer });
    return htmlSur(value);
  }

  // Entoure de <mark> les mots qui correspondent aux termes ; renvoie le premier <mark>.
  function surligner(racine, termes) {
    if (!racine || !termes || !termes.length) return null;
    const correspond = JPL.localisation.correspond;
    const marcheur = document.createTreeWalker(racine, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement && n.parentElement.closest('mark, script, style')
        ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    const noeuds = [];
    while (marcheur.nextNode()) noeuds.push(marcheur.currentNode);

    let premier = null;
    for (const noeud of noeuds) {
      const texte = noeud.nodeValue;
      const motif = /[\p{L}\p{N}]+/gu;
      let m;
      let curseur = 0;
      const fragment = document.createDocumentFragment();
      let trouve = false;
      while ((m = motif.exec(texte))) {
        if (!termes.some((t) => correspond(m[0], t))) continue;
        trouve = true;
        fragment.append(texte.slice(curseur, m.index));
        const mark = document.createElement('mark');
        mark.textContent = m[0];
        fragment.append(mark);
        if (!premier) premier = mark;
        curseur = m.index + m[0].length;
      }
      if (!trouve) continue;
      fragment.append(texte.slice(curseur));
      noeud.replaceWith(fragment);
    }
    return premier;
  }

  JPL.rendu = { htmlSur, markdown, docx, surligner };
})();
