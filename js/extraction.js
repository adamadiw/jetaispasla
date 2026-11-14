// Extraction du texte des documents numériques : .md, .txt, .pdf, .docx.
// Les bibliothèques (pdf.js, mammoth) ne sont téléchargées qu'au besoin.
(function () {
  'use strict';
  const JPL = (window.JPL = window.JPL || {});

  const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.5.438/build/pdf.min.mjs';
  const PDFJS_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.5.438/build/pdf.worker.min.mjs';
  const MAMMOTH = 'https://cdn.jsdelivr.net/npm/mammoth@1.13.0/mammoth.browser.min.js';
  const SRI_MAMMOTH = 'sha384-8NWE3bZDrmRI4IePMoQaEoLhAQ1MmRMJkdNgnGiHRFanTqsFKr0TmK6aSZvFJ/PO';

  const MAX_PAGES_TEXTE = 200;  // PDF numériques : texte des 200 premières pages
  const MAX_PAGES_OCR = 5;      // PDF scannés : OCR des 5 premières pages
  const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  const FORMATS = [
    { famille: 'pdf', extensions: ['pdf'], mime: /^application\/pdf$/ },
    { famille: 'docx', extensions: ['docx'], mime: /wordprocessingml\.document$/ },
    { famille: 'texte', extensions: ['md', 'markdown', 'txt'], mime: /^text\/(plain|markdown)$/ },
  ];

  // Type MIME normalisé (les navigateurs donnent souvent '' pour .md).
  function preparerDocument(fichier, famille) {
    const ext = (fichier.name.split('.').pop() || '').toLowerCase();
    if (famille === 'pdf') return { blob: fichier, type: 'application/pdf', extension: 'pdf' };
    if (famille === 'docx') return { blob: fichier, type: MIME_DOCX, extension: 'docx' };
    const markdown = ext === 'md' || ext === 'markdown';
    return { blob: fichier, type: markdown ? 'text/markdown' : 'text/plain', extension: markdown ? 'md' : 'txt' };
  }

  // ---------------------------------------------------------------- PDF
  let promessePdfjs = null;
  function chargerPdfjs() {
    if (!promessePdfjs) {
      promessePdfjs = import(PDFJS).then((pdfjs) => {
        pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
        return pdfjs;
      });
      promessePdfjs.catch(() => { promessePdfjs = null; });
    }
    return promessePdfjs;
  }

  async function textePdf(fichier, surProgression) {
    surProgression('Ouverture du PDF…');
    const pdfjs = await chargerPdfjs();
    const chargement = pdfjs.getDocument({ data: new Uint8Array(await fichier.arrayBuffer()) });
    const doc = await chargement.promise;
    try {
      const nbPages = Math.min(doc.numPages, MAX_PAGES_TEXTE);
      const pages = [];
      for (let i = 1; i <= nbPages; i++) {
        surProgression(`Lecture du PDF… page ${i}/${nbPages}`);
        const page = await doc.getPage(i);
        const contenu = await page.getTextContent();
        pages.push(contenu.items.map((it) => (it.str || '') + (it.hasEOL ? '\n' : ' ')).join(''));
        page.cleanup();
      }
      const texte = pages.join('\n\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
      // Peu ou pas de texte : probablement un PDF scanné -> OCR des pages.
      if (texte.replace(/\s/g, '').length >= 20 * nbPages || !JPL.ocr) return texte;
      return await ocrPdf(doc, surProgression);
    } finally {
      // Libère le worker pdf.js ; une erreur de nettoyage ne doit pas faire perdre le texte.
      Promise.resolve().then(() => chargement.destroy()).catch(() => {});
    }
  }

  async function ocrPdf(doc, surProgression) {
    const nbPages = Math.min(doc.numPages, MAX_PAGES_OCR);
    const textes = [];
    for (let i = 1; i <= nbPages; i++) {
      surProgression(`PDF scanné : lecture de la page ${i}/${nbPages}…`);
      const page = await doc.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(3, 2000 / Math.max(base.width, base.height)) });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      page.cleanup();
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.9));
      const texte = await JPL.ocr.lireTexte({ pret: { blob } }, (msg) =>
        surProgression(`PDF scanné, page ${i}/${nbPages} : ${msg.charAt(0).toLowerCase()}${msg.slice(1)}`));
      if (texte) textes.push(texte);
    }
    return textes.join('\n\n');
  }

  // --------------------------------------------------------------- DOCX
  let promesseMammoth = null;
  function chargerMammoth() {
    if (window.mammoth) return Promise.resolve(window.mammoth);
    if (!promesseMammoth) {
      promesseMammoth = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = MAMMOTH;
        s.integrity = SRI_MAMMOTH;
        s.crossOrigin = 'anonymous';
        s.onload = () => resolve(window.mammoth);
        s.onerror = () => reject(new Error('Téléchargement du lecteur Word impossible.'));
        document.head.append(s);
      });
      promesseMammoth.catch(() => { promesseMammoth = null; });
    }
    return promesseMammoth;
  }

  async function texteDocx(fichier, surProgression) {
    surProgression('Lecture du document Word…');
    const mammoth = await chargerMammoth();
    const { value } = await mammoth.extractRawText({ arrayBuffer: await fichier.arrayBuffer() });
    return value.replace(/\n{3,}/g, '\n\n').trim();
  }

  // ---------------------------------------------------------- Interface
  // Même interface que JPL.ocr : lireTexte(item, surProgression) -> Promise<string>
  async function lireTexte(item, surProgression) {
    const fichier = item.fichier;
    if (item.famille === 'texte') return (await fichier.text()).replace(/\r\n/g, '\n');
    if (item.famille === 'pdf') return textePdf(fichier, surProgression);
    if (item.famille === 'docx') return texteDocx(fichier, surProgression);
    return '';
  }

  JPL.extraction = { FORMATS, preparerDocument, lireTexte };
})();
