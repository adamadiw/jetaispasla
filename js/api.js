// Accès à Supabase : session anonyme, notes, fichiers, signalements.
(function () {
  'use strict';
  const JPL = (window.JPL = window.JPL || {});
  const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, BUCKET } = window.JPL_CONFIG;

  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true },
  });

  const LIMITE_NOTES = 500;
  let utilisateurId = null;
  let sessionEnCours = null;

  // Crée une session anonyme au premier passage, puis la réutilise (localStorage).
  function assurerSession() {
    if (utilisateurId) return Promise.resolve(utilisateurId);
    if (!sessionEnCours) {
      sessionEnCours = (async () => {
        const { data: { session } } = await client.auth.getSession();
        if (session) {
          utilisateurId = session.user.id;
          return utilisateurId;
        }
        const { data, error } = await client.auth.signInAnonymously();
        if (error) throw error;
        utilisateurId = data.user.id;
        return utilisateurId;
      })().finally(() => { sessionEnCours = null; });
    }
    return sessionEnCours;
  }

  async function chargerNotes() {
    const { data, error } = await client
      .from('notes')
      .select('id, owner_id, titre, matiere, cours, etablissement, type_document, description, texte_contenu, fichiers, created_at')
      .order('created_at', { ascending: false })
      .limit(LIMITE_NOTES);
    if (error) throw error;
    return data;
  }

  function urlPublique(chemin) {
    return client.storage.from(BUCKET).getPublicUrl(chemin).data.publicUrl;
  }

  // fichiers : [{ blob, nom, type, extension }]
  // meta : { titre, matiere, cours, etablissement, type_document, description, texte_contenu }
  async function publierNote(fichiers, meta, surProgression) {
    const uid = await assurerSession();
    const televerses = [];
    try {
      for (let i = 0; i < fichiers.length; i++) {
        const f = fichiers[i];
        surProgression && surProgression(i, fichiers.length);
        const chemin = `${uid}/${crypto.randomUUID()}.${f.extension}`;
        const { error } = await client.storage.from(BUCKET).upload(chemin, f.blob, {
          contentType: f.type,
          cacheControl: '31536000',
          upsert: false,
        });
        if (error) throw error;
        televerses.push({ chemin, type: f.type, nom: f.nom });
      }
      surProgression && surProgression(fichiers.length, fichiers.length);

      const { data, error } = await client
        .from('notes')
        .insert({ ...meta, fichiers: televerses })
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (err) {
      // Pas de fichiers orphelins si l'enregistrement échoue.
      if (televerses.length) {
        await client.storage.from(BUCKET).remove(televerses.map((t) => t.chemin)).catch(() => {});
      }
      throw err;
    }
  }

  async function supprimerNote(note) {
    await assurerSession();
    const { data, error } = await client.from('notes').delete().eq('id', note.id).select('id');
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error("permission denied: cette note ne vous appartient pas.");
    }
    const chemins = (note.fichiers || []).map((f) => f.chemin);
    if (chemins.length) {
      const { error: errStorage } = await client.storage.from(BUCKET).remove(chemins);
      if (errStorage) console.warn('Fichiers non supprimés :', errStorage);
    }
  }

  // Texte et position des mots par page (table notes_pages), pour localiser
  // un résultat de recherche. lignes : [{ fichier, page, texte, mots }]
  async function publierPages(noteId, lignes) {
    if (!lignes || !lignes.length) return;
    const { error } = await client
      .from('notes_pages')
      .insert(lignes.map((l) => ({ note_id: noteId, fichier: l.fichier, page: l.page, texte: l.texte || '', mots: l.mots || [] })));
    if (error) throw error;
  }

  async function chargerPages(noteId) {
    const { data, error } = await client
      .from('notes_pages')
      .select('fichier, page, texte, mots')
      .eq('note_id', noteId)
      .order('fichier', { ascending: true })
      .order('page', { ascending: true });
    if (error) throw error;
    return data;
  }

  async function signalerNote(noteId, raison) {
    await assurerSession();
    const { error } = await client.from('signalements').insert({ note_id: noteId, raison });
    if (error) {
      if (error.code === '23505') return 'deja';
      throw error;
    }
    return 'ok';
  }

  JPL.api = {
    client,
    assurerSession,
    utilisateurId: () => utilisateurId,
    chargerNotes,
    urlPublique,
    publierNote,
    supprimerNote,
    publierPages,
    chargerPages,
    signalerNote,
  };
})();
