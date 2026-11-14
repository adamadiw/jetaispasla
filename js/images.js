// Redimensionne les photos côté navigateur avant l'OCR et le téléversement.
(function () {
  'use strict';
  const JPL = (window.JPL = window.JPL || {});

  const COTE_MAX = 2000;   // px — assez pour l'OCR, bien plus léger qu'une photo de téléphone
  const QUALITE = 0.85;

  async function decoder(fichier) {
    if ('createImageBitmap' in window) {
      try {
        // Respecte l'orientation EXIF (photos de téléphone prises en portrait).
        return await createImageBitmap(fichier, { imageOrientation: 'from-image' });
      } catch (_) { /* repli sur <img> ci-dessous */ }
    }
    const url = URL.createObjectURL(fichier);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  // Retourne { blob, type, extension, redimensionnee }.
  // Si le navigateur ne sait pas décoder l'image (ex. HEIC hors Safari), renvoie l'original.
  async function preparerImage(fichier) {
    let source;
    try {
      source = await decoder(fichier);
    } catch (_) {
      const extension = (fichier.name.split('.').pop() || 'jpg').toLowerCase();
      return { blob: fichier, type: fichier.type, extension, redimensionnee: false, lisible: false };
    }
    const largeur = source.width;
    const hauteur = source.height;
    const echelle = Math.min(1, COTE_MAX / Math.max(largeur, hauteur));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(largeur * echelle);
    canvas.height = Math.round(hauteur * echelle);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; // fond blanc pour les PNG transparents
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    if (source.close) source.close();

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Conversion de l’image impossible.'))), 'image/jpeg', QUALITE);
    });
    return { blob, type: 'image/jpeg', extension: 'jpg', redimensionnee: echelle < 1, lisible: true };
  }

  JPL.images = { preparerImage };
})();
