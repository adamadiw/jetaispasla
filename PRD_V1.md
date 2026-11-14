# PRD et instructions d'implémentation — J'étais pas là

## Rôle de Claude Code

Tu es responsable du développement technique du MVP de **J'étais pas là**, un site web de partage de notes étudiantes pour un hackathon. **Implémente les fonctionnalités dans le dépôt existant** : ne te limite pas à rédiger des recommandations. Ne prépare **aucune présentation, aucun pitch, aucune diapositive et aucun slogan** : ce n'est pas ton rôle.

Commence par inspecter les fichiers réels du dépôt et identifier les fonctionnalités déjà opérationnelles. Conserve le fonctionnement existant autant que possible. Si une décision technique manque, choisis l'option la plus simple et fiable pour un hackathon et documente-la brièvement.

## Objectif produit

Permettre à des étudiants du cégep et de l'université de :
1. Publier des photos de notes de cours avec leurs métadonnées.
2. Retrouver les notes publiées par **d'autres utilisateurs**, depuis un autre navigateur ou ordinateur.
3. Rechercher des notions figurant **dans les photos** grâce à l'extraction OCR, en plus des titres, matières et descriptions.
4. Consulter les photos originales d'un document.

Scénario critique : un étudiant publie une photo manuscrite contenant « Socrate » ; un autre étudiant recherche « Socrate » sur un autre appareil et retrouve le document.

## Décisions non négociables

- **Supabase est obligatoire** pour la base de données partagée et le stockage des images.
- **L'OCR est obligatoire** : le texte extrait des images doit être enregistré et interrogeable. Ne remplace pas l'OCR par une simple recherche dans les métadonnées.
- Conserver **HTML, CSS et JavaScript vanilla**. Ne pas migrer vers React/Vite ou introduire une chaîne de compilation sans nécessité impérieuse.
- Pas de système de présentation, de pitch, de slides, de slogan ou de fonctionnalités hors périmètre.
- Prioriser un parcours complet et fiable plutôt que des fonctions accessoires.
- Ne jamais exposer de clé `service_role` Supabase ni de secret côté navigateur. Utiliser uniquement une clé publique prévue pour le client, avec des politiques RLS et Storage adaptées.

## État connu du prototype (à vérifier dans le dépôt)

Fichiers initiaux : `index.html`, `script.js`, `style.css`, `README.md`.

Le prototype utilise actuellement IndexedDB pour stocker localement les notes et leurs images. Il comprend :
- Navigation entre accueil, formulaire de publication et détails.
- Publication de plusieurs images avec titre, matière, cours, établissement, type et description.
- Filtres par matière et type de document.
- Recherche textuelle insensible aux accents dans les métadonnées.
- Consultation des photos et suppression locale.
- Un CSS a été proposé ; vérifier son intégration réelle.

Le développeur a validé les tests fonctionnels de la version locale. **Ne présume pas que Supabase ou l'OCR sont déjà connectés.** Vérifie l'état réel du code avant toute modification.

## Fonctionnalités requises — MVP

### P0 — Stockage partagé avec Supabase

- Connecter le frontend à un projet Supabase via le SDK JavaScript compatible avec un site statique.
- Créer une table `notes` contenant au minimum : `id`, `titre`, `matiere`, `cours`, `etablissement`, `type_document`, `description`, `texte_ocr`, `created_at` et les informations nécessaires à l'affichage des images.
- Prévoir un bucket Supabase Storage pour les photos, avec chemins de fichiers uniques.
- À la publication : téléverser les images, enregistrer les métadonnées et les références aux images, puis afficher le document dans le catalogue partagé.
- Au chargement : récupérer les notes depuis Supabase, pas uniquement IndexedDB.
- Ajouter des états de chargement et des messages d'erreur compréhensibles.
- Prévoir un fichier SQL de migration (`supabase/schema.sql` ou équivalent) comprenant tables, index et politiques de sécurité.
- Pour la suppression : ne pas laisser n'importe quel visiteur supprimer les notes de tous. Si l'authentification n'est pas implémentée, retirer/désactiver la suppression publique plutôt que créer une politique dangereuse.

### P0 — OCR des images

- Intégrer un vrai moteur OCR compatible avec le temps et les contraintes du projet (par exemple Tesseract.js dans le navigateur, ou un service OCR si sa configuration est disponible).
- Extraire le texte des images **lors de la publication** et stocker le résultat dans `texte_ocr` dans Supabase.
- Conserver la publication même lorsque l'OCR échoue : afficher un avertissement et enregistrer la note avec texte OCR vide ou partiel.
- Montrer une progression ou un état « Analyse des images… » pendant le traitement.
- Tester au moins une image de notes manuscrites et une image de texte imprimé. L'écriture manuscrite est moins fiable ; ne pas prétendre atteindre une précision non mesurée.
- Permettre à l'utilisateur de corriger ou compléter le texte OCR si cela peut être fait simplement ; sinon, conserver une description et des mots-clés manuels en complément.

### P0 — Recherche commune

- Rechercher dans `titre`, `matiere`, `cours`, `etablissement`, `description` **et** `texte_ocr`.
- Garder les filtres matière et type de document.
- Les résultats doivent être visibles depuis un second navigateur/appareil connecté au même Supabase.
- Prévoir une recherche insensible à la casse ; conserver si possible la recherche sans accents.
- Ne pas relancer l'OCR à chaque recherche.

### P1 — Interface et fiabilité

- Conserver et améliorer le CSS existant ; interface utilisable sur mobile et ordinateur.
- Afficher un aperçu de la première image sur chaque carte de note.
- Permettre de consulter toutes les images en détail.
- Valider les fichiers (types image, limites de taille et nombre raisonnable de photos).
- Éviter les doublons de publication lors des clics répétés.
- Afficher des états vides et des erreurs utiles.
- Éviter les injections HTML : insérer les contenus utilisateurs via `textContent` ou équivalent sûr.

## Contraintes de sécurité et de contenu

- Configurer les politiques RLS Supabase explicitement. Ne jamais désactiver la sécurité comme raccourci.
- Configurer les permissions Storage pour autoriser les lectures nécessaires, limiter les écritures et empêcher les suppressions arbitraires.
- Si une politique de publication sûre nécessite une identité, privilégier une authentification anonyme Supabase ou un mécanisme simple compatible avec le hackathon ; expliquer les étapes de configuration requises.
- Ne jamais committer de secrets. Fournir un exemple de configuration sans identifiants privés.
- Ajouter un rappel discret de ne publier que ses propres notes ou des documents partagés avec autorisation, sans données personnelles sensibles.

## Mode de travail demandé

1. **Inspecte le dépôt** et résume brièvement les fichiers et fonctionnalités réellement présents.
2. **Implémente** la connexion Supabase, les migrations SQL et le stockage partagé.
3. **Implémente** l'OCR et la sauvegarde du texte extrait.
4. **Relie** la recherche aux métadonnées et au texte OCR dans Supabase.
5. **Teste** le parcours de bout en bout et corrige les erreurs détectées.
6. **Documente** dans le README uniquement ce qui est nécessaire pour lancer et configurer le projet : URL du projet Supabase, clé publique, exécution SQL, bucket, politiques, démarrage local.
7. À la fin, fournis un compte rendu technique concis : fichiers modifiés, fonctionnalités implémentées, tests effectués, paramètres Supabase à renseigner, limites restantes.

**Ne t'arrête pas après un plan** : réalise les changements dans le code. Si des identifiants Supabase ou une action dans le tableau de bord sont indispensables, implémente tout ce qui peut l'être sans eux et donne la liste exacte des actions manuelles bloquantes. Ne prétends pas avoir testé une connexion distante sans accès réel au projet Supabase.

## Critères d'acceptation

- [ ] Le site fonctionne en HTML/CSS/JS sans npm obligatoire.
- [ ] Une note et ses images peuvent être publiées dans Supabase.
- [ ] La note est visible depuis un autre navigateur ou ordinateur.
- [ ] Le texte d'une photo est extrait par OCR lors de la publication.
- [ ] Une recherche sur un mot présent dans le texte OCR retrouve la note.
- [ ] Les filtres matière/type fonctionnent avec les données partagées.
- [ ] Les images s'ouvrent correctement.
- [ ] Une erreur OCR n'empêche pas la publication.
- [ ] Les accès en écriture/suppression sont protégés ; aucun secret serveur n'est exposé.
- [ ] Le README permet de reproduire la configuration.

## Hors périmètre

Présentations, pitch, slides, slogan, messagerie, likes, abonnements, profils élaborés, recommandation algorithmique, migration vers un framework, monétisation et architecture de production complexe.
