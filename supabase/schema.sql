-- =====================================================================
-- J'étais pas là — schéma Supabase (tables, index, RLS, Storage)
-- Idempotent : peut être relancé dans le SQL Editor sans erreur.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Table notes
-- ---------------------------------------------------------------------
create table if not exists public.notes (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid()
                references auth.users (id) on delete cascade,
  titre         text not null check (char_length(titre) between 1 and 150),
  matiere       text not null check (char_length(matiere) between 1 and 80),
  cours         text not null default '' check (char_length(cours) <= 80),
  etablissement text not null default '' check (char_length(etablissement) <= 120),
  type_document text not null check (type_document in
                  ('notes_de_cours', 'resume', 'exercices', 'preparation_examen', 'autre')),
  description   text not null default '' check (char_length(description) <= 2000),
  -- Texte OCR (photos) ou texte extrait (documents numériques), corrigé par l'auteur.
  texte_contenu text not null default '' check (char_length(texte_contenu) <= 100000),
  -- [{ "chemin": "<uid>/<uuid>.jpg", "type": "image/jpeg", "nom": "page1.jpg" }, ...]
  fichiers      jsonb not null default '[]'::jsonb check (
                  jsonb_typeof(fichiers) = 'array'
                  and jsonb_array_length(fichiers) between 1 and 10),
  created_at    timestamptz not null default now()
);

create index if not exists notes_created_at_idx on public.notes (created_at desc);
create index if not exists notes_owner_id_idx   on public.notes (owner_id);

alter table public.notes enable row level security;

-- Les tables créées par "postgres" n'accordent pas SELECT/INSERT par défaut.
revoke all on public.notes from anon, authenticated;
grant select on public.notes to anon, authenticated;
grant insert, delete on public.notes to authenticated;

drop policy if exists "notes_select_tous"       on public.notes;
drop policy if exists "notes_insert_proprio"    on public.notes;
drop policy if exists "notes_delete_proprio"    on public.notes;

-- Tout le monde peut lire le catalogue partagé.
create policy "notes_select_tous" on public.notes
  for select to anon, authenticated
  using (true);

-- On ne publie qu'en son propre nom.
create policy "notes_insert_proprio" on public.notes
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

-- On ne supprime que ses propres notes. Aucune politique UPDATE : pas de modification.
create policy "notes_delete_proprio" on public.notes
  for delete to authenticated
  using (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- 2. Table signalements (P2) — écriture seule côté client
-- ---------------------------------------------------------------------
create table if not exists public.signalements (
  id         uuid primary key default gen_random_uuid(),
  note_id    uuid not null references public.notes (id) on delete cascade,
  owner_id   uuid not null default auth.uid()
             references auth.users (id) on delete cascade,
  raison     text not null check (char_length(raison) between 1 and 500),
  created_at timestamptz not null default now(),
  unique (note_id, owner_id)
);

create index if not exists signalements_note_id_idx  on public.signalements (note_id);
create index if not exists signalements_owner_id_idx on public.signalements (owner_id);

alter table public.signalements enable row level security;

revoke all on public.signalements from anon, authenticated;
grant insert on public.signalements to authenticated;

drop policy if exists "signalements_insert_proprio" on public.signalements;

create policy "signalements_insert_proprio" on public.signalements
  for insert to authenticated
  with check (owner_id = (select auth.uid()));
-- Pas de SELECT : les signalements se consultent dans le tableau de bord.

-- ---------------------------------------------------------------------
-- 3. Storage : bucket notes-fichiers
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'notes-fichiers', 'notes-fichiers', true, 10485760, -- 10 Mo
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/markdown', 'text/plain'
  ]
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Bucket public : lecture des fichiers par URL publique, sans politique SELECT générale
-- (empêche de lister le contenu du bucket).

drop policy if exists "notes_fichiers_insert_proprio" on storage.objects;
drop policy if exists "notes_fichiers_select_proprio" on storage.objects;
drop policy if exists "notes_fichiers_delete_proprio" on storage.objects;

-- Téléversement uniquement dans son propre dossier <uid>/...
create policy "notes_fichiers_insert_proprio" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'notes-fichiers'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- SELECT sur ses propres fichiers : requis par l'API pour pouvoir les supprimer.
create policy "notes_fichiers_select_proprio" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'notes-fichiers'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Suppression uniquement de ses propres fichiers.
create policy "notes_fichiers_delete_proprio" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'notes-fichiers'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ---------------------------------------------------------------------
-- 4. Table notes_pages : texte et position des mots, par fichier et par page.
--    Lue seulement sur la page d'une note (localisation d'un résultat de
--    recherche) ; le catalogue n'en dépend pas.
-- ---------------------------------------------------------------------
create table if not exists public.notes_pages (
  note_id uuid not null references public.notes (id) on delete cascade,
  fichier smallint not null check (fichier between 0 and 9),
  page    smallint not null check (page between 0 and 199),
  texte   text not null default '' check (char_length(texte) <= 200000),
  -- [[x, y, largeur, hauteur, "mot"], ...] — coordonnées normalisées 0–1
  mots    jsonb not null default '[]'::jsonb check (
            jsonb_typeof(mots) = 'array' and octet_length(mots::text) <= 500000),
  primary key (note_id, fichier, page)
);

alter table public.notes_pages enable row level security;

revoke all on public.notes_pages from anon, authenticated;
grant select on public.notes_pages to anon, authenticated;
grant insert on public.notes_pages to authenticated;

drop policy if exists "notes_pages_select_tous"    on public.notes_pages;
drop policy if exists "notes_pages_insert_proprio" on public.notes_pages;

create policy "notes_pages_select_tous" on public.notes_pages
  for select to anon, authenticated
  using (true);

-- Seul l'auteur de la note peut lui ajouter des pages. Pas de mise à jour ni
-- de suppression directe : les pages disparaissent avec la note (cascade).
create policy "notes_pages_insert_proprio" on public.notes_pages
  for insert to authenticated
  with check (exists (
    select 1 from public.notes n
    where n.id = note_id and n.owner_id = (select auth.uid())
  ));

-- ---------------------------------------------------------------------
-- 5. Durcissement : fonction d'event trigger fournie par Supabase
--    (active RLS automatiquement). Inutile de l'exposer via /rpc.
-- ---------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;
